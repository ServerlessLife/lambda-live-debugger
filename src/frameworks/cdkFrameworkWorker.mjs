import { createRequire as topLevelCreateRequire } from "module";
const require = topLevelCreateRequire(import.meta.url);

import { workerData, parentPort } from "node:worker_threads";
import fs from "fs/promises";
import path from "path";

import { Logger } from "../logger.mjs";

Logger.setVerbose(workerData.verbose);
Logger.verbose(`[CDK] [Worker] Started`);

parentPort.on("message", async (data) => {
  // this is global variable to store the data from the CDK code once it is executed
  global.lambdas = [];

  Logger.verbose(`[Worker ${workerData.workerId}] Received message`, data);

  // execute code to get the data into global.lambdas
  const codeFile = await fs.readFile(data.compileOutput, "utf8");
  const __dirname = path.resolve("./x"); // CDK needs this, pure magic
  eval(codeFile);

  if (global.lambdas.length === 0) {
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
    bundling: lambda.bundling,
  }));

  try {
    Logger.verbose(
      `[CDK] [Worker] Sending found lambdas`,
      JSON.stringify(lambdas, null, 2)
    );
    parentPort.postMessage(lambdas);
  } catch (error) {
    handleError(error);
  }
});

process.on("unhandledRejection", (error) => {
  Logger.error(`[CDK] [Worker] Unhandled Rejection`, error);
  handleError(error);
});

function handleError(error) {
  parentPort.postMessage({
    errorType: error.name ?? "Error",
    errorMessage: error.message,
    trace: error.stack,
  });
}
