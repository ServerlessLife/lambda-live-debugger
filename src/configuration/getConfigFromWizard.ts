import inquirer from 'inquirer';
import {
  LldConfig,
  LldConfigBase,
  LldConfigCliArgs,
  LldConfigTs,
} from '../types/lldConfig.js';
import {
  defaultObservableInterval,
  configFileDefaultName,
} from '../constants.js';
import path from 'path';
import fs from 'fs/promises';
import { LambdaResource } from '../types/resourcesDiscovery.js';
import { ResourceDiscovery } from '../resourceDiscovery.js';
import { GitIgnore } from '../gitignore.js';
import { VsCode } from '../vsCode.js';
import { Logger } from '../logger.js';
import { Configuration } from '../configuration.js';
import { exit } from 'process';

const configFileName = path.resolve(configFileDefaultName);

/**
 * Get configuration from wizard
 * @param parameters
 * @returns
 */
export async function getConfigFromWizard({
  configFromCliArgs,
  supportedFrameworks,
  currentFramework,
  currentConfig,
}: {
  configFromCliArgs: LldConfigCliArgs;
  supportedFrameworks: string[];
  currentFramework: string | undefined;
  currentConfig?: LldConfigTs;
}): Promise<LldConfigBase> {
  let lambdasList: LambdaResource[] | undefined;

  try {
    let answers: any = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: `Which framework are you using (detected: ${currentFramework ?? '?'})?`,
        choices: [...supportedFrameworks, 'other'],
        default:
          configFromCliArgs.framework ??
          currentConfig?.framework ??
          currentFramework,
      },
    ]);

    if (answers.framework === 'other' || answers.framework === 'none') {
      answers.framework = undefined;
    }

    const oldContext = currentConfig?.context ?? [];
    if (configFromCliArgs.context?.length) {
      oldContext.push(...configFromCliArgs.context);
    }

    if (answers.framework === 'cdk') {
      const cdkAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'context',
          message:
            'Would you like to enter CDK context (example: environment=development)?',
          default: oldContext.length > 0 ? oldContext.shift() : undefined,
        },
      ]);

      if (cdkAnswers.context && cdkAnswers.context.trim() !== '') {
        answers.context = [cdkAnswers.context.trim()];
      }

      // more context
      while (true) {
        const moreContextAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'context',
            message: 'Would you like to enter more CDK context?',
            default: oldContext.length > 0 ? oldContext.shift() : undefined,
          },
        ]);

        if (
          moreContextAnswers.context &&
          moreContextAnswers.context.trim() !== ''
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

    if (answers.framework === 'sls') {
      const slsAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'stage',
          message: 'Would you like to enter Serverless Framework stage?',
          default: configFromCliArgs.stage ?? currentConfig?.stage,
        },
      ]);

      answers = { ...answers, ...slsAnswers };
    }

    if (answers.framework === 'sam') {
      const samAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'configEnv',
          message: 'Would you like to enter SAM environment?',
          default: configFromCliArgs.configEnv ?? currentConfig?.configEnv,
        },
        {
          type: 'input',
          name: 'samConfigFile',
          message:
            'Would you like to enter SAM configuration file (default = samconfig.toml)?',
          default:
            configFromCliArgs.samConfigFile ?? currentConfig?.samConfigFile,
        },
        {
          type: 'input',
          name: 'samTemplateFile',
          message:
            'Would you like to enter SAM template file (default = template.yaml)?',
          default:
            configFromCliArgs.samTemplateFile ?? currentConfig?.samTemplateFile,
        },
      ]);

      answers = { ...answers, ...samAnswers };
    }

    // monorepo subfolder
    const answersSubfolder = await inquirer.prompt([
      {
        type: 'input',
        name: 'subfolder',
        message:
          'If you are using monorepo, enter the subfolder where the framework is installed.',
        default: configFromCliArgs.subfolder ?? currentConfig?.subfolder,
      },
    ]);

    if (answersSubfolder.subfolder) {
      answers.subfolder = answersSubfolder.subfolder;

      process.chdir(answers.subfolder);
    }

    // do you want to use Observability mode?
    const answersObservable = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'observable',
        message:
          'Do you want to use Observability mode, which just sends events to the debugger and does not use the response?',
        default: !!(configFromCliArgs.observable !== undefined
          ? configFromCliArgs.observable
          : currentConfig?.observable),
      },
    ]);

    answers = { ...answers, ...answersObservable };

    if (answers.observable) {
      const defaultInt =
        configFromCliArgs.interval !== undefined
          ? configFromCliArgs.interval
          : currentConfig?.interval !== undefined
            ? currentConfig?.interval
            : defaultObservableInterval;
      const observableAnswers = await inquirer.prompt([
        {
          type: 'number',
          name: 'interval',
          message: `Would you like to enter Observability mode interval at which events are sent to the debugger? Default is ${defaultObservableInterval}`,
          default: defaultInt,
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

    // do you want to manually approve AWS infrastructure changes?
    const answersApproval = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'approval',
        message:
          'Before debugging, do you want to review and manually approve AWS infrastructure changes, like adding a Lambda layer?',
        default: currentConfig?.approval === true,
      },
    ]);

    answers = { ...answers, ...answersApproval };

    const answersAws = await inquirer.prompt([
      {
        type: 'input',
        name: 'profile',
        message: 'Would you like to use named AWS profile?',
        default: configFromCliArgs.profile ?? currentConfig?.profile,
      },
      {
        type: 'input',
        name: 'region',
        message: 'Would you like to specify AWS region?',
        default: configFromCliArgs.region ?? currentConfig?.region,
      },
      {
        type: 'input',
        name: 'role',
        message: 'Would you like to specify AWS role?',
        default: configFromCliArgs.role ?? currentConfig?.role,
      },
    ]);

    answers = { ...answers, ...answersAws };

    // do you want to filter which Lambdas to debug?
    const answersFilter = await inquirer.prompt([
      {
        type: 'list',
        name: 'function',
        message: 'Would you like to filter which Lambdas to debug?',
        choices: ['All', 'Pick one', 'Filter by name'],
        default:
          currentConfig?.function === undefined
            ? 'All'
            : (currentConfig?.function as string).includes('*')
              ? 'Filter by name'
              : 'Pick one',
      },
    ]);

    if (answersFilter.function === 'Pick one') {
      // I need to use congiration settings I accquired so far to get the list of lambdas
      const configTemp = getConfigFromAnswers(answers);
      Configuration.setConfig(configTemp as any); // not complete config

      lambdasList = await ResourceDiscovery.getLambdas(
        getConfigFromAnswers(answers) as LldConfig,
      );

      if (!lambdasList) {
        throw new Error('No Lambdas found');
      }

      // get list of lambdas
      const lambdas = await inquirer.prompt([
        {
          type: 'list',
          name: 'function',
          message: 'Pick Lambda to debug',
          choices: lambdasList.map((l) => l.functionName),
          default: currentConfig?.function ?? lambdasList[0].functionName,
        },
      ]);

      answers.function = lambdas.function;

      lambdasList = [
        lambdasList.find((l) => l.functionName === lambdas.function)!,
      ];
    } else if (answersFilter.function === 'Filter by name') {
      const filter = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Enter Lambda name to filter. Use * as wildcard',
          default: configFromCliArgs.function ?? currentConfig?.function,
        },
      ]);

      answers.function = filter.name;

      lambdasList = undefined; // will be rediscovered later
    }

    let save = false;
    if (!answers.remove) {
      const answersSave = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'save',
          message: `Would you like to save these settings to ${configFileDefaultName}?`,
        },
      ]);

      if (answersSave.save) {
        save = true;
      }

      if (!(await GitIgnore.doesExistInGitIgnore())) {
        const answersGitIgnore = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'gitignore',
            message: `Would you like to add ${configFileDefaultName} to .gitignore?`,
          },
        ]);

        answers.gitignore = answersGitIgnore.gitignore;
      }

      if (!(await VsCode.isConfigured())) {
        const answersVsCode = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'vscode',
            message: `Would you like to add configuration to VsCode?`,
          },
        ]);

        answers.vscode = answersVsCode.vscode;
      }

      const answersVerbose = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'verbose',
          message:
            'Do you want to use verbose logging? This will log all events to the console.',
          default: currentConfig?.verbose === true,
        },
      ]);

      answers.verbose =
        configFromCliArgs.verbose !== undefined
          ? configFromCliArgs.verbose
          : answersVerbose.verbose;
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
  } catch (error: any) {
    if (error.name === 'ExitPromptError') {
      // user canceled the prompt
      process.exit(0);
    } else {
      throw error;
    }
  }
}

