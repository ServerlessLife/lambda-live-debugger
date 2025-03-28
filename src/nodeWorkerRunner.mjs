// @ts-nocheck
import { createRequire as topLevelCreateRequire } from 'module';
import { pathToFileURL } from 'url';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const require = topLevelCreateRequire(import.meta.url);

import { workerData, parentPort } from 'node:worker_threads';
import { Logger } from './logger.mjs';

Logger.setVerbose(workerData.verbose);
Logger.verbose(
  `[Function ${workerData.functionId}] [Worker ${workerData.workerId}] Worker started.`,
);

parentPort.on('message', async (data) => {
  Logger.verbose(`[Worker ${workerData.workerId}] Received message`, data);
  try {
    const artifactFile = pathToFileURL(workerData.artifactFile).href;
    const mod = await import(artifactFile);
    const fn = mod[workerData.handler];

    if (!fn) {
      throw new Error(
        `Handler '${workerData.handler}' not found for function '${workerData.functionId}'`,
      );
    }

    const context = {
      ...data.context,
      getRemainingTimeInMillis: () => 2147483647, // Max 32-bit signed integer
      done() {
        throw new Error(
          '`done` function on lambda Context is not implemented in Lambda Live Debugger.',
        );
      },
      fail() {
        throw new Error(
          '`fail` function on lambda Context is not implemented in Lambda Live Debugger.',
        );
      },
      succeed() {
        throw new Error(
          '`succeed` function on lambda Context is not implemented in Lambda Live Debugger.',
        );
      },
    };

    const res = await fn(data.event, context);
    Logger.verbose(
      `[Function ${workerData.functionId}] [Worker ${workerData.workerId}] Sending response`,
      res,
    );
    parentPort.postMessage(res);
  } catch (error) {
    handleError(error);
  }
});

process.on('unhandledRejection', (error) => {
  Logger.error(
    `[Function ${workerData.functionId}] [Worker ${workerData.workerId}] Unhandled Rejection`,
    error,
  );
  handleError(error);
});

function handleError(error) {
  parentPort.postMessage({
    errorType: error.name ?? 'Error',
    errorMessage: error.message ?? error.toString(),
    trace: error.stack,
  });
}
