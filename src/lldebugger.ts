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
import inquirer from 'inquirer';
import { JetBrains } from './jetBrains.js';

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

  if (Configuration.config.jetbrains) {
    await JetBrains.addConfiguration();
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

  if (!Configuration.config.remove) {
    Logger.log('Found the following Lambdas to debug:');
    Logger.log(
      ` - ${Configuration.getLambdasFiltered()
        .map((f) => `${f.functionName} code: ${f.codePath}`)
        .join('\n - ')}`,
    );
  }

  if (Configuration.config.remove) {
    const removalChanges = await InfraDeploy.getInfraChangesForRemoving();

    const hasChanges =
      removalChanges.lambdasToRemove.length ||
      removalChanges.rolesToRemove.length ||
      Configuration.config.remove === 'all';

    const changesMessage = `The following changes will be applied to your AWS account:${
      (removalChanges.lambdasToRemove.length
        ? `\n - Remove LLD layer and environment variables from Lambdas:\n${removalChanges.lambdasToRemove
            .map((l) => `   - ${l.functionName}`)
            .join('\n')}`
        : '') +
      (removalChanges.rolesToRemove.length
        ? `\n - Remove IoT permissions from IAM Roles:\n${removalChanges.rolesToRemove
            .map((r) => `   - ${r}`)
            .join('\n')}`
        : '') +
      (Configuration.config.remove === 'all'
        ? `\n - Delete Lambda Live Debugger layer`
        : '')
    }`;

    if (!hasChanges) {
      Logger.log('No infrastructure to remove.');
    } else if (Configuration.config.approval === true) {
      // ask for approval with changes shown in the prompt
      try {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'approval',
            message: `${changesMessage}\n\nDo you want to continue?`,
          },
        ]);

        if (!confirm.approval) {
          Logger.log('Exiting...');
          return;
        }
      } catch (error: any) {
        if (error.name === 'ExitPromptError') {
          // user canceled the prompt
          Logger.log('Exiting...');
          return;
        } else {
          throw error;
        }
      }
    } else {
      // show changes without approval
      Logger.log(changesMessage);
    }

    await InfraDeploy.applyRemoveInfra(removalChanges);
    // await GitIgnore.removeFromGitIgnore();
    // delete folder .lldebugger
    const folder = path.join(getProjectDirname(), '.lldebugger');
    try {
      Logger.verbose(`Removing ${folder} folder...`);
      await fs.access(folder);
      await fs.rm(folder, { recursive: true });
    } catch {
      Logger.verbose(`${folder} does not exist, skipping removal.`);
    }

    if (Configuration.config.remove === 'all') {
      await InfraDeploy.deleteLayer();
    }

    Logger.log('Lambda Live Debugger removed!');

    return;
  }

  if (!Configuration.getLambdasFiltered().length) {
    Logger.error('No Lambdas found. Exiting...');
    return;
  }

  const changes = await InfraDeploy.getInfraChangesForAdding();

  const hasChanges =
    changes.deployLayer ||
    changes.lambdasToAdd.length ||
    changes.rolesToAdd.length ||
    changes.lambdasToRemove.length ||
    changes.rolesToRemove.length;

  const changesMessage = `The following changes will be applied to your AWS account:${
    (changes.deployLayer
      ? `\n - Deploy Lambda Live Debugger layer version ${version}`
      : '') +
    (changes.lambdasToAdd.length
      ? `\n - Attach the layer and add environment variables to the Lambdas:\n${changes.lambdasToAdd
          .map((l) => `   - ${l.functionName}`)
          .join('\n')}`
      : '') +
    (changes.rolesToAdd.length
      ? `\n - Add IoT permissions to IAM Roles:\n${changes.rolesToAdd
          .map((r) => `   - ${r}`)
          .join('\n')}`
      : '') +
    (changes.lambdasToRemove.length
      ? `\n - Remove the layer and environment variables from Lambdas no longer in scope:\n${changes.lambdasToRemove
          .map((f) => `   - ${f.functionName}`)
          .join('\n')}`
      : '') +
    (changes.rolesToRemove.length
      ? `\n - Remove IoT permissions from IAM Roles no longer in scope:\n${changes.rolesToRemove
          .map((r) => `   - ${r}`)
          .join('\n')}`
      : '')
  }`;

  if (!hasChanges) {
    Logger.log('No infrastructure changes required.');
  } else if (Configuration.config.approval === true) {
    // ask for approval with changes shown in the prompt
    try {
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'approval',
          message: `${changesMessage}\n\nDo you want to continue?`,
        },
      ]);

      if (!confirm.approval) {
        Logger.log('Exiting...');
        return;
      }
    } catch (error: any) {
      if (error.name === 'ExitPromptError') {
        // user canceled the prompt
        Logger.log('Exiting...');
        return;
      } else {
        throw error;
      }
    }
  } else {
    // show changes without approval
    Logger.log(changesMessage);
  }

  await InfraDeploy.applyAddingInfra(changes);

  const folders = [
    path.resolve('.'),
    ...Configuration.getLambdasFiltered().map((l) => l.codePath),
  ];

  // get the uppermost folder of all lambdas or the project root to watch for changes
  const rootFolderForWatchingChanges = getRootFolder(folders);
  FileWatcher.watchForFileChanges(rootFolderForWatchingChanges);

  await LambdaConnection.connect();
  Logger.log('Debugger started!');
  Logger.info(
    `When you want to stop debugging and return to normal execution, type command 'lld -r' to remove LLD Layer from the functions.`,
  );
}

run().catch(Logger.error);
