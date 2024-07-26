import * as chokidar from "chokidar";
import { NodeEsBuild } from "./nodeEsBuild.js";
import { NodeWorker } from "./nodeWorker.js";
import { Configuration } from "./configuration.js";
import { setTimeout } from "node:timers/promises";
import { Logger } from "./logger.js";

let processingChange = false;

/**
 * Watch for file changes in a folder and trigger a rebuild of the Lambdas
 * @param folder
 */
function watchForFileChanges(folder: string) {
  Logger.verbose(`Watching for file changes in ${folder}`);

  const watcher = chokidar.watch([folder], {
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    disableGlobbing: false,
    ignored: [
      "**/node_modules/**",
      "**/.lldebugger/**",
      "**/.git/**",
      "**/debug.log",
    ],
    awaitWriteFinish: {
      pollInterval: 100,
      stabilityThreshold: 20,
    },
  });

  watcher.on("change", async (file) => {
    if (processingChange) {
      return;
    }
    processingChange = true;
    try {
      await setTimeout(1000); // wait for files to be written
      NodeEsBuild.markAllBuildAsOld();
      await NodeWorker.stopAllWorkers();
      await Configuration.discoverLambdas();
    } finally {
      processingChange = false;
    }
  });
}

export const FileWatcher = {
  watchForFileChanges,
};
