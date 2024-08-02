import { createRequire as topLevelCreateRequire } from "module";
const require = topLevelCreateRequire(import.meta.url);
import path from "path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { workerData, parentPort } from "node:worker_threads";
import fs from "fs/promises";

import { Logger } from "../logger.mjs";

Logger.setVerbose(workerData.verbose);
Logger.verbose(`[CDK] [Worker] Started`);

parentPort.on("message", async (data) => {
  // this is global variable to store the data from the CDK code once it is executed
  global.lambdas = [];

  Logger.verbose(`[Worker ${workerData.workerId}] Received message`, data);

  // execute code to get the data into global.lambdas
  const codeFile = await fs.readFile(data.compileOutput, "utf8");

  await fixCdkPaths(workerData.awsCdkLibPath);

  eval(codeFile);

  if (!global.lambdas || global.lambdas?.length === 0) {
    throw new Error("No Lambda functions found in the CDK code");
  }

  const lambdas = global.lambdas.map((lambda) => ({
    handler: lambda.handler,
    stackName: lambda.stackName,
    codePath: lambda.codePath,
    code: {
      path: lambda.code?.path,
    },
    cdkPath: lambda.node.defaultChild.node.path,
    bundling: {
      ...lambda.bundling,
      commandHooks: undefined, // can not be serialized
    },
  }));

  Logger.verbose(
    `[CDK] [Worker] Sending found lambdas`,
    JSON.stringify(lambdas, null, 2)
  );
  parentPort.postMessage(lambdas);
});

/**
 * Some paths are not resolved correctly in the CDK code, so we need to fix them
 */
async function fixCdkPaths(awsCdkLibPath) {
  // leave this lines for manual debugging
  //const awsCdkLibPath = path.resolve("node_modules/aws-cdk-lib");
  //const path = require("path");

  Logger.verbose(`[CDK] [Worker] aws-cdk-lib PATH ${awsCdkLibPath}`);

  const pathsFix = {
    "custom-resource-handlers/": `${awsCdkLibPath}/custom-resource-handlers/`,
  };

  // Create a proxy to intercept calls to the path module so we can fix paths
  const pathProxy = new Proxy(path, {
    get(target, prop) {
      if (typeof target[prop] === "function") {
        return function (...args) {
          if (prop === "resolve") {
            let resolvedPath = target[prop].apply(target, args);

            for (const [key, value] of Object.entries(pathsFix)) {
              if (resolvedPath.includes(key)) {
                // replace the beginning of the path with the value
                const i = resolvedPath.indexOf(key);
                const newResolvedPath = `${value}${resolvedPath.substring(i + key.length)}`;
                Logger.verbose(
                  `[CDK] [Worker] Fixing path ${resolvedPath} -> ${newResolvedPath}`
                );
                resolvedPath = newResolvedPath;
              }
            }

            return resolvedPath;
          }
          return target[prop].apply(target, args);
        };
      }
      return target[prop];
    },
  });

  // Override the path module in the require cache
  require.cache[require.resolve("path")] = {
    exports: pathProxy,
  };
}
