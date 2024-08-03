import { outputFolder } from "../constants.js";
import * as esbuild from "esbuild";
import * as url from "url";
import * as path from "path";
import fs from "fs/promises";
import { LldConfigBase } from "../types/lldConfig.js";

/**
 * Get configuration from ts config file
 * @param configFile Config file
 * @returns Configuration
 */
export async function getConfigTsFromConfigFile(
  configFile: string,
): Promise<{ default: LldConfigBase } | undefined> {
  const compileOutput = path.resolve(`${outputFolder}/configCompiled.mjs`);

  // if file does not exist, return empty config
  try {
    await fs.stat(configFile);
  } catch {
    return undefined;
  }

  try {
    // Build CDK code
    await esbuild.build({
      entryPoints: [configFile],
      bundle: false,
      keepNames: true,
      platform: "node",
      metafile: true,
      target: "esnext",
      format: "esm",
      outfile: compileOutput,
      sourcemap: true,
      banner: {
        js: [
          `import { createRequire as topLevelCreateRequire } from 'module';`,
          `const require = topLevelCreateRequire(import.meta.url);`,
        ].join(""),
      },
    });
  } catch (error: any) {
    throw new Error(
      `Error building config file ${configFile}: ${error.message}`,
      { cause: error },
    );
  }

  const { href } = url.pathToFileURL(compileOutput);
  const config = await import(href);

  return config;
}
