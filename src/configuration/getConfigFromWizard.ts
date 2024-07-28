import inquirer from "inquirer";
import {
  LldConfig,
  LldConfigBase,
  LldConfigCliArgs,
  LldConfigTs,
} from "../types/lldConfig.js";
import {
  defaultObservableInterval,
  configFileDefaultName,
} from "../constants.js";
import path from "path";
import fs from "fs/promises";
import { LambdaResource } from "../types/resourcesDiscovery.js";
import { ResourceDiscovery } from "../resourceDiscovery.js";
import { GitIgnore } from "../gitignore.js";
import { VsCode } from "../vsCode.js";
import { Logger } from "../logger.js";
import { Configuration } from "../configuration.js";

const configFileName = path.resolve(configFileDefaultName);

/**
 * Get configuration from wizard
 * @param parameters
 * @returns
 */
export async function getConfigFromWizard({
  supportedFrameworks,
  currentFramework,
  currentConfig,
}: {
  supportedFrameworks: string[];
  currentFramework: string | undefined;
  currentConfig?: LldConfigTs;
}): Promise<LldConfigBase> {
  let lambdasList: LambdaResource[] | undefined;

  let answers = await inquirer.prompt([
    {
      type: "list",
      name: "framework",
      message: `Which framework are you using (detected ${currentFramework})?`,
      choices: supportedFrameworks,
      default: currentConfig?.framework ?? currentFramework,
    },
  ]);

  const oldContext = currentConfig?.context ?? [];

  if (answers.framework === "cdk") {
    const cdkAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "context",
        message:
          "Would you like to enter CDK context (example: environment=development)?",
        default: oldContext.length > 0 ? oldContext.shift() : undefined,
      },
    ]);

    if (cdkAnswers.context && cdkAnswers.context.trim() !== "") {
      answers.context = [cdkAnswers.context.trim()];
    }

    // more context
    while (true) {
      const moreContextAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "context",
          message: "Would you like to enter more CDK context?",
          default: oldContext.length > 0 ? oldContext.shift() : undefined,
        },
      ]);

      if (
        moreContextAnswers.context &&
        moreContextAnswers.context.trim() !== ""
      ) {
        answers.context = [
          ...(answers.context ?? []),
          moreContextAnswers.context.trim(),
        ];
      } else {
        break;
      }
    }
  }

  if (answers.framework === "sls") {
    const slsAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "stage",
        message: "Would you like to enter Serverless Framework stage?",
        default: currentConfig?.stage,
      },
    ]);

    answers = { ...answers, ...slsAnswers };
  }

  if (answers.framework === "sam") {
    const samAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "configEnv",
        message: "Would you like to enter SAM environment?",
        default: currentConfig?.configEnv,
      },
    ]);

    answers = { ...answers, ...samAnswers };
  }

  answers.framework === currentFramework ? undefined : answers.framework;

  // monorepo subfolder
  const answersSubfolder = await inquirer.prompt([
    {
      type: "input",
      name: "subfolder",
      message:
        "If you are using monorepo, enter subfolder where the framework is instaled.",
      default: currentConfig?.subfolder,
    },
  ]);

  if (answersSubfolder.subfolder) {
    answers.subfolder = answersSubfolder.subfolder;

    process.chdir(answers.subfolder);
  }

  // do you want to use observable mode?
  const answersObservable = await inquirer.prompt([
    {
      type: "confirm",
      name: "observable",
      message:
        "Do you want to use observable mode, which just sends events to the debugger and do not use the respose?",
      default: currentConfig?.observable ?? false,
    },
  ]);

  answers = { ...answers, ...answersObservable };

  if (answers.observable) {
    const observableAnswers = await inquirer.prompt([
      {
        type: "number",
        name: "interval",
        message: `Would you like to enter observable mode interval at which events are sent to the debugger? Default is ${defaultObservableInterval}`,
        default: currentConfig?.interval ?? defaultObservableInterval,
      },
    ]);

    answers = {
      ...answers,

      interval:
        observableAnswers.interval === defaultObservableInterval
          ? undefined
          : observableAnswers.interval,
    };
  }

  const answersAws = await inquirer.prompt([
    {
      type: "input",
      name: "profile",
      message: "Would you like to use named AWS profile?",
      default: currentConfig?.profile,
    },
    {
      type: "input",
      name: "region",
      message: "Would you like to specify AWS region?",
      default: currentConfig?.region,
    },
    {
      type: "input",
      name: "role",
      message: "Would you like to specify AWS role?",
      default: currentConfig?.role,
    },
  ]);

  answers = { ...answers, ...answersAws };

  // do you want to filter which Lambdas to debug?
  const answersFilter = await inquirer.prompt([
    {
      type: "list",
      name: "function",
      message: "Would you like to filter which Lambdas to debug?",
      choices: ["All", "Pick one", "Filter by name"],
      default:
        currentConfig?.function === undefined
          ? "All"
          : (currentConfig?.function as string).includes("*")
            ? "Filter by name"
            : "Pick one",
    },
  ]);

  if (answersFilter.function === "Pick one") {
    // I need to use congiration settings I accquired so far to get the list of lambdas
    const configTemp = getConfigFromAnswers(answers);
    Configuration.setConfig(configTemp as any); // not complete config

    lambdasList = await ResourceDiscovery.getLambdas(
      getConfigFromAnswers(answers) as LldConfig
    );

    if (!lambdasList) {
      throw new Error("No Lambdas found");
    }

    // get list of lambdas
    const lambdas = await inquirer.prompt([
      {
        type: "list",
        name: "function",
        message: "Pick Lambda to debug",
        choices: lambdasList.map((l) => l.functionName),
        default: currentConfig?.function,
      },
    ]);

    answers.function = lambdas.function;

    lambdasList = [
      lambdasList.find((l) => l.functionName === lambdas.function)!,
    ];
  } else if (answersFilter.function === "Filter by name") {
    const filter = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Enter Lambda name to filter. Use * as wildcard",
        default: currentConfig?.function,
      },
    ]);

    answers.function = filter.name;

    lambdasList = undefined; // will be rediscovered later
  }

  let save = false;
  if (!answers.remove) {
    const answersSave = await inquirer.prompt([
      {
        type: "confirm",
        name: "save",
        message: `Would you like to save these settings to ${configFileDefaultName}?`,
      },
    ]);

    if (answersSave.save) {
      save = true;
    }

    if (!(await GitIgnore.doesExistInGitIgnore())) {
      const answersGitIgnore = await inquirer.prompt([
        {
          type: "confirm",
          name: "gitignore",
          message: `Would you like to add ${configFileDefaultName} to .gitignore?`,
        },
      ]);

      answers.gitignore = answersGitIgnore.gitignore;
    }

    if (!(await VsCode.isConfigured())) {
      const answersVsCode = await inquirer.prompt([
        {
          type: "confirm",
          name: "vscode",
          message: `Would you like to add configuration to VsCode?`,
        },
      ]);

      answers.vscode = answersVsCode.vscode;
    }
  }

  /*
{
      type: "confirm",
      name: "observable",
      message:
        "Do you want to use observable mode, which just sends events to the debugger and do not use the respose?",
      default: false,
    },
*/
  const config = getConfigFromAnswers(answers);

  if (save) {
    await saveConfiguration(config);
  }

  return config;
}

