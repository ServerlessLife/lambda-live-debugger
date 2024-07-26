import fs from "fs/promises";
import path from "path";
import {
  parse,
  printParseErrorCode,
  ParseError,
  applyEdits,
  modify,
  FormattingOptions,
} from "jsonc-parser";
import { VsCodeLaunch } from "./types/vsCodeConfig.js";
import { LldConfig } from "./types/lldConfig.js";
import { getModuleDirname } from "./getDirname.js";
import { Logger } from "./logger.js";

async function getVsCodeLaunchConfig(lldConfig?: LldConfig) {
  const localRuntimeExecutable = "${workspaceFolder}/node_modules/.bin/lld";

  const config: VsCodeLaunch = {
    version: "0.2.0",
    configurations: [
      {
        name: "Lambda Live Debugger",
        type: "node",
        request: "launch",
        runtimeExecutable: localRuntimeExecutable,
        runtimeArgs: [],
        console: "integratedTerminal",
        skipFiles: ["<node_internals>/**"],
        env: {},
      },
    ],
  };

  const moduleDirname = getModuleDirname();
  //Logger.log("Module folder", moduleDirname);
  const currentFolder = path.resolve();
  //Logger.log("Current folder", currentFolder);
  const localFolder = path.join(currentFolder, "node_modules/.bin/lld");

  let runtimeExecutableSet = false;

  //if installed locally
  if (moduleDirname.startsWith("/home/")) {
    // check if file exists
    try {
      //Logger.log("Checking local folder", localFolder);
      await fs.access(localFolder, fs.constants.F_OK);
      config.configurations![0].runtimeExecutable = localRuntimeExecutable;
      runtimeExecutableSet = true;
      //Logger.log("Found local folder", localFolder);
    } catch (err) {
      //Logger.log("Not found", localFolder);
    }
  }

  if (!runtimeExecutableSet) {
    const globalModule1 = path.join(moduleDirname, "..", "..", ".bin/lld");
    const globalModule2 = path.join(moduleDirname, "..", "..", "bin/lld");
    const globalModule3 = path.join(
      moduleDirname,
      "..",
      "..",
      "..",
      "..",
      "bin/lld"
    );
    const possibleFolders = {
      [localFolder]: "${workspaceFolder}/node_modules/.bin/lld",
      [globalModule1]: globalModule1,
      [globalModule2]: globalModule2,
      [globalModule3]: globalModule3,
    };

    // check each possible folder and set the runtimeExecutable
    for (const folder in possibleFolders) {
      try {
        //Logger.log("Checking folder", folder);
        await fs.access(folder, fs.constants.F_OK);
        config.configurations![0].runtimeExecutable = possibleFolders[folder];
        runtimeExecutableSet = true;
        //Logger.log("Found folder", folder);
        break;
      } catch (err) {
        //Logger.log("Not found", folder);
      }
    }

    if (!runtimeExecutableSet) {
      Logger.error(
        `Could not find lld executable. Please check the setting runtimeExecutable in '.vscode/launch.json'.`
      );
    }
  }

  return config;
}

async function readLaunchJson(filePath: string): Promise<{
  json: any;
  jsonString: string;
}> {
  try {
    const jsonString = await fs.readFile(filePath, "utf-8");
    const errors: ParseError[] = [];
    const json = parse(jsonString, errors, {
      allowTrailingComma: true,
      allowEmptyContent: true,
    });

    if (errors.length) {
      errors.forEach((error) => {
        Logger.error(
          `Error at offset ${error.offset}: ${printParseErrorCode(error.error)}`
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
  position: number
) {
  try {
    const formattingOptions: FormattingOptions = {
      insertSpaces: true,
      tabSize: 2,
    };
    // Apply changes to the original JSON string
    const edits = modify(jsonString, ["configurations", position], changes, {
      formattingOptions,
    });
    const modifiedJsonString = applyEdits(jsonString, edits);

    // Write the modified JSON string back to the file
    await fs.writeFile(filePath, modifiedJsonString, "utf-8");
  } catch (err) {
    Logger.error(`Error writing the file: ${err}`);
    throw err;
  }
}

async function getCurrentState(): Promise<
  | {
      state: "FILE_EXISTS_CONFIGURATION_EXISTS";
    }
  | {
      state: "FILE_DOES_NOT_EXIST";
      filePath: string;
    }
  | {
      state: "FILE_EXISTS_CONFIGURATION_DOES_NOT_EXIST";
      jsonString: string;
      configurationsLength: number;
      filePath: string;
    }
> {
  const filePath = path.join(path.resolve(), ".vscode/launch.json");

  let createNewFile = false;

  // does file exist
  try {
    await fs.access(filePath, fs.constants.F_OK);
  } catch (err) {
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
      return {
        state: "FILE_EXISTS_CONFIGURATION_DOES_NOT_EXIST",
        jsonString,
        configurationsLength: existingConfig.configurations?.length || 0,
        filePath,
      };
    } else {
      Logger.log("Configuration already exists!");
      return {
        state: "FILE_EXISTS_CONFIGURATION_EXISTS",
      };
    }
  } else {
    return {
      state: "FILE_DOES_NOT_EXIST",
      filePath,
    };
  }
}

async function isConfigured() {
  const state = await getCurrentState();

  if (state.state === "FILE_EXISTS_CONFIGURATION_EXISTS") {
    return true;
  }

  return false;
}

async function addConfiguration(lldConfig: LldConfig) {
  Logger.log("Adding configuration to .vscode/launch.json");
  const state = await getCurrentState();

  const config = await getVsCodeLaunchConfig(lldConfig);

  if (state.state === "FILE_EXISTS_CONFIGURATION_DOES_NOT_EXIST") {
    const { jsonString, filePath, configurationsLength } = state;

    await writeConfiguration(
      filePath,
      jsonString,
      config.configurations![0],
      configurationsLength
    );
  } else if (state.state === "FILE_DOES_NOT_EXIST") {
    // crete folder of filePath recursive if not exists
    await fs.mkdir(path.dirname(state.filePath), { recursive: true });

    await fs.writeFile(
      state.filePath,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }
}

export const VsCode = {
  isConfigured,
  addConfiguration,
};
