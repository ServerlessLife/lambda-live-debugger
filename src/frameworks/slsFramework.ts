import * as fs from 'fs/promises';
import * as path from 'path';
import { EsBuildOptions, LambdaResource } from '../types/resourcesDiscovery.js';
import { constants } from 'fs';
import { findPackageJson } from '../utils/findPackageJson.js';
import type Serverless from 'serverless';
import { IFramework } from './iFrameworks.js';
import { LldConfigBase } from '../types/lldConfig.js';
import { Logger } from '../logger.js';

/**
 * Support for Serverless Framework
 */
export class SlsFramework implements IFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return 'sls';
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    const serverlessFiles = [
      path.resolve('serverless.yml'),
      path.resolve('serverless.yaml'),
      path.resolve('serverless.js'),
      path.resolve('serverless.ts'),
      path.resolve('serverless.json'),
    ];
    for (const file of serverlessFiles) {
      try {
        await fs.access(file, constants.F_OK);
        return true;
      } catch {
        continue;
      }
    }

    Logger.verbose(
      `[SLS] This is not a Serverless framework project. None of the files found: ${serverlessFiles.join(', ')}`,
    );

    return false;
  }

  /**
   * Get Lambda functions
   * @param config Configuration
   * @returns Lambda functions
   */
  public async getLambdas(config: LldConfigBase): Promise<LambdaResource[]> {
    // LLD arguments might conflict with serverless arguments
    process.argv = [];

    let resolveConfigurationPath: any;
    let readConfiguration: any;
    let resolveVariables: any;
    let resolveVariablesMeta: any;
    let sources: any;
    let Serverless: any;
    let error1: any | undefined;

    try {
      try {
        const frameworkFunctions = await loadFramework('serverless');
        resolveConfigurationPath = frameworkFunctions.resolveConfigurationPath;
        readConfiguration = frameworkFunctions.readConfiguration;
        resolveVariables = frameworkFunctions.resolveVariables;
        resolveVariablesMeta = frameworkFunctions.resolveVariablesMeta;
        sources = frameworkFunctions.sources;
        Serverless = frameworkFunctions.Serverless;

        Logger.verbose(`[SLS] Npm module 'serverless' loaded`);
      } catch (error: any) {
        Logger.verbose(`[SLS] Failed to load npm module 'serverless'`, error);

        error1 = error;
        const frameworkFunctions = await loadFramework('osls');
        resolveConfigurationPath = frameworkFunctions.resolveConfigurationPath;
        readConfiguration = frameworkFunctions.readConfiguration;
        resolveVariables = frameworkFunctions.resolveVariables;
        resolveVariablesMeta = frameworkFunctions.resolveVariablesMeta;
        sources = frameworkFunctions.sources;
        Serverless = frameworkFunctions.Serverless;

        Logger.verbose(`[SLS] Npm module 'osls' loaded`);
      }
    } catch (error2: any) {
      const error = error1 ?? error2;
      Logger.error('Error loading serverless (or osls) module', error);
      Logger.log(
        'If you are running Lambda Live Debugger from a global installation, install Serverless Framework globally as well. If you are using monorepo, install Serverless Framework also in the project root folder. The fork of Serverless Framework https://github.com/oss-serverless/serverless is also supported.',
      );
      throw new Error(`Error loading serverless modules. ${error.message}`, {
        cause: error,
      });
    }

    const configurationPath = await resolveConfigurationPath();
    Logger.verbose(
      `[SLS] Configuration path: ${path.resolve(configurationPath)}`,
    );

    const configuration = await readConfiguration(configurationPath);
    Logger.verbose(
      `[SLS] Configuration:`,
      JSON.stringify(configuration, null, 2),
    );

    const serviceDir = process.cwd();
    const configurationFilename =
      configuration && configurationPath.slice(serviceDir.length + 1);

    Logger.verbose(
      `[SLS] Configuration filename: ${path.resolve(configurationFilename)}`,
    );

    const commands: string[] = [];
    const options: any = {};

    if (config.stage) {
      options.stage = config.stage;
    }
    if (config.region) {
      options.region = config.region;
    }
    if (config.profile) {
      options.profile = config.profile;
    }

    const variablesMeta = resolveVariablesMeta(configuration);

    await resolveVariables({
      serviceDir,
      configuration,
      variablesMeta,
      sources,
      options,
      fulfilledSources: new Set(),
    });
    let serverless: Serverless;

    try {
      serverless = new Serverless({
        configuration,
        serviceDir,
        configurationFilename,
        commands,
        options,
        variablesMeta,
      });
    } catch (error: any) {
      throw new Error(`Error creating Serverless instance. ${error.message}`, {
        cause: error,
      });
    }

    try {
      await serverless.init();
    } catch (error: any) {
      throw new Error(`Error initializing Serverless. ${error.message}`, {
        cause: error,
      });
    }

    try {
      await serverless.run();
    } catch (error: any) {
      throw new Error(`Error running Serverless. ${error.message}`, {
        cause: error,
      });
    }

    const lambdasDiscovered: LambdaResource[] = [];

    const esBuildOptions: EsBuildOptions | undefined = this.getEsBuildOptions(
      serverless,
      config,
    );

    // Get functions from main configuration
    const lambdas = serverless.service.functions;

    Logger.verbose(`[SLS] Found Lambdas:`, JSON.stringify(lambdas, null, 2));

    // Process main stack functions
    for (const func in lambdas) {
      const lambdaResource = await this.processFunction(
        func,
        lambdas[func] as Serverless.FunctionDefinitionHandler,
        esBuildOptions,
      );
      lambdasDiscovered.push(lambdaResource);
    }

    // Check for nested stacks (serverless-nested-stack plugin)
    const nestedStacks = (serverless.service as any).nestedStacks;
    if (nestedStacks) {
      Logger.verbose(
        `[SLS] Found nested stacks configuration:`,
        JSON.stringify(nestedStacks, null, 2),
      );

      const nestedLambdas = await this.parseNestedStacks(
        nestedStacks,
        esBuildOptions,
      );
      lambdasDiscovered.push(...nestedLambdas);
    }

    return lambdasDiscovered;
  }

  /**
   * Process a single Lambda function
   */
  private async processFunction(
    funcName: string,
    lambda: Serverless.FunctionDefinitionHandler,
    esBuildOptions: EsBuildOptions | undefined,
  ): Promise<LambdaResource> {
    const handlerFull = lambda.handler;
    const handlerParts = handlerFull.split('.');
    const handler = handlerParts[1];

    const possibleCodePaths = [
      `${handlerParts[0]}.ts`,
      `${handlerParts[0]}.js`,
      `${handlerParts[0]}.cjs`,
      `${handlerParts[0]}.mjs`,
    ];
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
      throw new Error(`Code path not found for handler: ${handlerFull}`);
    }

    const functionName = lambda.name;
    if (!functionName) {
      throw new Error(`Function name not found for handler: ${handlerFull}`);
    }

    const packageJsonPath = await findPackageJson(codePath);
    Logger.verbose(`[SLS] package.json path: ${packageJsonPath}`);

    const lambdaResource: LambdaResource = {
      functionName,
      codePath,
      handler,
      packageJsonPath,
      esBuildOptions,
      metadata: {
        framework: 'sls',
      },
    };

    return lambdaResource;
  }

  /**
   * Parse nested stacks recursively
   */
  private async parseNestedStacks(
    nestedStacks: any,
    esBuildOptions: EsBuildOptions | undefined,
    currentDir: string = process.cwd(),
  ): Promise<LambdaResource[]> {
    const lambdas: LambdaResource[] = [];

    for (const stackName in nestedStacks) {
      const stackConfig = nestedStacks[stackName];
      const templatePath = stackConfig.template;

      if (!templatePath) {
        Logger.verbose(
          `[SLS] Nested stack ${stackName} has no template property`,
        );
        continue;
      }

      const resolvedTemplatePath = path.resolve(currentDir, templatePath);
      Logger.verbose(
        `[SLS] Parsing nested stack ${stackName}: ${resolvedTemplatePath}`,
      );

      try {
        const templateContent = await fs.readFile(
          resolvedTemplatePath,
          'utf-8',
        );
        const yaml = await import('yaml');
        const nestedConfig = yaml.parse(templateContent);

        // Process functions in nested stack
        if (nestedConfig.functions) {
          Logger.verbose(
            `[SLS] Found functions in nested stack ${stackName}:`,
            JSON.stringify(nestedConfig.functions, null, 2),
          );

          for (const funcName in nestedConfig.functions) {
            const func = nestedConfig.functions[funcName];
            const lambdaResource = await this.processFunction(
              funcName,
              func as Serverless.FunctionDefinitionHandler,
              esBuildOptions,
            );
            lambdas.push(lambdaResource);
          }
        }

        // Recursively process nested stacks within this stack
        if (nestedConfig.nestedStacks) {
          Logger.verbose(
            `[SLS] Found nested stacks within ${stackName}:`,
            JSON.stringify(nestedConfig.nestedStacks, null, 2),
          );

          const templateDir = path.dirname(resolvedTemplatePath);
          const deeperNestedLambdas = await this.parseNestedStacks(
            nestedConfig.nestedStacks,
            esBuildOptions,
            templateDir,
          );
          lambdas.push(...deeperNestedLambdas);
        }
      } catch (err: any) {
        Logger.warn(
          `[SLS] Could not parse nested stack at ${resolvedTemplatePath}: ${err.message}`,
        );
      }
    }

    Logger.verbose(
      `[SLS] Finished parsing nested stacks, found ${lambdas.length} Lambda function(s)${lambdas.length > 0 ? `:\n${lambdas.map((l) => `  - ${l.functionName}`).join('\n')}` : ''}`,
    );

    return lambdas;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getEsBuildOptions(serverless: Serverless, config: LldConfigBase) {
    // 1) Get from from LLD specific options in custom.lldEsBuild
    let esBuildOptions: EsBuildOptions | undefined =
      serverless.service.custom?.lldEsBuild;

    // 2) Get from serverless-esbuild plugin
    const esBuildPlugin = serverless.service.plugins?.find(
      (p) => p === 'serverless-esbuild',
    );

    if (esBuildPlugin) {
      Logger.verbose('[SLS] serverless-esbuild plugin detected');
      const settings = serverless.service.custom?.esbuild;
      if (settings) {
        esBuildOptions = {
          minify: settings.minify,
          target: settings.target,
          external: settings.external,
        };
      }
    } else {
      // 3) Get from serverless-plugin-typescript plugin
      const typeScriptPlugin = serverless.service.plugins?.find(
        (p) => p === 'serverless-plugin-typescript',
      );

      if (typeScriptPlugin) {
        Logger.verbose('[SLS] serverless-plugin-typescript plugin detected');

        const settings = serverless.service.custom?.serverlessPluginTypescript;
        if (settings) {
          esBuildOptions = {
            tsconfig: path.resolve(settings.tsConfigFileLocation),
          };
        }
      }
    }
    return esBuildOptions;
  }
}

