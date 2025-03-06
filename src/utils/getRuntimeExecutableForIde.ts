import fs from 'fs/promises';
import path from 'path';
import { getProjectDirname } from '../getDirname.js';
import { Logger } from '../logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

async function findGlobalPackagePath(packageName: string) {
  try {
    const command =
      os.platform() === 'win32'
        ? `where ${packageName}`
        : `which ${packageName}`;
    const { stdout } = await execAsync(command);

    Logger.verbose(
      `Searching for ${packageName} globally. Executed command: ${command}. Output: ${stdout}`,
    );

    const path = stdout?.trim().split('\n')[0];

    if (path) {
      console.log(
        `Global installation path for ${packageName}: ${path.trim()}`,
      );
      return path;
    }
    return undefined;
  } catch (error) {
    Logger.verbose(`Error finding package ${packageName}`, error);
    return undefined;
  }
}

/**
 * Get the runtime executable for the IDE, like WebStorm or VSCode
 * @returns
 */
export async function getRuntimeExecutableForIde(allowGlobal = true) {
  let runtimeExecutable: string | undefined;
  const localRuntimeExecutable = '${workspaceFolder}/node_modules/.bin/lld';

  const projectDirname = getProjectDirname();

  const localFolder = path.resolve(
    path.join(projectDirname, 'node_modules/.bin/lld'),
  );

  //if installed locally
  try {
    Logger.verbose(
      'Checking local folder for runtimeExecutable setting for VsCode configuration',
      localFolder,
    );
    await fs.access(localFolder, fs.constants.F_OK);
    runtimeExecutable = localRuntimeExecutable;
    Logger.verbose('Lambda Live Debugger is installed locally');
  } catch {
    // Not found
  }

  if (!runtimeExecutable) {
    Logger.verbose('Lambda Live Debugger is installed globally');

    if (allowGlobal) {
      runtimeExecutable = await findGlobalPackagePath('lld');
    } else {
      return undefined;
    }
  }

  if (!runtimeExecutable) {
    return localRuntimeExecutable;
  }

  return runtimeExecutable;
}
