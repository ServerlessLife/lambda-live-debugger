import { Worker } from "node:worker_threads";
import { FuctionRequest } from "./ioTService.js";
import * as path from "path";
import { Configuration } from "./configuration.js";
import { getModuleDirname, getProjectDirname } from "./getDirname.js";
import { Logger } from "./logger.js";

const workers = new Map<string, Worker>();

/**
 * Run the function in a Node.js Worker Thread
 * @param input
 * @returns
 */
async function runInWorker(input: {
  artifactFile: string;
  environment: {
    [key: string]: string | undefined;
  };
  fuctionRequest: FuctionRequest;
}) {
  const func = await Configuration.getLambda(input.fuctionRequest.functionId);

  return new Promise<void>(async (resolve, reject) => {
    let worker = workers.get(input.fuctionRequest.workerId);

    if (!worker) {
      worker = startWorker({
        handler: func.handler ?? "handler",
        artifactFile: input.artifactFile,
        workerId: input.fuctionRequest.workerId,
        functionId: input.fuctionRequest.functionId,
        environment: input.environment,
        verbose: Configuration.config.verbose,
      });
    } else {
      Logger.verbose(
        `[Function ${input.fuctionRequest.functionId}] [Worker ${input.fuctionRequest.workerId}] Reusing worker`
      );
    }

    worker.on("message", (msg) => {
      Logger.verbose(
        `[Function ${input.fuctionRequest.functionId}] [Worker ${input.fuctionRequest.workerId}] Worker message`,
        JSON.stringify(msg)
      );
      if (msg?.errorType) {
        reject(msg);
      } else {
        resolve(msg);
      }
    });
    worker.on("error", (err) => {
      Logger.error(
        `[Function ${input.fuctionRequest.functionId}] [Worker ${input.fuctionRequest.workerId}] Error`,
        err
      );
      reject(err);
    });

    worker.postMessage({
      env: input.fuctionRequest.env,
      event: input.fuctionRequest.event,
      context: input.fuctionRequest.context,
    });
  });
}

type WorkerRequest = {
  handler: string;
  artifactFile: string;
  workerId: string;
  functionId: string;
  environment: {
    [key: string]: string | undefined;
  };
  verbose?: boolean;
};

/**
 * Start a new Node.js Worker Thread
 * @param input
 * @returns
 */
function startWorker(input: WorkerRequest) {
  Logger.verbose(
    `[Function ${input.functionId}] [Worker ${input.workerId}] Starting worker`
  );

  let localProjectDir = getProjectDirname();

  const worker = new Worker(
    path.resolve(path.join(getModuleDirname(), `./nodeWorkerRunner.mjs`)),
    {
      env: {
        ...input.environment,
        IS_LOCAL: "true",
        LOCAL_PROJECT_DIR: localProjectDir,
      },
      execArgv: ["--enable-source-maps"],
      workerData: input,
      stderr: true,
      stdin: true,
      stdout: true,
      //type: "module",
    }
  );

  worker.stdout.on("data", (data: Buffer) => {
    Logger.verbose(
      `[Function ${input.functionId}] [Worker ${input.workerId}] `,
      data.toString()
    );
  });
  worker.stderr.on("data", (data: Buffer) => {
    Logger.verbose(
      `[Function ${input.functionId}] [Worker ${input.workerId}] `,
      data.toString()
    );
  });
  worker.on("exit", () => {
    Logger.verbose(
      `[Function ${input.functionId}] [Worker ${input.workerId}] Worker exited`
    );
    workers.delete(input.workerId);
  });
  workers.set(input.workerId, worker);

  return worker;
}

/**
 * Stop all Node.js Worker Threads
 */
async function stopAllWorkers() {
  Logger.verbose("Stopping all workers");
  const promises: Promise<any>[] = [];
  for (const worker of workers.values()) {
    promises.push(worker.terminate());
  }
  workers.clear();
  await Promise.all(promises);
}

export const NodeWorker = {
  runInWorker,
  stopAllWorkers,
};
