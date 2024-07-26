import * as fs from "fs/promises";
import * as path from "path";
import { EsBuildOptions, LambdaResource } from "../types/resourcesDiscovery.js";
import { constants } from "fs";
import toml from "toml";
import * as yaml from "yaml";
import { findPackageJson } from "../utils/findPackageJson.js";
import { IFramework } from "./iFrameworks.js";
import { CloudFormation } from "../cloudFormation.js";
import { AwsConfiguration } from "../types/awsConfiguration.js";
import { LldConfigBase } from "../types/lldConfig.js";
import { Logger } from "../logger.js";

/**
 * Support for AWS SAM framework
 */
export class SamFramework implements IFramework {
  protected samConfigFile = path.resolve("samconfig.toml");
  protected samTemplateFile = path.resolve("template.yaml");

  /**
   * Framework name
   */
  public get name(): string {
    return "sam";
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    try {
      await fs.access(this.samConfigFile, constants.F_OK);
    } catch (error) {
      Logger.verbose(
        `[SAM] This is not a SAM framework project. ${this.samConfigFile} not found.`
      );
      return false;
    }

    try {
      await fs.access(this.samTemplateFile, constants.F_OK);
    } catch (error) {
      Logger.verbose(
        `[SAM] This is not a SAM framework project. ${this.samTemplateFile} not found.`
      );
      return false;
    }

    return true;
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

    const environment = config.configEnv ?? "default";

    const samConfigContent = await fs.readFile(this.samConfigFile, "utf-8");

    const samConfig = toml.parse(samConfigContent);
    const stackName = samConfig[environment]?.global?.parameters?.stack_name;

    if (!stackName) {
      throw new Error(`Stack name not found in ${this.samConfigFile}`);
    }

    const samTemplateContent = await fs.readFile(this.samTemplateFile, "utf-8");
    const template = yaml.parse(samTemplateContent);

    const lambdas: any[] = [];

    // get all resources of type AWS::Serverless::Function
    for (const resourceName in template.Resources) {
      if (template.Resources.hasOwnProperty(resourceName)) {
        const resource = template.Resources[resourceName];
        if (resource.Type === "AWS::Serverless::Function") {
          lambdas.push({
            Name: resourceName,
            ...resource,
          });
        }
      }
    }

    const lambdasDiscovered: LambdaResource[] = [];

    Logger.verbose(`[SAM] Found Lambdas`, JSON.stringify(lambdas, null, 2));

    const lambdasInStack = await CloudFormation.getLambdasInStack(
      stackName,
      awsConfiguration
    );

    Logger.verbose(
      `[SAM] Found Lambdas in stack ${stackName}:`,
      JSON.stringify(lambdasInStack, null, 2)
    );

    // get tags for each Lambda
    for (const func of lambdas) {
      const handlerFull = path.join(
        func.Properties.CodeUri ?? "",
        func.Properties.Handler
      );
      const handlerParts = handlerFull.split(".");
      const handler = handlerParts[1];

      const functionName = lambdasInStack.find(
        (lambda) => lambda.logicalId === func.Name
      )?.lambdaName;

      if (!functionName) {
        throw new Error(`Function name not found for function: ${func.Name}`);
      }

      let esBuildOptions: EsBuildOptions | undefined = undefined;

      let codePath: string | undefined;
      if (func.Metadata?.BuildMethod?.toLowerCase() === "esbuild") {
        if (func.Metadata?.BuildProperties?.EntryPoints?.length > 0) {
          codePath = path.join(
            func.Properties.CodeUri ?? "",
            func.Metadata?.BuildProperties?.EntryPoints[0]
          );
        }

        esBuildOptions = {
          external: func.Metadata?.BuildProperties?.External,
          minify: func.Metadata?.BuildProperties?.Minify,
          format: func.Metadata?.BuildProperties?.Format,
          target: func.Metadata?.BuildProperties?.Target,
        };
      }

      if (!codePath) {
        const fileWithExtension = handlerParts[0];
        const possibleCodePaths = [
          `${fileWithExtension}.ts`,
          `${fileWithExtension}.js`,
          `${fileWithExtension}.cjs`,
          `${fileWithExtension}.mjs`,
        ];

        for (const cp of possibleCodePaths) {
          try {
            await fs.access(cp, constants.F_OK);
            codePath = cp;
            break;
          } catch (error) {}
        }
      }

      if (!codePath) {
        throw new Error(`Code path not found for function: ${func.Name}`);
      }

      const packageJsonPath = await findPackageJson(codePath);
      Logger.verbose(`[SAM] package.json path: ${packageJsonPath}`);

      const lambdaResource: LambdaResource = {
        functionName,
        codePath,
        handler,
        packageJsonPath,
        esBuildOptions,
      };

      lambdasDiscovered.push(lambdaResource);
    }

    return lambdasDiscovered;
  }
}

export const samFramework = new SamFramework();
