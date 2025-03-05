import fs from 'fs/promises';
import path from 'path';
import { getModuleDirname, getProjectDirname } from '../getDirname.js';
import { Logger } from '../logger.js';

/**
 * Get the runtime executable for the IDE, like WebStorm or VSCode
 * @returns
 */
export async function getRuntimeExecutableForIde() {
  let runtimeExecutable: string | undefined;
  const localRuntimeExecutable = '${workspaceFolder}/node_modules/.bin/lld';

  const moduleDirname = getModuleDirname();
  const projectDirname = getProjectDirname();

  const localFolder = path.resolve(
    path.join(projectDirname, 'node_modules/.bin/lld'),
  );

  //if installed locally
  if (moduleDirname.startsWith('/home/')) {
    Logger.verbose('Lambda Live Debugger is installed locally');
    // check if file exists
    try {
      Logger.verbose(
        'Checking local folder for runtimeExecutable setting for VsCode configuration',
        localFolder,
      );
      await fs.access(localFolder, fs.constants.F_OK);
      runtimeExecutable = localRuntimeExecutable;
    } catch {
      // Not found
    }
  } else {
    Logger.verbose('Lambda Live Debugger is installed globally');
  }

  if (!runtimeExecutable) {
    Logger.verbose(
      `Setting absolute path for runtimeExecutable setting for VsCode configuration`,
    );
    const localFolderSubfolder = path.resolve('node_modules/.bin/lld');
    const globalModule1 = path.join(moduleDirname, '..', '..', '.bin/lld');
    const globalModule2 = path.join(moduleDirname, '..', '..', 'bin/lld');
    const globalModule3 = path.join(
      moduleDirname,
      '..',
      '..',
      '..',
      '..',
      'bin/lld',
    );
    const possibleFolders = {
      [localFolder]: '${workspaceFolder}/node_modules/.bin/lld',
      [localFolderSubfolder]: localFolderSubfolder,
      [globalModule1]: globalModule1,
      [globalModule2]: globalModule2,
      [globalModule3]: globalModule3,
    };

    Logger.verbose(
      `Checking the following possible folders for lld executable:`,
      JSON.stringify(possibleFolders, null, 2),
    );

    // check each possible folder and set the runtimeExecutable
    for (const folder in possibleFolders) {
      try {
        //Logger.log("Checking folder", folder);
        await fs.access(folder, fs.constants.F_OK);
        runtimeExecutable = possibleFolders[folder];
        Logger.verbose(`Found folder with lld executable: ${folder}`);
        break;
      } catch {
        // Not found
      }
    }

    if (!runtimeExecutable) {
      Logger.error(
        `Could not find lld executable. Please check your IDE debugger settings.`,
      );
    }
  }

  if (!runtimeExecutable) {
    return localRuntimeExecutable;
  }

  return runtimeExecutable;
}
