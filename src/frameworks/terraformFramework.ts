import * as fs from 'fs/promises';
import * as path from 'path';
import { LambdaResource } from '../types/resourcesDiscovery.js';
import { constants } from 'fs';
import { findPackageJson } from '../utils/findPackageJson.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import ts from 'typescript';
import { IFramework } from './iFrameworks.js';
import { Logger } from '../logger.js';
import { LldConfigBase } from '../types/lldConfig.js';

export const execAsync = promisify(exec);

interface TerraformResource {
  type: string;
  name: string;
  address: string;
  values: {
    function_name?: string;
    handler?: string;
    source_dir?: string;
    source_file?: string;
    query?: {
      source_path?: string;
    };
  };
  //dependencies > depends_on
  depends_on: Array<string>;
}

/**
 * Support for Terraform framework
 */
export class TerraformFramework implements IFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return 'terraform';
  }

  /**
   * Name of the framework in logs
   */
  protected get logName(): string {
    return 'Terrform';
  }

  /**
   * Get Terraform state CI command
   */
  protected get stateCommand(): string {
    return 'terraform show --json';
  }

  /**
   *
   * @returns Get command to check if Terraform is installed
   */
  protected get checkInstalledCommand(): string {
    return 'terraform --version';
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    // is there any filey with *.tf extension
    const files = await fs.readdir(process.cwd());
    const r = files.some((f) => f.endsWith('.tf'));

    if (!r) {
      Logger.verbose(
        `[${this.logName}] This is not a Terraform or OpenTofu project. There are no *.tf files in ${path.resolve('.')} folder.`,
      );
      return false;
    } else {
      // check if terraform is installed
      try {
        await execAsync(this.checkInstalledCommand);
        return true;
      } catch {
        Logger.verbose(
          `[${this.logName}] This is not a ${this.logName} project. Terraform is not installed.`,
        );
        return false;
      }
    }
  }

  /**
   * Get Lambda functions
   * @param _config Configuration
   * @returns Lambda functions
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getLambdas(config: LldConfigBase): Promise<LambdaResource[]> {
    const state = await this.readTerraformState();
    const lambdas = this.extractLambdaInfo(state);

    Logger.verbose(
      `[${this.logName}] Found Lambdas:`,
      JSON.stringify(lambdas, null, 2),
    );

    const lambdasDiscovered: LambdaResource[] = [];

    const tsOutDir = await this.getTsConfigOutDir();

    if (tsOutDir) {
      Logger.verbose(`[${this.logName}] tsOutDir:`, tsOutDir);
    }

    for (const func of lambdas) {
      const functionName = func.functionName;
      const handlerParts = func.handler.split('.');

      // get last part of the handler
      const handler = handlerParts[handlerParts.length - 1];

      const filename = func.sourceFilename;
      let pathWithourExtension: string;
      if (filename) {
        // remove extension
        pathWithourExtension = filename.replace(/\.[^/.]+$/, '');
      } else {
        pathWithourExtension = path.join(func.sourceDir!, handlerParts[0]);
      }

      let possibleCodePaths = [
        `${pathWithourExtension}.ts`,
        `${pathWithourExtension}.js`,
        `${pathWithourExtension}.cjs`,
        `${pathWithourExtension}.mjs`,
      ];

      if (tsOutDir) {
        // remove outDir from path
        const pathWithourExtensionTypeScript = pathWithourExtension
          .replace(tsOutDir, '')
          .replace(/\/\//g, '/');

        possibleCodePaths = [
          `${pathWithourExtensionTypeScript}.ts`,
          `${pathWithourExtensionTypeScript}.js`,
          `${pathWithourExtensionTypeScript}.cjs`,
          `${pathWithourExtensionTypeScript}.mjs`,
          ...possibleCodePaths,
        ];
      }

      let codePath: string | undefined;
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
        throw new Error(`Code path not found for handler: ${functionName}`);
      }

      const packageJsonPath = await findPackageJson(codePath);

      const lambdaResource: LambdaResource = {
        functionName,
        codePath,
        handler,
        packageJsonPath,
        esBuildOptions: undefined,
        metadata: {
          framework: this.name,
        },
      };

      lambdasDiscovered.push(lambdaResource);
    }

    return lambdasDiscovered;
  }

  protected extractLambdaInfo(resources: TerraformResource[]) {
    const lambdas: Array<{
      functionName: string;
      sourceDir?: string;
      sourceFilename?: string;
      handler: string;
    }> = [];

    for (const resource of resources) {
      if (resource.type === 'aws_lambda_function') {
        Logger.verbose(
          `[${this.logName}] Found Lambda:`,
          JSON.stringify(resource, null, 2),
        );

        let sourceDir: string | undefined;
        let sourceFilename: string | undefined;

        const functionName = resource.values.function_name;
        const handler = resource.values.handler;

        if (!functionName) {
          Logger.error('Failed to find function name for Lambda');
          continue;
        }

        // get dependency "data.archive_file"
        const dependencies = resource.depends_on;
        const archiveFileResourceName = dependencies.find((dep) =>
          dep.startsWith('data.archive_file.'),
        );

        if (archiveFileResourceName) {
          // get the resource
          const name = archiveFileResourceName.split('.')[2];
          const archiveFileResource = resources.find((r) => r.name === name);

          // get source_dir or source_filename
          if (archiveFileResource) {
            sourceDir = archiveFileResource.values.source_dir;
            sourceFilename = archiveFileResource.values.source_file;
          }
        }

        // get dependency "archive_prepare" = serverless.tf support
        const archivePrepareResourceName = dependencies.find((dep) =>
          dep.includes('.archive_prepare'),
        );

        if (archivePrepareResourceName) {
          // get the resource
          const name = archivePrepareResourceName;
          const archivePrepareResource = resources.find((r) =>
            r.address?.startsWith(name),
          );

          // get source_dir or source_filename
          if (archivePrepareResource) {
            sourceDir =
              archivePrepareResource.values.query?.source_path?.replaceAll(
                '"',
                '',
              );
          }
        }

        if (!sourceDir && !sourceFilename) {
          Logger.error(`Failed to find source code for Lambda ${functionName}`);
        } else {
          lambdas.push({
            functionName,
            sourceDir,
            sourceFilename,
            handler: handler ?? 'handler',
          });
        }
      }
    }

    return lambdas;
  }

  protected async readTerraformState(): Promise<TerraformResource[]> {
    // Is there a better way to get the Terraform state???

    let output: any;

    // get state by running "terraform show --json" command
    try {
      Logger.verbose(
        `[${this.logName}] Getting state with '${this.stateCommand}' command`,
      );
      output = await execAsync(this.stateCommand);
    } catch (error: any) {
      throw new Error(
        `[${this.logName}] Failed to getstate from '${this.stateCommand}' command: ${error.message}`,
        { cause: error },
      );
    }

    if (output.stderr) {
      throw new Error(
        `[${this.logName}] Failed to get state from '${this.stateCommand}' command: ${output.stderr}`,
      );
    }

    if (!output.stdout) {
      throw new Error(
        `[${this.logName}] Failed to get state from '${this.stateCommand}' command`,
      );
    }

    let jsonString: string | undefined = output.stdout;

    Logger.verbose(`[${this.logName}] State:`, jsonString);

    jsonString = jsonString?.split('\n').find((line) => line.startsWith('{'));

    if (!jsonString) {
      throw new Error(
        `[${this.logName}] Failed to get state. JSON string not found in the output.`,
      );
    }

    try {
      const state = JSON.parse(jsonString);

      const rootResources: TerraformResource[] =
        state.values?.root_module?.resources ?? [];

      const childResources: TerraformResource[] =
        state.values?.root_module?.child_modules
          ?.map((m: any) => m.resources)
          .flat() ?? [];

      return [...rootResources, ...childResources] as TerraformResource[];
    } catch (error: any) {
      //save state to file
      await fs.writeFile(`${this.name}-state.json`, jsonString);
      Logger.error(`[${this.logName}] Failed to parse state JSON:`, error);
      throw new Error(
        `Failed to parse ${this.logName} state JSON: ${error.message}`,
        { cause: error },
      );
    }
  }

  /**
   * Get the outDir from tsconfig.json
   */
  protected async getTsConfigOutDir() {
    let currentDir = process.cwd();
    let tsConfigPath;
    while (currentDir !== '/') {
      tsConfigPath = path.resolve(path.join(currentDir, 'tsconfig.json'));
      try {
        await fs.access(tsConfigPath, constants.F_OK);
        break;
      } catch {
        // tsconfig.json not found, move up one directory
        currentDir = path.dirname(currentDir);
      }
    }
    if (!tsConfigPath) {
      Logger.verbose(`[${this.logName}] tsconfig.json not found`);
      return undefined;
    }

    Logger.verbose(`[${this.logName}] tsconfig.json found:`, tsConfigPath);
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    const compilerOptions = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      './',
    );

    return compilerOptions.options.outDir
      ? path.resolve(compilerOptions.options.outDir)
      : undefined;
  }
}

export const terraformFramework = new TerraformFramework();
