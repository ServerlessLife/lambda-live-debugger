import { LambdaProps } from "./types/lambdaProps.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as esbuild from "esbuild";
import { BuildOptions } from "esbuild";
import { Configuration } from "./configuration.js";
import { Logger } from "./logger.js";
import { getProjectDirname } from "./getDirname.js";
import { outputFolder } from "./constants.js";
import { combineArray } from "./utils/combineArray.js";
import { combineObject } from "./utils/combineObject.js";
import { combineObjectStrings } from "./utils/combineObjectStrings.js";
import { removeUndefinedProperties } from "./utils/removeUndefinedProperties.js";

type BuiltOutput = {
  result: Promise<esbuild.BuildResult>;
  ctx: Promise<esbuild.BuildContext>;
  current: boolean;
};

const buildCache: Record<string, BuiltOutput> = {};

/**
 * Get the build for the function
 * @param functionId
 * @returns
 */
async function getBuild(functionId: string) {
  try {
    let newBuild = false;
    const func = await Configuration.getLambda(functionId);

    // if handler is a JavaScript file and not force bundle, just return the file
    if (
      (func.codePath.endsWith(".js") ||
        func.codePath.endsWith(".mjs") ||
        func.codePath.endsWith(".cjs")) &&
      !func.forceBundle
    ) {
      return func.codePath;
    }

    // uses promise to avoid multiple parallel builds for the same function
    let buildAssets: BuiltOutput;
    if (buildCache[functionId] && buildCache[functionId].current) {
      // use existing build
      buildAssets = buildCache[functionId];
      Logger.verbose(`[Function ${functionId}] Using existing build`);
    } else {
      Logger.verbose(
        `[Function ${functionId}] No existing build found, building...`
      );
      newBuild = true;
      const newBuildAssets = build({
        functionId,
        function: func,
        oldCtx: !!buildCache[functionId]
          ? await buildCache[functionId].ctx
          : undefined,
      });
      buildAssets = {
        result: newBuildAssets.then((b) => b.result),
        ctx: newBuildAssets.then((b) => b.ctx),
        current: true,
      };
    }

    const result = await buildAssets.result;

    if (newBuild) {
      Logger.verbose(`[Function ${functionId}] Build complete`);
    }

    const artifactFile = Object.keys(result.metafile?.outputs!).find((key) =>
      key.endsWith(".js")
    );

    if (!artifactFile) {
      throw new Error(`Artifact file not found for function ${functionId}`);
    }

    return path.join(getProjectDirname(), artifactFile);
  } catch (error: any) {
    throw new Error(`Error building function ${functionId}: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Build the function
 * @param input
 * @returns
 */
async function build(input: {
  functionId: string;
  function: LambdaProps;
  oldCtx?: esbuild.BuildContext;
}): Promise<{
  result: esbuild.BuildResult;
  ctx: esbuild.BuildContext;
}> {
  const targetFolder = path.join(
    getProjectDirname(),
    `${outputFolder}/artifacts`,
    input.functionId
  );
  await fs.rm(targetFolder, { recursive: true, force: true });
  await fs.mkdir(targetFolder, { recursive: true });

  const esbuildOptions = removeUndefinedProperties(
    input.function.esBuildOptions
  );

  const handlerCodePath = input.function.codePath;

  // get module type from package.json
  const packageJsonPath = input.function.packageJsonPath;
  let isESMFromPackageJson = false;
  if (packageJsonPath) {
    const packageJson = JSON.parse(
      await fs.readFile(packageJsonPath, { encoding: "utf-8" })
    );
    isESMFromPackageJson = packageJson.type === "module";
  }

  let isESMFromBundling = esbuildOptions?.format === "esm" ? true : undefined;

  let isESM: boolean;

  if (
    isESMFromPackageJson !== undefined &&
    isESMFromBundling !== undefined &&
    isESMFromPackageJson !== isESMFromBundling
  ) {
    Logger.warn(
      `WARNING! Mismatch module type between package.json and bundling options for ${handlerCodePath}. Package.json: ${
        isESMFromPackageJson ? "ESM" : "CJS"
      }, bundling options: ${isESMFromBundling ? "ESM" : "CJS"}. Using ${
        isESMFromBundling ? "ESM" : "CJS"
      } from bunding otions.`
    );
    isESM = isESMFromBundling;
  } else if (isESMFromPackageJson !== undefined) {
    isESM = isESMFromPackageJson;
  } else if (isESMFromBundling !== undefined) {
    isESM = isESMFromBundling;
  } else {
    isESM = false;
  }

  let ctx = input.oldCtx;

  Logger.verbose(
    `[Function ${input.functionId}] Module type: ${isESM ? "ESM" : "CJS"})`
  );

  if (!ctx) {
    const optionsDefault: BuildOptions = {
      entryPoints: [handlerCodePath],
      platform: "node",
      keepNames: true,
      bundle: true,
      logLevel: "silent",

      metafile: true,
      ...(isESM
        ? {
            format: "esm",
            target: "esnext",
            mainFields: ["module", "main"],
            banner: {
              js: [
                `import { createRequire as topLevelCreateRequire } from 'module';`,
                `global.require = global.require ?? topLevelCreateRequire(import.meta.url);`,
                `import { fileURLToPath as topLevelFileUrlToPath, URL as topLevelURL } from "url"`,
                `global.__dirname = global.__dirname ?? topLevelFileUrlToPath(new topLevelURL(".", import.meta.url))`,
              ].join("\n"),
            },
          }
        : {
            format: "cjs",
            target: "node14",
          }),
      outdir: targetFolder,
      sourcemap: "linked",
    };

    const options: BuildOptions = {
      ...optionsDefault,
      ...esbuildOptions,
      external: combineArray(optionsDefault.external, esbuildOptions?.external),
      alias: combineObject(optionsDefault.alias, esbuildOptions?.alias),
      loader: combineObject(optionsDefault.loader, esbuildOptions?.loader),
      resolveExtensions: combineArray(
        optionsDefault.resolveExtensions,
        esbuildOptions?.resolveExtensions
      ),
      mainFields: combineArray(
        optionsDefault.mainFields,
        esbuildOptions?.mainFields
      ),
      conditions: combineArray(
        optionsDefault.conditions,
        esbuildOptions?.conditions
      ),
      outExtension: combineObject(
        optionsDefault.outExtension,
        esbuildOptions?.outExtension
      ),
      banner: combineObjectStrings(
        optionsDefault.banner,
        esbuildOptions?.banner
      ),
      footer: combineObjectStrings(
        optionsDefault.footer,
        esbuildOptions?.footer
      ),
      plugins: combineArray(optionsDefault.plugins, esbuildOptions?.plugins),
      nodePaths: combineArray(
        optionsDefault.nodePaths,
        esbuildOptions?.nodePaths
      ),
    };

    // remove all undefined values just to make it cleaner
    removeUndefinedProperties(options);

    if (Configuration.config.verbose) {
      Logger.verbose(
        `[Function ${input.functionId}] Building ${handlerCodePath} with options:`,
        JSON.stringify(options, null, 2)
      );
    } else {
      Logger.log(`[Function ${input.functionId}] Building ${handlerCodePath}`);
    }
    ctx = await esbuild.context(options);
  }

  const result = await ctx.rebuild();

  if (input.function.packageJsonPath) {
    const from = path.resolve(input.function.packageJsonPath);
    Logger.verbose(`[Function ${input.functionId}] package.json: ${from}`);
    const to = path.resolve(path.join(targetFolder, "package.json"));

    await fs.copyFile(from, to);
  } else {
    Logger.verbose(`[Function ${input.functionId}] No package.json found`);
  }

  return {
    ctx: ctx as esbuild.BuildContext,
    result: result as esbuild.BuildResult,
  };
}

/**
 * Mark all builds as old
 */
function markAllBuildAsOld() {
  for (const key in buildCache) {
    buildCache[key].current = false;
  }
}

export const NodeEsBuild = {
  getBuild,
  markAllBuildAsOld,
};