async function saveConfiguration(config: LldConfigCliArgs) {
  Logger.log(`Saving to config file ${configFileName}`);

  // save to file that looks like this:
  const configContent = `
import { type LldConfigTs } from "lambda-live-debugger";

export default {
  framework: "${config.framework}",
  context: ${config.context ? JSON.stringify(config.context) : undefined},
  stage: "${config.stage}",
  subfolder: "${config.subfolder}",
  function: "${config.function}",
  profile: "${config.profile}",
  region: "${config.region}",
  role: "${config.role}",
  configEnv: "${config.configEnv}",
  observable: ${config.observable},
  interval: ${config.interval === defaultObservableInterval ? undefined : config.interval},
  verbose: ${config.verbose},
  //getLambdas: async (foundLambdas) => {
  //  you can customize the list of lambdas here or create your own
  //  return foundLambdas;
  //},
} satisfies LldConfigTs;
    `;

  // remove lines that contains undefined or ""
  const configContentCleaned = configContent
    .trim()
    .split("\n")
    .filter((l) => !l.includes("undefined") && !l.includes('""'))
    .join("\n");

  await fs.writeFile(configFileName, configContentCleaned);
}

function getConfigFromAnswers(answers: any): LldConfigCliArgs {
  const config = {
    remove: answers.remove,
    framework: answers.framework,
    context: answers.context,
    stage: answers.stage,
    subfolder: answers.subfolder,
    function: answers.function,
    profile: answers.profile,
    region: answers.region,
    role: answers.role,
    configEnv: answers.configEnv,
    observable: answers.observable,
    interval:
      answers.interval !== undefined
        ? answers.interval
        : defaultObservableInterval,
    verbose: false,
    interactive: answers.interactive,
    gitignore: answers.gitignore,
    vscode: answers.vscode,
  };

  //remove undefined and empty strings
  Object.keys(config).forEach((key) =>
    (config as any)[key] === undefined || (config as any)[key] === ""
      ? delete (config as any)[key]
      : {}
  );

  return config;
}