export const slsFramework = new SlsFramework();
async function loadFramework(npmName: string) {
  // lazy load modules
  const resolveConfigurationPath = (
    await import(
      //@ts-ignore
      `${npmName}/lib/cli/resolve-configuration-path.js`
    )
  ).default;
  const readConfiguration = (
    await import(
      //@ts-ignore
      `${npmName}/lib/configuration/read.js`
    )
  ).default;
  const resolveVariables = (
    await import(
      //@ts-ignore
      `${npmName}/lib/configuration/variables/resolve.js`
    )
  ).default;
  const resolveVariablesMeta = (
    await import(
      //@ts-ignore
      `${npmName}/lib/configuration/variables/resolve-meta.js`
    )
  ).default;
  const env = await import(
    //@ts-ignore
    `${npmName}/lib/configuration/variables/sources/env.js`
  );
  const file = await import(
    //@ts-ignore
    `${npmName}/lib/configuration/variables/sources/file.js`
  );
  const opt = await import(
    //@ts-ignore
    `${npmName}/lib/configuration/variables/sources/opt.js`
  );
  const self = await import(
    //@ts-ignore
    `${npmName}/lib/configuration/variables/sources/self.js`
  );
  const strToBool = await import(
    //@ts-ignore
    `${npmName}/lib/configuration/variables/sources/str-to-bool.js`
  );
  const sls = await import(
    //@ts-ignores
    `${npmName}/lib/configuration/variables/sources/instance-dependent/get-sls.js`
  );

  const sources = {
    env: env.default,
    file: file.default,
    opt: opt.default,
    self: self.default,
    strToBool: strToBool.default,
    sls: sls.default(),
  };

  const Serverless = (await import(npmName)).default;
  return {
    resolveConfigurationPath,
    readConfiguration,
    resolveVariablesMeta,
    resolveVariables,
    sources,
    Serverless,
  };
}
