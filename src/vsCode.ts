import fs from 'fs/promises';
import path from 'path';
import {
  parse,
  printParseErrorCode,
  ParseError,
  applyEdits,
  modify,
  FormattingOptions,
} from 'jsonc-parser';
import { VsCodeLaunch } from './types/vsCodeConfig.js';
import { getProjectDirname } from './getDirname.js';
import { Logger } from './logger.js';
import { getRuntimeExecutableForIde } from './utils/getRuntimeExecutableForIde.js';

async function getVsCodeLaunchConfig() {
  const runtimeExecutable = await getRuntimeExecutableForIde();

  const config: VsCodeLaunch = {
    version: '0.2.0',
    configurations: [
      {
        name: 'Lambda Live Debugger',
        type: 'node',
        request: 'launch',
        runtimeExecutable: runtimeExecutable!,
        runtimeArgs: [],
        console: 'integratedTerminal',
        skipFiles: ['<node_internals>/**'],
        env: {},
      },
    ],
  };

  return config;
}

async function readLaunchJson(filePath: string): Promise<{
  json: any;
  jsonString: string;
}> {
  try {
    const jsonString = await fs.readFile(filePath, 'utf-8');
    const errors: ParseError[] = [];
    const json = parse(jsonString, errors, {
      allowTrailingComma: true,
      allowEmptyContent: true,
    });

    if (errors.length) {
      errors.forEach((error) => {
        Logger.error(
          `Error at offset ${error.offset}: ${printParseErrorCode(error.error)}`,
        );
      });
    } else {
      return { json, jsonString };
    }
  } catch (err: any) {
    Logger.error(err);
  }

  throw new Error(`Error reading the file: ${filePath}`);
}

async function writeConfiguration(
  filePath: string,
  jsonString: string,
  changes: any,
  position: number,
) {
  try {
    const formattingOptions: FormattingOptions = {
      insertSpaces: true,
      tabSize: 2,
    };
    // Apply changes to the original JSON string
    const edits = modify(jsonString, ['configurations', position], changes, {
      formattingOptions,
    });
    const modifiedJsonString = applyEdits(jsonString, edits);

    // Write the modified JSON string back to the file
    Logger.verbose(`Adding to VsCode configuration file: ${filePath}`);
    await fs.writeFile(filePath, modifiedJsonString, 'utf-8');
  } catch (err) {
    Logger.error(`Error writing the file: ${err}`);
    throw err;
  }
}

async function getCurrentState(): Promise<
  | {
      state: 'FILE_EXISTS_CONFIGURATION_EXISTS';
    }
  | {
      state: 'FILE_DOES_NOT_EXIST';
      filePath: string;
    }
  | {
      state: 'FILE_EXISTS_CONFIGURATION_DOES_NOT_EXIST';
      jsonString: string;
      configurationsLength: number;
      filePath: string;
    }
> {
  const filePath = path.join(getProjectDirname(), '.vscode/launch.json');

  let createNewFile = false;

  // does file exist
  try {
    await fs.access(filePath, fs.constants.F_OK);
  } catch {
    createNewFile = true;
  }

  if (!createNewFile) {
    const { json, jsonString } = await readLaunchJson(filePath);

    const existingConfig = json as VsCodeLaunch;

    // does configurations exist
    const vsCodeLaunchConfig = await getVsCodeLaunchConfig();
    const exists = !!existingConfig.configurations?.find((c: any) => {
      return c.name === vsCodeLaunchConfig.configurations![0].name;
    });

    if (!exists) {
      Logger.verbose(`${filePath} exists but configuration does not exist!`);
      return {
        state: 'FILE_EXISTS_CONFIGURATION_DOES_NOT_EXIST',
        jsonString,
        configurationsLength: existingConfig.configurations?.length || 0,
        filePath,
      };
    } else {
      Logger.verbose(`Configuration already exists in ${filePath}`);
      return {
        state: 'FILE_EXISTS_CONFIGURATION_EXISTS',
      };
    }
  } else {
    Logger.verbose(`${filePath} does not exist!`);
    return {
      state: 'FILE_DOES_NOT_EXIST',
      filePath,
    };
  }
}

async function isConfigured() {
  try {
    const state = await getCurrentState();

    if (state.state === 'FILE_EXISTS_CONFIGURATION_EXISTS') {
      return true;
    }

    return false;
  } catch (err) {
    Logger.error(
      'Error checking if configuration exists in .vscode/launch.json',
      err,
    );
    return true;
  }
}

async function addConfiguration() {
  try {
    Logger.log('Adding configuration to .vscode/launch.json');
    const state = await getCurrentState();

    const config = await getVsCodeLaunchConfig();

    if (state.state === 'FILE_EXISTS_CONFIGURATION_DOES_NOT_EXIST') {
      const { jsonString, filePath, configurationsLength } = state;

      await writeConfiguration(
        filePath,
        jsonString,
        config.configurations![0],
        configurationsLength,
      );
    } else if (state.state === 'FILE_DOES_NOT_EXIST') {
      // crete folder of filePath recursive if not exists
      await fs.mkdir(path.dirname(state.filePath), { recursive: true });

      Logger.verbose(`Creating VsCode configuration file: ${state.filePath}`);
      await fs.writeFile(
        state.filePath,
        JSON.stringify(config, null, 2),
        'utf-8',
      );
    }
  } catch (err) {
    Logger.error('Error adding configuration to .vscode/launch.json', err);
  }
}

export const VsCode = {
  isConfigured,
  addConfiguration,
};
