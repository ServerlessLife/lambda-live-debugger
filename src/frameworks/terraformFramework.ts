import * as fs from "fs/promises";
import * as path from "path";
import { LambdaResource } from "../types/resourcesDiscovery.js";
import { constants } from "fs";
import { findPackageJson } from "../utils/findPackageJson.js";
import { exec } from "child_process";
import { promisify } from "util";
import ts from "typescript";
import { IFramework } from "./iFrameworks.js";
import { LldConfigBase } from "../types/lldConfig.js";
import { Logger } from "../logger.js";

export const execAsync = promisify(exec);

interface TerraformState {
  resources: Array<{
    type: string;
    name: string;
    values: {
      function_name?: string;
      handler?: string;
      source_dir?: string;
      source_file?: string;
    };
    //dependencies > depends_on
    depends_on: Array<string>;
  }>;
}

/**
 * Support for Terraform framework
 */
export class TerraformFramework implements IFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return "terraform";
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    // is there any filey with *.tf extension
    const files = await fs.readdir(process.cwd());
    return files.some((f) => f.endsWith(".tf"));
  }

  /**
   * Get Lambda functions
   * @param config Configuration
   * @returns Lambda functions
   */
  public async getLambdas(config: LldConfigBase): Promise<LambdaResource[]> {
    const state = await this.readTerraformState();
    const lambdas = this.extractLambdaInfo(state);

    Logger.verbose(
      "[Terraform] Found Lambdas:",
      JSON.stringify(lambdas, null, 2)
    );

    const lambdasDiscovered: LambdaResource[] = [];

    const tsOutDir = await this.getTsConfigOutDir();

    if (tsOutDir) {
      Logger.verbose("[Terraform] tsOutDir:", tsOutDir);
    }

    for (const func of lambdas) {
      const functionName = func.functionName;
      const handlerParts = func.handler.split(".");
      let handler: string;
      // get last part of the handler
      handler = handlerParts[handlerParts.length - 1];

      let filename = func.sourceFilename;
      let pathWithourExtension: string;
      if (filename) {
        // remove extension
        pathWithourExtension = filename.replace(/\.[^/.]+$/, "");
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
          .replace(tsOutDir, "")
          .replace(/\/\//g, "/");

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
        } catch (error) {}
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
      };

      lambdasDiscovered.push(lambdaResource);
    }

    return lambdasDiscovered;
  }

  protected extractLambdaInfo(state: TerraformState) {
    const lambdas: Array<{
      functionName: string;
      sourceDir?: string;
      sourceFilename?: string;
      handler: string;
    }> = [];

    for (const resource of state.resources) {
      if (resource.type === "aws_lambda_function") {
        Logger.verbose(
          "[Terraform] Found Lambda:",
          JSON.stringify(resource, null, 2)
        );

        let sourceDir: string | undefined;
        let sourceFilename: string | undefined;

        const functionName = resource.values.function_name;
        const handler = resource.values.handler;

        if (!functionName) {
          Logger.error("Failed to find function name for Lambda");
          continue;
        }

        // get dependency "data.archive_file"
        const dependencies = resource.depends_on;
        const archiveFileResourceName = dependencies.find((dep) =>
          dep.startsWith("data.archive_file.")
        );

        if (archiveFileResourceName) {
          // get the resource
          const name = archiveFileResourceName.split(".")[2];
          const archiveFileResource = state.resources.find(
            (r) => r.name === name
          );

          // get source_dir or source_filename
          if (archiveFileResource) {
            sourceDir = archiveFileResource.values.source_dir;
            sourceFilename = archiveFileResource.values.source_file;
          }
        }

        if (!sourceDir && !sourceFilename) {
          Logger.error(`Failed to find source code for Lambda ${functionName}`);
        } else {
          lambdas.push({
            functionName,
            sourceDir,
            sourceFilename,
            handler: handler ?? "handler",
          });
        }
      }
    }

    return lambdas;
  }

  protected async readTerraformState(): Promise<TerraformState> {
    // Is there a better way to get the Terraform state???

    let output: any;

    // get state by running "terraform show --json" command
    try {
      output = await execAsync("terraform show --json");
    } catch (error: any) {
      throw new Error(
        `Failed to get Terraform state from 'terraform show --json' command: ${error.message}`,
        { cause: error }
      );
    }

    if (output.stderr) {
      throw new Error(
        `Failed to get Terraform state from 'terraform show --json' command: ${output.stderr}`
      );
    }

    if (!output.stdout) {
      throw new Error(
        "Failed to get Terraform state from 'terraform show --json' command"
      );
    }

    let jsonString: string | undefined = output.stdout;

    Logger.verbose("Terraform state:", jsonString);

    jsonString = jsonString?.split("\n").find((line) => line.startsWith("{"));

    if (!jsonString) {
      throw new Error(
        "Failed to get Terraform state. JSON string not found in the output."
      );
    }

    try {
      const state = JSON.parse(jsonString);
      return state.values.root_module as TerraformState;
    } catch (error: any) {
      //save state to file
      await fs.writeFile("terraform-state.json", jsonString);
      Logger.error("Failed to parse Terraform state JSON:", error);
      throw new Error(
        `Failed to parse Terraform state JSON: ${error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Get the outDir from tsconfig.json
   */
  protected async getTsConfigOutDir() {
    let currentDir = process.cwd();
    let tsConfigPath;
    while (currentDir !== "/") {
      tsConfigPath = path.resolve(path.join(currentDir, "tsconfig.json"));
      try {
        await fs.access(tsConfigPath, constants.F_OK);
        break;
      } catch (error) {
        // tsconfig.json not found, move up one directory
        currentDir = path.dirname(currentDir);
      }
    }
    if (!tsConfigPath) {
      Logger.verbose("[Terraform] tsconfig.json not found");
      return undefined;
    }

    Logger.verbose("[Terraform] tsconfig.json found:", tsConfigPath);
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    const compilerOptions = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      "./"
    );

    return compilerOptions.options.outDir
      ? path.resolve(compilerOptions.options.outDir)
      : undefined;
  }
}

export const terraformFramework = new TerraformFramework();
