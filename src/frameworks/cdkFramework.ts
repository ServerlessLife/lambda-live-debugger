import * as esbuild from "esbuild";
import * as fs from "fs/promises";
import * as path from "path";
import { BundlingType, LambdaResource } from "../types/resourcesDiscovery.js";
import { outputFolder } from "../constants.js";
import { findPackageJson } from "../utils/findPackageJson.js";
import { IFramework } from "./iFrameworks.js";
import { CloudFormation } from "../cloudFormation.js";
import { AwsConfiguration } from "../types/awsConfiguration.js";
import { LldConfigBase } from "../types/lldConfig.js";
import { Logger } from "../logger.js";
import { Worker } from "node:worker_threads";
import { getModuleDirname, getProjectDirname } from "../getDirname.js";
import { Configuration } from "../configuration.js";
import { findNpmPath } from "../utils/findNpmPath.js";

/**
 * Support for AWS CDK framework
 */
export class CdkFramework implements IFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return "cdk";
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    // check if there is cdk.json
    const cdkJsonPath = path.resolve("cdk.json");

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

    const cdkConfigPath = "cdk.json";
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
      `[CDK] Found the following stacks in CDK: ${stackNames.join(", ")}`,
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
    const lambdas = Object.entries(cfTemplate.Resources)
      .filter(
        ([, resource]: [string, any]) =>
          resource.Type === "AWS::Lambda::Function",
      )
      .map(([key, resource]: [string, any]) => {
        return {
          logicalId: key,
          cdkPath: resource.Metadata["aws:cdk:path"],
        };
      });

    return lambdas;
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
    // Define a plugin to prepend custom code to .ts or .tsx files
    const injectCodePlugin: esbuild.Plugin = {
      name: "injectCode",
      setup(build: esbuild.PluginBuild) {
        build.onLoad({ filter: /.*/ }, async (args: esbuild.OnLoadArgs) => {
          const absolutePath = path.resolve(args.path);

          let source = await fs.readFile(absolutePath, "utf8");

          if (args.path.includes("aws-cdk-lib/aws-lambda/lib/function.")) {
            const codeToFind =
              "try{jsiiDeprecationWarnings().aws_cdk_lib_aws_lambda_FunctionProps(props)}";

            if (!source.includes(codeToFind)) {
              throw new Error(`Can not find code to inject in ${args.path}`);
            }

            // Inject code to get the file path of the Lambda function and CDK hierarchy
            // path to match it with the Lambda function. Store data in the global variable.
            source = source.replace(
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
          }

          if (
            args.path.includes(
              "aws-cdk-lib/aws-s3-deployment/lib/bucket-deployment.",
            )
          ) {
            const codeToFind = "super(scope,id),this.requestDestinationArn=!1;";

            if (!source.includes(codeToFind)) {
              throw new Error(`Can not find code to inject in ${args.path}`);
            }

            // Inject code to prevent deploying the assets
            source = source.replace(codeToFind, codeToFind + `return;`);
          }

          return {
            contents: source,
            loader: "default",
          };
        });
      },
    };

    const compileOutput = path.join(
      getProjectDirname(),
      outputFolder,
      `compiledCdk.js`,
    );
    try {
      // Build CDK code
      await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        platform: "node",
        target: "node18",
        outfile: compileOutput,
        sourcemap: false,
        plugins: [injectCodePlugin],
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
      "aws:cdk:bundling-stacks": [],
    };
    process.env.CDK_CONTEXT_JSON = JSON.stringify(CDK_CONTEXT_JSON);
    Logger.verbose(`[CDK] Context:`, JSON.stringify(CDK_CONTEXT_JSON, null, 2));

    const awsCdkLibPath = await findNpmPath(
      path.join(getProjectDirname(), config.subfolder ?? "/"),
      "aws-cdk-lib",
    );
    Logger.verbose(`[CDK] aws-cdk-lib path: ${awsCdkLibPath}`);

    const lambdas: any[] = await new Promise((resolve, reject) => {
      const worker = new Worker(
        path.resolve(
          path.join(getModuleDirname(), "frameworks/cdkFrameworkWorker.mjs"),
        ),
        {
          workerData: {
            verbose: Configuration.config.verbose,
            awsCdkLibPath,
          },
        },
      );

      worker.on("message", async (message) => {
        resolve(message);
        await worker.terminate();
      });

      worker.on("error", (error) => {
        reject(
          new Error(`Error running CDK code in worker: ${error.message}`, {
            cause: error,
          }),
        );
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`CDK worker stopped with exit code ${code}`));
        }
      });

      worker.postMessage({
        compileOutput,
      });
    });

    Logger.verbose(
      `[CDK] Found the following Lambda functions in the CDK code:`,
      JSON.stringify(lambdas, null, 2),
    );

    const list = await Promise.all(
      lambdas.map(async (lambda: any) => {
        // handler slit into file and file name
        const handlerSplit = lambda.handler.split(".");

        const handler = handlerSplit.pop();
        const filename = handlerSplit[0];

        let codePath = lambda.codePath;

        if (!codePath) {
          const codePathJs = path.join(lambda.code.path, `${filename}.js`);
          const codePathCjs = path.join(lambda.code.path, `${filename}.cjs`);
          const codePathMjs = path.join(lambda.code.path, `${filename}.mjs`);

          // get the first file that exists
          codePath = [codePathJs, codePathCjs, codePathMjs].find((file) =>
            fs
              .access(file)
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
        const [key, value] = arg.split("=");
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      },
      {},
    );

    // get all context from 'cdk.context.json' if it exists
    let contextFromJson = {};
    try {
      const cdkContextJson = await fs.readFile("cdk.context.json", "utf8");
      contextFromJson = JSON.parse(cdkContextJson);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw new Error(`Error reading cdk.context.json: ${err.message}`);
      }
    }

    // get context from cdk.json
    let cdkJson: { context?: Record<string, string> } = {};
    try {
      cdkJson = JSON.parse(await fs.readFile(cdkConfigPath, "utf8"));
    } catch (err: any) {
      if (err.code !== "ENOENT") {
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
    const cdkJson = await fs.readFile(cdkConfigPath, "utf8");
    const cdkConfig = JSON.parse(cdkJson);
    const entry = cdkConfig.app as string | undefined;
    // just file that ends with .ts
    let entryFile = entry
      ?.split(" ")
      .find((file: string) => file.endsWith(".ts"))
      ?.trim();

    if (!entryFile) {
      throw new Error(`Entry file not found in ${cdkConfigPath}`);
    }

    entryFile = path.resolve(entryFile);
    Logger.verbose(`[CDK] Entry file: ${entryFile}`);

    return entryFile;
  }
}

export const cdkFramework = new CdkFramework();
