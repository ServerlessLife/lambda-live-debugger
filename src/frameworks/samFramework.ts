import * as fs from 'fs/promises';
import * as path from 'path';
import { EsBuildOptions, LambdaResource } from '../types/resourcesDiscovery.js';
import { constants } from 'fs';
import toml from 'toml';
import * as yaml from 'yaml';
import { findPackageJson } from '../utils/findPackageJson.js';
import { IFramework } from './iFrameworks.js';
import { CloudFormation } from '../cloudFormation.js';
import { AwsConfiguration } from '../types/awsConfiguration.js';
import { LldConfigBase } from '../types/lldConfig.js';
import { Logger } from '../logger.js';
import type { Format } from 'esbuild';

/**
 * Support for AWS SAM framework
 */
export class SamFramework implements IFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return 'sam';
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(config: LldConfigBase): Promise<boolean> {
    const { samConfigFile, samTemplateFile } = this.getConfigFiles(config);

    try {
      await fs.access(samConfigFile, constants.F_OK);
    } catch {
      Logger.verbose(
        `[SAM] This is not a SAM framework project. ${samConfigFile} not found.`,
      );
      return false;
    }

    try {
      await fs.access(samTemplateFile, constants.F_OK);
    } catch {
      Logger.verbose(
        `[SAM] This is not a SAM framework project. ${samTemplateFile} not found.`,
      );
      return false;
    }

    return true;
  }

  /**
   * Get configuration files
   * @param config Configuration
   * @returns Configuration files
   */
  private getConfigFiles(config: LldConfigBase) {
    const samConfigFile = config.samConfigFile ?? 'samconfig.toml';
    const samTemplateFile = config.samTemplateFile ?? 'template.yaml';
    return {
      samConfigFile: path.resolve(samConfigFile),
      samTemplateFile: path.resolve(samTemplateFile),
    };
  }

  /**
   * Get Lambda functions
   * @param config Configuration
   * @returns Lambda functions
   */
  public async getLambdas(config: LldConfigBase): Promise<LambdaResource[]> {
    const awsConfiguration: AwsConfiguration = {
      region: config.region,
      profile: config.profile,
      role: config.role,
    };

    const { samConfigFile, samTemplateFile } = this.getConfigFiles(config);

    const environment = config.configEnv ?? 'default';

    const samConfigContent = await fs.readFile(samConfigFile, 'utf-8');

    let samConfig: any;
    // is toml extension
    if (samConfigFile.endsWith('.toml')) {
      samConfig = toml.parse(samConfigContent);
    } else {
      samConfig = yaml.parse(samConfigContent);
    }

    let stackName: string | undefined;

    if (config.samStackName) {
      stackName = config.samStackName;
    } else {
      stackName = samConfig[environment]?.global?.parameters?.stack_name;
    }

    if (!stackName) {
      throw new Error(`Stack name not found in ${samConfigFile}`);
    }

    const lambdas = await this.parseLambdasFromTemplate(
      samTemplateFile,
      stackName,
    );

    const lambdasDiscovered: LambdaResource[] = [];

    Logger.verbose(`[SAM] Found Lambdas`, JSON.stringify(lambdas, null, 2));

    const lambdasInStack = await CloudFormation.getLambdasInStack(
      stackName,
      awsConfiguration,
    );

    Logger.verbose(
      `[SAM] Found Lambdas in stack ${stackName}:`,
      JSON.stringify(lambdasInStack, null, 2),
    );

    // get tags for each Lambda
    for (const func of lambdas) {
      const handlerFull = path.join(func.codeUri ?? '', func.handler);
      const handlerParts = handlerFull.split('.');
      const handler = handlerParts[1];

      const functionName = lambdasInStack.find(
        (lambda) =>
          lambda.logicalId === func.name &&
          lambda.stackLogicalId === func.stackLogicalId,
      )?.lambdaName;

      if (!functionName) {
        throw new Error(`Function name not found for function: ${func.name}`);
      }

      let esBuildOptions: EsBuildOptions | undefined = undefined;

      let codePath: string | undefined;
      if (func.buildMethod?.toLowerCase() === 'esbuild') {
        if (func.entryPoints && func.entryPoints.length > 0) {
          codePath = path.join(func.codeUri ?? '', func.entryPoints[0]);
        }

        esBuildOptions = {
          external: func.external,
          minify: func.minify,
          format: func.format,
          target: func.target,
        };
      }

      if (!codePath) {
        const fileWithExtension = handlerParts[0];
        const possibleCodePathsTs = `${fileWithExtension}.ts`;
        const possibleCodePathsJs = `${fileWithExtension}.js`;
        const possibleCodePaths = [
          possibleCodePathsTs,
          possibleCodePathsJs,
          `${fileWithExtension}.cjs`,
          `${fileWithExtension}.mjs`,
        ];

        for (const cp of possibleCodePaths) {
          try {
            await fs.access(cp, constants.F_OK);
            codePath = cp;
            break;
          } catch {
            // ignore, file not found
          }
        }

        if (!codePath) {
          codePath = possibleCodePathsJs;

          Logger.warn(
            `[Function ${functionName}] Can not find code path for handler: ${handlerFull}. Using fallback: ${codePath}`,
          );
        }
      }

      const packageJsonPath = await findPackageJson(codePath);
      Logger.verbose(`[SAM] package.json path: ${packageJsonPath}`);

      const lambdaResource: LambdaResource = {
        functionName,
        codePath,
        handler,
        packageJsonPath,
        esBuildOptions,
        metadata: {
          framework: 'sam',
          stackName,
        },
      };

      lambdasDiscovered.push(lambdaResource);
    }

    return lambdasDiscovered;
  }

  /**
   * Recursively parse templates to find all Lambda functions, including nested stacks
   * @param templatePath The path to the CloudFormation/SAM template file
   * @param stackName The name of the stack this template belongs to (for nested stacks)
   */
  private async parseLambdasFromTemplate(
    templatePath: string,
    stackName: string,
  ): Promise<ParsedLambda[]> {
    const resolvedTemplatePath = path.resolve(templatePath);
    const templateDir = path.dirname(resolvedTemplatePath);

    let template: any;
    try {
      const templateContent = await fs.readFile(resolvedTemplatePath, 'utf-8');
      template = yaml.parse(templateContent);
    } catch (err: any) {
      Logger.warn(
        `[SAM] Could not read or parse template at ${templatePath}: ${err.message}`,
      );
      return [];
    }

    if (!template.Resources) {
      return [];
    }

    const lambdas: ParsedLambda[] = [];

    for (const resourceName in template.Resources) {
      const resource = template.Resources[resourceName];

      // Check if it's a Lambda function
      if (resource.Type === 'AWS::Serverless::Function') {
        lambdas.push({
          templatePath,
          name: resourceName,
          codeUri: resource.Properties?.CodeUri,
          handler: resource.Properties?.Handler,
          buildMethod: resource.Metadata?.BuildMethod,
          entryPoints: resource.Metadata?.BuildProperties?.EntryPoints,
          external: resource.Metadata?.BuildProperties?.External,
          minify: resource.Metadata?.BuildProperties?.Minify,
          format: resource.Metadata?.BuildProperties?.Format as
            | Format
            | undefined,
          target: resource.Metadata?.BuildProperties?.Target,
          stackLogicalId: stackName,
        });
      }
      // Check if it's a nested stack
      else if (
        resource.Type === 'AWS::Serverless::Application' ||
        resource.Type === 'AWS::CloudFormation::Stack'
      ) {
        const nestedTemplateLocation =
          resource.Properties?.Location ?? resource.Properties?.TemplateURL;
        if (nestedTemplateLocation) {
          const nestedTemplatePath = path.resolve(
            templateDir,
            nestedTemplateLocation,
          );

          const nestedLambdas = await this.parseLambdasFromTemplate(
            nestedTemplatePath,
            resourceName,
          );
          lambdas.push(...nestedLambdas);
        }
      }
    }

    Logger.verbose(JSON.stringify(lambdas, null, 2));

    return lambdas;
  }
}

export const samFramework = new SamFramework();

type ParsedLambda = {
  templatePath: string;
  name: string;
  codeUri?: string;
  handler: string;
  buildMethod?: string;
  entryPoints?: string[];
  external?: string[];
  minify?: boolean;
  format?: Format;
  target?: string;
  stackLogicalId: string;
};
