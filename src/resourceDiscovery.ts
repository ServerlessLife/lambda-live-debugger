import { IFramework } from './frameworks/iFrameworks.js';
import { cdkFramework } from './frameworks/cdkFramework.js';
import { slsFramework } from './frameworks/slsFramework.js';
import { samFramework } from './frameworks/samFramework.js';
import { terraformFramework } from './frameworks/terraformFramework.js';
import { LldConfig } from './types/lldConfig.js';
import { LambdaResource } from './types/resourcesDiscovery.js';
import { Logger } from './logger.js';
import path from 'node:path';

/**
 * List of supported frameworks
 */
const frameworksSupported: IFramework[] = [
  cdkFramework,
  slsFramework,
  samFramework,
  terraformFramework,
];

/**
 * Get the names of the supported frameworks
 */
function getSupportedFrameworksNames() {
  return frameworksSupported.map((f) => f.name);
}

/**
 * Get the name of the current framework
 */
async function getCurrentFrameworkName() {
  const framework = await getCurrentFramework(frameworksSupported);
  return framework?.name;
}

async function getLambdas(config: LldConfig) {
  let resources: LambdaResource[] | undefined = undefined;

  let frameworks = [...frameworksSupported];

  if (config.framework) {
    if (config.framework === 'none') {
      frameworks = [];
    } else {
      frameworks = frameworks.filter((f) => f.name === config.framework);
    }
  }

  const framework: IFramework | undefined =
    await getCurrentFramework(frameworks);

  if (framework) {
    Logger.verbose(`Getting resources with '${framework.name}' framework`);
    resources = await framework.getLambdas(config);

    if (config.function) {
      const functionNameFilter = config.function.trim();
      resources = resources.filter(
        // filter by function name, can use * as wildcard
        (l) =>
          l.functionName === functionNameFilter ||
          new RegExp('^' + functionNameFilter.split('*').join('.*') + '$').test(
            l.functionName,
          ),
      );
    }
  } else {
    return undefined;
  }
  return resources.map((r) => ({
    ...r,
    codePath: path.resolve(r.codePath),
  }));
}

/**
 * Get the current framework
 */
async function getCurrentFramework(
  frameworks: IFramework[],
): Promise<IFramework | undefined> {
  let framework: IFramework | undefined;
  for (const f of frameworks) {
    if (await f.canHandle()) {
      framework = f;
      break;
    }
  }
  return framework;
}

export const ResourceDiscovery = {
  getSupportedFrameworksNames,
  getCurrentFrameworkName,
  getLambdas,
};