async function saveConfiguration(config: LldConfigCliArgs) {
  Logger.log(`Saving to config file ${configFileName}`);

  // save to file that looks like this:
  const configContent = `
import { type LldConfigTs } from "lambda-live-debugger";

export default {
  // Framework to use
  framework: "${config.framework}",
  // AWS CDK framework context
  context: ${config.context ? JSON.stringify(config.context) : undefined},
  // Serverless Framework stage
  stage: "${config.stage}",
  // Monorepo subfolder
  subfolder: "${config.subfolder}",
  // Filter by function name. You can use * as a wildcard
  function: "${config.function}",
  // AWS profile
  profile: "${config.profile}",
  // AWS region
  region: "${config.region}",
  // AWS role
  role: "${config.role}",
  // SAM framework environment
  configEnv: "${config.configEnv}",
  // SAM framework configuration file
  samConfigFile: "${config.samConfigFile}",
  // SAM framework template file
  samTemplateFile: "${config.samTemplateFile}",
  // Observable mode
  observable: ${config.observable},
  // Observable mode interval
  interval: ${config.interval === defaultObservableInterval ? undefined : config.interval},
  // Approval required for AWS infrastructure changes
  approvalRequired: ${config.approval},
  // Verbose logging
  verbose: ${config.verbose},
  // Modify Lambda function list or support custom framework
  // getLambdas: async (foundLambdas) => {
  //   you can customize the list of Lambdas here or create your own
  //   return foundLambdas;
  // },
} satisfies LldConfigTs;
    `;

  // comment lines that contains undefined or ""
  const configContentCleaned = configContent
    .trim()
    .split('\n')
    .map((l) =>
      l.includes('undefined')
        ? `  // ${l
            .replace('"undefined",', '')
            .replace('undefined,', '')
            .trim()}`
        : l,
    )
    .join('\n');

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
    samConfigFile: answers.samConfigFile,
    samTemplateFile: answers.samTemplateFile,
    observable: answers.observable,
    interval:
      answers.interval !== undefined
        ? answers.interval
        : defaultObservableInterval,
    approvalRequired: answers.approvalRequired,
    verbose: answers.verbose,
    interactive: answers.interactive,
    gitignore: answers.gitignore,
    vscode: answers.vscode,
  };

  //remove undefined and empty strings
  Object.keys(config).forEach((key) =>
    (config as any)[key] === undefined || (config as any)[key] === ''
      ? delete (config as any)[key]
      : {},
  );

  return config;
}
