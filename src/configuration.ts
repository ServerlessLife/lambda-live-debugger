import { LambdaProps } from './types/lambdaProps.js';
import { LldConfig } from './types/lldConfig.js';
import { LambdaResource } from './types/resourcesDiscovery.js';
import * as crypto from 'crypto';
// @ts-ignore // does not have types
import mid from 'node-machine-id';
import { getConfigFromWizard } from './configuration/getConfigFromWizard.js';
import { getConfigFromCliArgs } from './configuration/getConfigFromCliArgs.js';
import { getConfigTsFromConfigFile } from './configuration/getConfigFromTsConfigFile.js';
import { configFileDefaultName } from './constants.js';
import { ResourceDiscovery } from './resourceDiscovery.js';
import { Logger } from './logger.js';

let config: LldConfig;
const lambdas: Record<string, LambdaProps> = {};
let lambdasList: LambdaResource[] | undefined = undefined;

/**
 * Read configuration from CLI args, config file or wizard
 */
async function readConfig() {
  const supportedFrameworks = ResourceDiscovery.getSupportedFrameworksNames();
  const configFromCliArgs = await getConfigFromCliArgs(supportedFrameworks);
  Configuration.setConfig(configFromCliArgs as any); // not complete config

  const currentFramework = await ResourceDiscovery.getCurrentFrameworkName();

  Logger.setVerbose(configFromCliArgs.verbose === true);

  const configFileName = configFromCliArgs.config || configFileDefaultName;
  const configFromConfigFile = (await getConfigTsFromConfigFile(configFileName))
    ?.default;

  if (configFromCliArgs.wizard) {
    const configFromWizard = await getConfigFromWizard({
      configFromCliArgs,
      supportedFrameworks,
      currentFramework,
      currentConfig: configFromConfigFile,
    });

    const debuggerId = await generateDebuggerId(!!configFromWizard.observable);
    setConfig({
      ...configFromWizard,
      debuggerId,
      start: false, // don't start the debugger after the wizard
    });
  } else {
    // remove all undefined values from the configFromCliArgs
    for (const key in configFromCliArgs) {
      if ((configFromCliArgs as any)[key] === undefined) {
        delete (configFromCliArgs as any)[key];
      }
    }

    const configMerged = {
      ...configFromConfigFile,
      ...configFromCliArgs,
      context:
        configFromCliArgs.context && configFromCliArgs.context?.length > 0
          ? configFromCliArgs.context
          : configFromConfigFile?.context,
    };
    const debuggerId = await generateDebuggerId(!!configMerged.observable);
    setConfig({
      ...configMerged,
      debuggerId,
      start: true,
    });
  }
}

/**
 * Generate a unique debugger id based on the current environment, args and directory
 * @param observableMode If the debugger is in observable mode then the id is always the same
 * @returns
 */
async function generateDebuggerId(observableMode: boolean) {
  if (observableMode) {
    // if we are in observable mode, we don't need to generate a unique id
    return 'OBSERVABLE_MODE';
  }

  const args: string[] = process.argv;
  const argsString = args.join(' ');

  const deviceId = await mid.machineId();

  // get the current directory
  const currentDir = process.cwd();

  // combine and hash the args and the device id
  const hash = crypto.createHash('md5');
  hash.update(argsString);
  hash.update(deviceId);
  hash.update(currentDir);
  return hash.digest('hex');
}

/**
 * Add a Lambda to the configuration
 * @param props
 */
function addLambda(props: Omit<LambdaProps, 'functionId'>) {
  lambdas[props.functionName] = {
    functionId: props.functionName,
    ...props,
  };
}

/**
 * Get a Lambda by functionId
 * @param functionId
 * @returns
 */
async function getLambda(functionId: string): Promise<LambdaProps> {
  const lambda = lambdas[functionId];

  if (lambda) return lambda;

  throw new Error(`Lambda not found: ${functionId}`);
}

/**
 * Get all Lambdas
 * @returns
 */
function getLambdas() {
  return Object.values(lambdas);
}

/**
 * Discover Lambdas
 */
async function discoverLambdas() {
  let lambdasListNew = await ResourceDiscovery.getLambdas(config);

  let noFramework = false;

  if (lambdasListNew === undefined) {
    noFramework = true;
  }

  if (config.getLambdas) {
    lambdasListNew = await config.getLambdas(lambdasListNew, config);
  }

  if (!lambdasListNew) {
    if (noFramework) {
      throw new Error(
        `No framework was found, or Lambdas provided via ${configFileDefaultName} config file. If you are using monorepo, you should configure a subfolder via config/cli parameter or run the Lambda Live Debugger from a subfolder that contains the framework project.`,
      );
    } else {
      throw new Error(
        `No Lambdas were provided via ${configFileDefaultName} config file, but some were found via the framework. Check the settings 'getLambdas' or remove it.`,
      );
    }
  }

  // is resourcesTemp different than resources in content
  saveDiscoveredLambdas(lambdasListNew);
}

/**
 * Save discovered Lambdas
 * @param lambdasListNew
 */
function saveDiscoveredLambdas(lambdasListNew: LambdaResource[]) {
  if (
    !lambdasList ||
    JSON.stringify(lambdasListNew) !== JSON.stringify(lambdasList)
  ) {
    lambdasList = lambdasListNew;

    for (const lambda of lambdasListNew) {
      addLambda(lambda);
    }

    Logger.log('Found the following Lambdas to debug:');
    Logger.log(
      ` - ${getLambdas()
        .map((f) => `${f.functionName} code: ${f.codePath}`)
        .join('\n - ')}`,
    );
  }
}

/**
 * Set the configuration
 * @param newConfig
 */
function setConfig(newConfig: LldConfig) {
  config = newConfig;
}

export const Configuration = {
  readConfig,
  get config() {
    if (!config) {
      throw new Error('Config not initialized. Call readConfig() first.');
    }
    return config;
  },
  discoverLambdas,
  getLambda,
  getLambdas,
  setConfig,
};
