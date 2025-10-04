// @ts-nocheck
import { workerData, parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'url';
import { Logger } from '../logger.mjs';

Logger.setVerbose(workerData.verbose);

Logger.verbose(`[CDK] [Worker] Started`);

parentPort.on('message', async (data) => {
  try {
    // this is global variable to store the data from the CDK code once it is executed
    global.lambdas = [];

    Logger.verbose(`[Worker] Received message`, data);

    // execute code to get the data into global.lambdas
    await import(pathToFileURL(data.compileOutput).href);

    if (!global.lambdas || global.lambdas?.length === 0) {
      throw new Error('No Lambda functions found in the CDK code');
    }

    const lambdas = global.lambdas.map((lambda) => ({
      handler: lambda.handler,
      stackName: lambda.stackName,
      codePath: lambda.codePath,
      stackCdkPath: lambda.stackCdkPath,
      rootStackName: lambda.rootStackName,
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
      `[CDK] [Worker] Sending found Lambdas`,
      JSON.stringify(lambdas, null, 2),
    );
    parentPort.postMessage(lambdas);
  } catch (error) {
    Logger.error(`[CDK] [Worker] Error`, error);
    throw error;
  }
});

process.on('unhandledRejection', (error) => {
  Logger.error(`[CDK] [Worker] Unhandled Rejection`, error);
});
