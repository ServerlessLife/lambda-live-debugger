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

    try {
      // lazy load modules
      resolveConfigurationPath = (
        await import(
          //@ts-ignore
          'serverless/lib/cli/resolve-configuration-path.js'
        )
      ).default;
      readConfiguration = (
        await import(
          //@ts-ignore
          'serverless/lib/configuration/read.js'
        )
      ).default;
      resolveVariables = (
        await import(
          //@ts-ignore
          'serverless/lib/configuration/variables/resolve.js'
        )
      ).default;
      resolveVariablesMeta = (
        await import(
          //@ts-ignore
          'serverless/lib/configuration/variables/resolve-meta.js'
        )
      ).default;
      const env = await import(
        //@ts-ignore
        'serverless/lib/configuration/variables/sources/env.js'
      );
      const file = await import(
        //@ts-ignore
        'serverless/lib/configuration/variables/sources/file.js'
      );
      const opt = await import(
        //@ts-ignore
        'serverless/lib/configuration/variables/sources/opt.js'
      );
      const self = await import(
        //@ts-ignore
        'serverless/lib/configuration/variables/sources/self.js'
      );
      const strToBool = await import(
        //@ts-ignore
        'serverless/lib/configuration/variables/sources/str-to-bool.js'
      );
      const sls = await import(
        //@ts-ignores
        'serverless/lib/configuration/variables/sources/instance-dependent/get-sls.js'
      );

      sources = {
        env: env.default,
        file: file.default,
        opt: opt.default,
        self: self.default,
        strToBool: strToBool.default,
        sls: sls.default(),
      };

      Serverless = (await import('serverless')).default;
    } catch (error: any) {
      Logger.error('Error loading serverless modules', error);
      Logger.log(
        'If you are running Lambda Live Debugger from a global installation, install Serverless Framework globally as well.',
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

    const esBuildOptions: EsBuildOptions | undefined =
      this.getEsBuildOptions(serverless);

    const lambdas = serverless.service.functions;

    Logger.verbose(`[SLS] Found Lambdas:`, JSON.stringify(lambdas, null, 2));

    for (const func in lambdas) {
      const lambda = lambdas[func] as Serverless.FunctionDefinitionHandler;
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

      lambdasDiscovered.push(lambdaResource);
    }

    return lambdasDiscovered;
  }

  protected getEsBuildOptions(serverless: Serverless) {
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
            tsconfig: settings.tsConfigFileLocation,
          };
        }
      }
    }
    return esBuildOptions;
  }
}

export const slsFramework = new SlsFramework();
