import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { BundlingType, LambdaResource } from '../types/resourcesDiscovery.js';
import { outputFolder } from '../constants.js';
import { findPackageJson } from '../utils/findPackageJson.js';
import { IFramework } from './iFrameworks.js';
import { CloudFormation } from '../cloudFormation.js';
import { AwsConfiguration } from '../types/awsConfiguration.js';
import { LldConfigBase } from '../types/lldConfig.js';
import { Logger } from '../logger.js';
import { Worker } from 'node:worker_threads';
import { getModuleDirname, getProjectDirname } from '../getDirname.js';
import { findNpmPath } from '../utils/findNpmPath.js';
import { type BundlingOptions } from 'aws-cdk-lib/aws-lambda-nodejs';
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';

/**
 * Support for AWS CDK framework
 */
export class CdkFramework implements IFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return 'cdk';
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    // check if there is cdk.json
    const cdkJsonPath = path.resolve('cdk.json');

    try {
      await fs.access(cdkJsonPath, fs.constants.F_OK);
      return true;
    } catch {
      Logger.verbose(
        `[CDK] This is not a CDK project. ${cdkJsonPath} not found`,
      );
      return false;
    }
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

    const cdkConfigPath = 'cdk.json';
    // read cdk.json and extract the entry file

    const lambdasInCdk = await this.getLambdasDataFromCdkByCompilingAndRunning(
      cdkConfigPath,
      config,
    );
    Logger.verbose(
      `[CDK] Found Lambda functions:`,
      JSON.stringify(lambdasInCdk, null, 2),
    );

    //get all stack names
    const stackNames = [
      ...new Set( // unique
        lambdasInCdk.map((lambda) => {
          return lambda.stackName;
        }),
      ),
    ];
    Logger.verbose(
      `[CDK] Found the following stacks in CDK: ${stackNames.join(', ')}`,
    );

    const lambdasDeployed = (
      await Promise.all(
        stackNames.map(async (stackName) => {
          const lambdasInStackPromise = CloudFormation.getLambdasInStack(
            stackName,
            awsConfiguration,
          );
          const lambdasMetadataPromise =
            this.getLambdaCdkPathFromTemplateMetadata(
              stackName,
              awsConfiguration,
            );

          const lambdasInStack = await lambdasInStackPromise;
          Logger.verbose(
            `[CDK] Found Lambda functions in the stack ${stackName}:`,
            JSON.stringify(lambdasInStack, null, 2),
          );
          const lambdasMetadata = await lambdasMetadataPromise;
          Logger.verbose(
            `[CDK] Found Lambda functions in the stack ${stackName} in the template metadata:`,
            JSON.stringify(lambdasMetadata, null, 2),
          );

          return lambdasInStack.map((lambda) => {
            return {
              lambdaName: lambda.lambdaName,
              cdkPath: lambdasMetadata.find(
                (lm) => lm.logicalId === lambda.logicalId,
              )?.cdkPath,
            };
          });
        }),
      )
    ).flat();

    const lambdasDiscovered: LambdaResource[] = [];

    // compare lambdas in CDK and Stack and get the code path of the Lambdas
    for (const lambdaInCdk of lambdasInCdk) {
      const functionName = lambdasDeployed.find(
        (lambda) => lambda.cdkPath === lambdaInCdk.cdkPath,
      )?.lambdaName;

      if (functionName) {
        const external = [
          ...(lambdaInCdk.bundling?.externalModules ?? []),
          ...(lambdaInCdk.bundling?.nodeModules ?? []),
        ];

        lambdasDiscovered.push({
          functionName: functionName,
          codePath: lambdaInCdk.codePath,
          handler: lambdaInCdk.handler,
          packageJsonPath: lambdaInCdk.packageJsonPath,
          bundlingType: BundlingType.ESBUILD,
          esBuildOptions: {
            minify: lambdaInCdk.bundling?.minify,
            format: lambdaInCdk.bundling?.format,
            sourcesContent: lambdaInCdk.bundling?.sourcesContent,
            target: lambdaInCdk.bundling?.target,
            loader: lambdaInCdk.bundling?.loader as any,
            logLevel: lambdaInCdk.bundling?.logLevel,
            keepNames: lambdaInCdk.bundling?.keepNames,
            tsconfig: lambdaInCdk.bundling?.tsconfig,
            metafile: lambdaInCdk.bundling?.metafile,
            banner: lambdaInCdk.bundling?.banner
              ? { js: lambdaInCdk.bundling?.banner }
              : undefined,
            footer: lambdaInCdk.bundling?.footer
              ? { js: lambdaInCdk.bundling?.footer }
              : undefined,
            charset: lambdaInCdk.bundling?.charset,
            define: lambdaInCdk.bundling?.define,
            external: external.length > 0 ? external : undefined,
          },
          metadata: {
            framework: 'cdk',
            stackName: lambdaInCdk.stackName,
            cdkPath: lambdaInCdk.cdkPath,
          },
        });
      }
    }

    return lambdasDiscovered;
  }

  /**
   * Getz Lambda functions from the CloudFormation template metadata
   * @param stackName
   * @param awsConfiguration
   * @returns
   */
  protected async getLambdaCdkPathFromTemplateMetadata(
    stackName: string,
    awsConfiguration: AwsConfiguration,
  ): Promise<
    Array<{
      logicalId: string;
      cdkPath: string;
    }>
  > {
    const cfTemplate = await CloudFormation.getCloudFormationStackTemplate(
      stackName,
      awsConfiguration,
    );
    // get all Lambda functions in the template
    if (cfTemplate) {
      const lambdas = Object.entries(cfTemplate.Resources)
        .filter(
          ([, resource]: [string, any]) =>
            resource.Type === 'AWS::Lambda::Function',
        )
        .map(([key, resource]: [string, any]) => {
          return {
            logicalId: key,
            cdkPath: resource.Metadata['aws:cdk:path'],
          };
        });
      return lambdas;
    }

    return [];
  }

  /**
   * Get Lambdas data from CDK by compiling and running the CDK code
   * @param cdkConfigPath
   * @param config
   * @returns
   */
  protected async getLambdasDataFromCdkByCompilingAndRunning(
    cdkConfigPath: string,
    config: LldConfigBase,
  ) {
    const entryFile = await this.getCdkEntryFile(cdkConfigPath);
    let isESM = false;
    const packageJsonPath = await findPackageJson(entryFile);

    if (packageJsonPath) {
      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, { encoding: 'utf-8' }),
        );
        if (packageJson.type === 'module') {
          isESM = true;
          Logger.verbose(`[CDK] Using ESM format`);
        }
      } catch (err: any) {
        Logger.error(
          `Error reading CDK package.json (${packageJsonPath}): ${err.message}`,
          err,
        );
      }
    }

    const rootDir = process.cwd();

    // Plugin that:
    // - Fixes __dirname issues
    // - Injects code to get the file path of the Lambda function and CDK hierarchy
    const injectCodePlugin: esbuild.Plugin = {
      name: 'injectCode',
      setup(build: esbuild.PluginBuild) {
        build.onLoad({ filter: /.*/ }, async (args: esbuild.OnLoadArgs) => {
          // fix __dirname issues
          const isWindows = /^win/.test(process.platform);
          const esc = (p: string) => (isWindows ? p.replace(/\\/g, '/') : p);

          const variables = `
              const __fileloc = {
                filename: "${esc(args.path)}",
                dirname: "${esc(path.dirname(args.path))}",
                relativefilename: "${esc(path.relative(rootDir, args.path))}",
                relativedirname: "${esc(
                  path.relative(rootDir, path.dirname(args.path)),
                )}",
                import: { meta: { url: "file://${esc(args.path)}" } }
              };
            `;

          let fileContent = new TextDecoder().decode(
            await fs.readFile(args.path),
          );

          // remove shebang
          if (fileContent.startsWith('#!')) {
            const firstNewLine = fileContent.indexOf('\n');
            fileContent = fileContent.slice(firstNewLine + 1);
          }

          let contents: string;
          if (args.path.endsWith('.ts') || args.path.endsWith('.js')) {
            // add the variables at the top of the file, that contains the file location
            contents = `${variables}\n${fileContent}`;
          } else {
            contents = fileContent;
          }

          // for .mjs files, use js loader
          const fileExtension = args.path.split('.').pop();
          const loader: esbuild.Loader =
            fileExtension === 'mjs' || fileExtension === 'cjs'
              ? 'js'
              : (fileExtension as esbuild.Loader);
          // Inject code to get the file path of the Lambda function and CDK hierarchy
          if (
            args.path.includes(
              path.join('aws-cdk-lib', 'aws-lambda', 'lib', 'function.'),
            )
          ) {
            const codeToFind =
              'try{jsiiDeprecationWarnings().aws_cdk_lib_aws_lambda_FunctionProps(props)}';

            if (!contents.includes(codeToFind)) {
              throw new Error(`Can not find code to inject in ${args.path}`);
            }

            // Inject code to get the file path of the Lambda function and CDK hierarchy
            // path to match it with the Lambda function. Store data in the global variable.
            contents = contents.replace(
              codeToFind,
              `;
              global.lambdas = global.lambdas ?? [];

              const lambdaInfo = {
                //cdkPath: this.node.defaultChild?.node.path ?? this.node.path,
                stackName: this.stack.stackName,
                codePath: props.entry,
                code: props.code,
                node: this.node,
                handler: props.handler,
                bundling: props.bundling
              };

              // console.log("CDK INFRA: ", {
                //   stackName: lambdaInfo.stackName,
                //   codePath: lambdaInfo.codePath,
                //   code: lambdaInfo.code,
                //   handler: lambdaInfo.handler,
                //   bundling: lambdaInfo.bundling
                // });
              global.lambdas.push(lambdaInfo);` + codeToFind,
            );
          } else if (
            args.path.includes(
              path.join(
                'aws-cdk-lib',
                'aws-s3-deployment',
                'lib',
                'bucket-deployment.',
              ),
            )
          ) {
            const codeToFind = 'super(scope,id),this.requestDestinationArn=!1;';

            if (!contents.includes(codeToFind)) {
              throw new Error(`Can not find code to inject in ${args.path}`);
            }

            // Inject code to prevent deploying the assets
            contents = contents.replace(codeToFind, codeToFind + `return;`);
          } else if (
            args.path.includes(
              path.join('aws-cdk-lib', 'aws-lambda-nodejs', 'lib', 'bundling.'),
            )
          ) {
            // prevent initializing Docker if esbuild is no installed
            // Docker is used for bundling if esbuild is not installed, but it is not needed at this point
            const origCode =
              'const shouldBuildImage=props.forceDockerBundling||!Bundling.esbuildInstallation;';
            const replaceCode = 'const shouldBuildImage=false;';

            if (contents.includes(origCode)) {
              contents = contents.replace(origCode, replaceCode);
            } else {
              throw new Error(
                `Can not find code to inject in ${args.path} to prevent initializing Docker`,
              );
            }
          }

          return {
            contents,
            loader,
          };
        });
      },
    };

    const compileOutput = path.join(
      getProjectDirname(),
      outputFolder,
      `compiledCdk.${isESM ? 'mjs' : 'cjs'}`,
    );

    try {
      // Build CDK code
      await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        platform: 'node',
        keepNames: true,
        outfile: compileOutput,
        sourcemap: false,
        plugins: [injectCodePlugin],
        ...(isESM
          ? {
              format: 'esm',
              target: 'esnext',
              mainFields: ['module', 'main'],
              banner: {
                js: [
                  `import { createRequire as topLevelCreateRequire } from 'module';`,
                  `global.require = global.require ?? topLevelCreateRequire(import.meta.url);`,
                  `import { fileURLToPath as topLevelFileUrlToPath, URL as topLevelURL } from "url"`,
                  `global.__dirname = global.__dirname ?? topLevelFileUrlToPath(new topLevelURL(".", import.meta.url))`,
                ].join('\n'),
              },
            }
          : {
              format: 'cjs',
              target: 'node18',
            }),
        define: {
          // replace __dirname,... with the a variable that contains the file location
          __filename: '__fileloc.filename',
          __dirname: '__fileloc.dirname',
          __relativefilename: '__fileloc.relativefilename',
          __relativedirname: '__fileloc.relativedirname',
          'import.meta.url': '__fileloc.import.meta.url',
        },
      });
    } catch (error: any) {
      throw new Error(`Error building CDK code: ${error.message}`, {
        cause: error,
      });
    }

    const context = await this.getCdkContext(cdkConfigPath, config);

    const CDK_CONTEXT_JSON = {
      ...context,
      // prevent compiling assets
      'aws:cdk:bundling-stacks': [],
    };
    process.env.CDK_CONTEXT_JSON = JSON.stringify(CDK_CONTEXT_JSON);
    process.env.CDK_DEFAULT_REGION =
      config.region ?? (await this.getRegion(config.profile));
    Logger.verbose(`[CDK] Context:`, JSON.stringify(CDK_CONTEXT_JSON, null, 2));

    const awsCdkLibPath = await findNpmPath(
      path.join(getProjectDirname(), config.subfolder ?? '/'),
      'aws-cdk-lib',
    );
    Logger.verbose(`[CDK] aws-cdk-lib path: ${awsCdkLibPath}`);

    const lambdas = await this.runCdkCodeAndReturnLambdas({
      config,
      awsCdkLibPath,
      compileCodeFile: compileOutput,
    });

    const list = await Promise.all(
      lambdas.map(async (lambda) => {
        // handler slit into file and file name
        const handlerSplit = lambda.handler.split('.');

        const handler = handlerSplit.pop();
        const filename = handlerSplit[0];

        let codePath = lambda.codePath;

        if (!codePath) {
          const codePathJs = lambda.code?.path
            ? path.join(lambda.code.path, `${filename}.js`)
            : undefined;
          const codePathCjs = lambda.code?.path
            ? path.join(lambda.code.path, `${filename}.cjs`)
            : undefined;
          const codePathMjs = lambda.code?.path
            ? path.join(lambda.code.path, `${filename}.mjs`)
            : undefined;

          // get  the first file that exists
          codePath = [codePathJs, codePathCjs, codePathMjs]
            .filter((c) => c)
            .find((file) =>
              fs
                .access(file as string)
                .then(() => true)
                .catch(() => false),
            );

          if (!codePath) {
            throw new Error(
              `Code file not found for Lambda function ${lambda.code.path}`,
            );
          }
        }

        const packageJsonPath = await findPackageJson(codePath);
        Logger.verbose(`[CDK] package.json path: ${packageJsonPath}`);

        return {
          cdkPath: lambda.cdkPath,
          stackName: lambda.stackName,
          packageJsonPath,
          codePath,
          handler,
          bundling: lambda.bundling,
        };
      }),
    );

    return list;
  }

  /**
   * Run CDK code in a node thread worker and return the Lambda functions
   * @param param0
   * @returns
   */
  protected async runCdkCodeAndReturnLambdas({
    config,
    awsCdkLibPath,
    compileCodeFile,
  }: {
    config: LldConfigBase;
    awsCdkLibPath: string | undefined;
    compileCodeFile: string;
  }) {
    const lambdas: any[] = await new Promise((resolve, reject) => {
      const workerPath = pathToFileURL(
        path.resolve(
          path.join(getModuleDirname(), 'frameworks/cdkFrameworkWorker.mjs'),
        ),
      ).href;

      const worker = new Worker(new URL(workerPath), {
        workerData: {
          verbose: config.verbose,
          awsCdkLibPath,
          projectDirname: getProjectDirname(),
          moduleDirname: getModuleDirname(),
          subfolder: config.subfolder,
        },
      });

      worker.on('message', async (message) => {
        resolve(message);
        await worker.terminate();
      });

      worker.on('error', (error) => {
        reject(
          new Error(`Error running CDK code in worker: ${error.message}`, {
            cause: error,
          }),
        );
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`CDK worker stopped with exit code ${code}`));
        }
      });

      // worker.stdout.on('data', (data: Buffer) => {
      //   Logger.log(`[CDK]`, data.toString());
      // });

      // worker.stderr.on('data', (data: Buffer) => {
      //   Logger.error(`[CDK]`, data.toString());
      // });

      worker.postMessage({
        compileOutput: compileCodeFile,
      });
    });

    Logger.verbose(
      `[CDK] Found the following Lambda functions in the CDK code:`,
      JSON.stringify(lambdas, null, 2),
    );

    return lambdas as {
      cdkPath: string;
      stackName: string;
      codePath?: string;
      code: {
        path?: string;
      };
      handler: string;
      packageJsonPath: string;
      bundling: BundlingOptions;
    }[];
  }

  /**
   * Get CDK context
   * @param cdkConfigPath
   * @param config
   * @returns
   */
  protected async getCdkContext(cdkConfigPath: string, config: LldConfigBase) {
    // get CDK context from the command line
    // get all "-c" and "--context" arguments from the command line
    const contextFromLldConfig = config.context?.reduce(
      (acc: Record<string, string>, arg: string) => {
        const [key, value] = arg.split('=');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      },
      {},
    );

    // get all context from 'cdk.context.json' if it exists
    let contextFromJson = {};
    try {
      const cdkContextJson = await fs.readFile('cdk.context.json', 'utf8');
      contextFromJson = JSON.parse(cdkContextJson);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Error reading cdk.context.json: ${err.message}`);
      }
    }

    // get context from cdk.json
    let cdkJson: { context?: Record<string, string> } = {};
    try {
      cdkJson = JSON.parse(await fs.readFile(cdkConfigPath, 'utf8'));
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Error reading cdk.json: ${err.message}`);
      }
    }

    return { ...contextFromJson, ...cdkJson.context, ...contextFromLldConfig };
  }

  /**
   * Get CDK entry file
   * @param cdkConfigPath
   * @returns
   */
  async getCdkEntryFile(cdkConfigPath: string) {
    const cdkJson = await fs.readFile(cdkConfigPath, 'utf8');
    const cdkConfig = JSON.parse(cdkJson);
    const entry = cdkConfig.app as string | undefined;
    // just file that ends with .ts
    let entryFile = entry
      ?.split(' ')
      .find((file: string) => file.endsWith('.ts'))
      ?.trim();

    if (!entryFile) {
      throw new Error(`Entry file not found in ${cdkConfigPath}`);
    }

    entryFile = path.resolve(entryFile);
    Logger.verbose(`[CDK] Entry file: ${entryFile}`);

    return entryFile;
  }

  /**
   * Attempts to get the region from a number of sources and falls back to us-east-1 if no region can be found,
   * as is done in the AWS CLI.
   *
   * The order of priority is the following:
   *
   * 1. Environment variables specifying region, with both an AWS prefix and AMAZON prefix
   *    to maintain backwards compatibility, and without `DEFAULT` in the name because
   *    Lambda and CodeBuild set the $AWS_REGION variable.
   * 2. Regions listed in the Shared Ini Files - First checking for the profile provided
   *    and then checking for the default profile.
   * 3. xxx
   * 4. us-east-1
   *
   * Code from aws-cdk-cli/packages/@aws-cdk/tmp-toolkit-helpers/src/api/aws-auth
/awscli-compatible.ts
   */
  protected async getRegion(
    maybeProfile?: string,
  ): Promise<string | undefined> {
    const profile =
      maybeProfile ||
      process.env.AWS_PROFILE ||
      process.env.AWS_DEFAULT_PROFILE ||
      'default';

    const region =
      process.env.AWS_REGION ||
      process.env.AMAZON_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      process.env.AMAZON_DEFAULT_REGION ||
      (await this.getRegionFromIni(profile));

    return region;
  }

  /**
   * Looks up the region of the provided profile. If no region is present,
   * it will attempt to lookup the default region.
   * @param profile The profile to use to lookup the region
   * @returns The region for the profile or default profile, if present. Otherwise returns undefined.
   *
   * Code from aws-cdk-cli/packages/@aws-cdk/tmp-toolkit-helpers/src/api/aws-auth
   */
  private async getRegionFromIni(profile: string): Promise<string | undefined> {
    const sharedFiles = await loadSharedConfigFiles({ ignoreCache: true });
    return (
      this.getRegionFromIniFile(profile, sharedFiles.credentialsFile) ??
      this.getRegionFromIniFile(profile, sharedFiles.configFile) ??
      this.getRegionFromIniFile('default', sharedFiles.credentialsFile) ??
      this.getRegionFromIniFile('default', sharedFiles.configFile)
    );
  }

  /**
   * Get region from ini file
   * @param profile
   * @param data
   * @returns
   */
  private getRegionFromIniFile(profile: string, data?: any) {
    return data?.[profile]?.region;
  }
}

export const cdkFramework = new CdkFramework();
