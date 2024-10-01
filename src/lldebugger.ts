// ******  support require in for CJS modules ******
import { createRequire } from 'module';
// @ts-ignore
const require = createRequire(import.meta.url);
global.require = require;

import { InfraDeploy } from './infraDeploy.js';
import { getVersion } from './version.js';
import { Configuration } from './configuration.js';
import { FileWatcher } from './fileWatcher.js';
import { GitIgnore } from './gitignore.js';
import { VsCode } from './vsCode.js';
import path from 'path';
import { getRootFolder } from './utils/getRootFolder.js';
import fs from 'fs/promises';
import { Logger } from './logger.js';
import { getModuleDirname, getProjectDirname } from './getDirname.js';
import { LambdaConnection } from './lambdaConnection.js';

/**
 * Start the Lambda Live Debugger
 */
async function run() {
  const version = await getVersion();

  Logger.log(`Welcome to Lambda Live Debugger 🐞 version ${version}.`);

  await Configuration.readConfig();

  Logger.setVerbose(Configuration.config.verbose === true);

  Logger.verbose(
    `Parameters: \n${Object.entries(Configuration.config)
      .map(([key, value]) => ` - ${key}=${value}`)
      .join('\n')}`,
  );
  Logger.verbose(`NPM module folder: ${getModuleDirname()}`);
  Logger.verbose(`Project folder: ${getProjectDirname()}`);

  if (Configuration.config.gitignore) {
    await GitIgnore.addToGitIgnore();
  }

  if (Configuration.config.vscode) {
    await VsCode.addConfiguration();
  }

  if (!Configuration.config.start && !Configuration.config.remove) {
    return;
  }

  let message = `Starting the debugger ${
    Configuration.config.observable
      ? 'in Observability mode'
      : `(ID ${Configuration.config.debuggerId})`
  }...`;

  if (Configuration.config.remove) {
    message = `Removing Lambda Live Debugger${Configuration.config.remove === 'all' ? ' including layer' : ''}...`;
  }

  Logger.log(message);

  if (Configuration.config.subfolder) {
    // change the current working directory to the subfolder for monorepos
    const newCurrentFolder = path.resolve(Configuration.config.subfolder);
    Logger.verbose(`Changing current folder to ${newCurrentFolder}`);
    process.chdir(newCurrentFolder);
  }

  await Configuration.discoverLambdas();

  if (Configuration.config.remove) {
    await InfraDeploy.removeInfrastructure();
    // await GitIgnore.removeFromGitIgnore();
    // delete folder .lldebugger
    const folder = path.join(getProjectDirname(), '.lldebugger');
    Logger.verbose(`Removing ${folder} folder...`);
    await fs.rm(folder, { recursive: true });

    if (Configuration.config.remove === 'all') {
      await InfraDeploy.deleteLayer();
    }

    Logger.log('Lambda Live Debugger removed!');

    return;
  }

  if (!Configuration.getLambdas().length) {
    Logger.error('No Lambdas found. Exiting...');
    return;
  }

  await InfraDeploy.deployInfrastructure();

  const folders = [
    path.resolve('.'),
    ...Configuration.getLambdas().map((l) => l.codePath),
  ];

  // get the uppermost folder of all lambdas or the project root to watch for changes
  const rootFolderForWarchingChanges = getRootFolder(folders);
  FileWatcher.watchForFileChanges(rootFolderForWarchingChanges);

  await LambdaConnection.connect();
  Logger.log('Debugger started!');
}

run().catch(Logger.error);
