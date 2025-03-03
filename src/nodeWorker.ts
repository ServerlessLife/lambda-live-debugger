import { Worker } from 'node:worker_threads';
import { FuctionRequest } from './ioTService.js';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { Configuration } from './configuration.js';
import { getModuleDirname, getProjectDirname } from './getDirname.js';
import { Logger } from './logger.js';

interface MyWorker extends Worker {
  used?: boolean;
  toKill?: boolean;
  onMessage?: (msg: any) => void;
  onError?: (err: any) => void;
}

const workers = new Map<string, MyWorker>();

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

  return new Promise<void>((resolve, reject) => {
    let worker: MyWorker | undefined = workers.get(
      input.fuctionRequest.workerId,
    );

    if (!worker) {
      const environment = input.environment;
      addEnableSourceMapsToEnv(environment);

      worker = startWorker({
        handler: func.handler ?? 'handler',
        artifactFile: input.artifactFile,
        workerId: input.fuctionRequest.workerId,
        functionId: input.fuctionRequest.functionId,
        environment,
        verbose: Configuration.config.verbose,
      });
      worker.used = false;
      worker.toKill = false;
    } else {
      Logger.verbose(
        `[Function ${input.fuctionRequest.functionId}] [Worker ${input.fuctionRequest.workerId}] Reusing worker`,
      );
    }

    worker.onMessage = (msg) => {
      Logger.verbose(
        `[Function ${input.fuctionRequest.functionId}] [Worker ${input.fuctionRequest.workerId}] Worker message`,
        JSON.stringify(msg),
      );

      worker.used = false;
      if (msg?.errorType) {
        reject(msg);
      } else {
        resolve(msg);
      }

      if (worker.toKill) {
        worker.toKill = false;
        void worker.terminate();
      }
    };
    worker.onError = (err) => {
      Logger.error(
        `[Function ${input.fuctionRequest.functionId}] [Worker ${input.fuctionRequest.workerId}] Error`,
        err,
      );
      reject(err);
    };

    worker.used = true;
    worker.postMessage({
      env: input.fuctionRequest.env,
      event: input.fuctionRequest.event,
      context: input.fuctionRequest.context,
    });
  });
}

/**
 * Add NODE_OPTIONS: --enable-source-maps to the environment variables
 * @param environment
 */
function addEnableSourceMapsToEnv(environment: {
  [key: string]: string | undefined;
}) {
  const nodeOptions = environment.NODE_OPTIONS || '';
  if (!nodeOptions.includes('--enable-source-maps')) {
    environment.NODE_OPTIONS =
      nodeOptions + (nodeOptions ? ' ' : '') + '--enable-source-maps';
  }
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
    `[Function ${input.functionId}] [Worker ${input.workerId}] Starting worker. Artifact: ${input.artifactFile}`,
  );

  const localProjectDir = getProjectDirname();

  const workerPath = pathToFileURL(
    path.resolve(path.join(getModuleDirname(), `./nodeWorkerRunner.mjs`)),
  ).href;

  const worker: MyWorker = new Worker(new URL(workerPath), {
    env: {
      ...input.environment,
      IS_LOCAL: 'true',
      LOCAL_PROJECT_DIR: localProjectDir,
    },
    execArgv: ['--enable-source-maps'],
    workerData: input,
    stderr: true,
    stdin: true,
    stdout: true,
    //type: "module",
  });

  worker.stdout.on('data', (data: Buffer) => {
    Logger.log(`[Function ${input.functionId}]`, data.toString());
  });
  worker.stderr.on('data', (data: Buffer) => {
    Logger.error(`[Function ${input.functionId}]`, data.toString());
  });
  worker.on('exit', () => {
    Logger.verbose(
      `[Function ${input.functionId}] [Worker ${input.workerId}] Worker exited`,
    );
    workers.delete(input.workerId);
  });

  workers.set(input.workerId, worker);

  worker.on('message', (msg) => {
    worker?.onMessage?.(msg);
  });
  worker.on('error', (err) => {
    worker?.onError?.(err);
  });

  return worker;
}

/**
 * Stop all Node.js Worker Threads
 */
async function stopAllWorkers() {
  Logger.verbose('Stopping all workers');
  const promises: Promise<any>[] = [];
  for (const worker of workers.values()) {
    if (worker.used) {
      worker.toKill = true;
    } else {
      promises.push(worker.terminate());
    }
  }
  workers.clear();
  await Promise.all(promises);
}

export const NodeWorker = {
  runInWorker,
  stopAllWorkers,
};
