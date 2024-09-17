import { Command, InvalidOptionArgumentError } from 'commander';
import { getVersion } from '../version.js';
import { LldConfigCliArgs } from '../types/lldConfig.js';
import { defaultObservableInterval, outputFolder } from '../constants.js';

const validRemoveOptions = ['keep-layer', 'all'];

/**
 * Get configuration from CLI arguments
 * @param supportedFrameworks Supported frameworks
 * @returns Configuration
 */
export async function getConfigFromCliArgs(
  supportedFrameworks: string[] = [],
): Promise<LldConfigCliArgs> {
  const version = await getVersion();

  const program = new Command();

  program.name('lld').description('Lambda Live Debugger').version(version);
  program.option(
    '-r, --remove [option]',
    "Remove Lambda Live Debugger infrastructure. Options: 'keep-layer' (default), 'remove-all'. The latest also removes the Lambda Layer",
    //validateRemoveOption,
    //"keep-layer"
  );
  program.option(
    '-w, --wizard',
    'Program interactively asks for each parameter and saves it to lldebugger.config.ts',
  );
  program.option('-v, --verbose', 'Verbose logging');
  program.option(
    '-c, --context <context>',
    'AWS CDK context',
    (value: string, previous: string[]) => previous.concat(value),
    [],
  );
  program.option('-s, --stage <stage>', 'Serverless Framework stage');
  program.option(
    '-f, --function <function name>',
    'Filter by function name. You can use * as a wildcard',
  );
  program.option('-m, --subfolder <subfolder>', 'Monorepo subfolder');
  program.option('-o, --observable', 'Observable mode');
  program.option(
    '-i --interval <interval>',
    'Observable mode interval',
    defaultObservableInterval.toString(),
  );
  program.option('--config-env <evironment>', 'SAM environment');
  program.option('--sam-config-file <file>', 'SAM configuration file');
  program.option('--sam-template-file <file>', 'SAM template file');
  program.option('--profile <profile>', 'AWS profile to use');
  program.option('--region <region>', 'AWS region to use');
  program.option('--role <role>', 'AWS role to use');
  program.option(
    '--framework <framework>',
    `Framework to use (${supportedFrameworks.join(', ')})`,
  );
  program.option('--gitignore', `Add ${outputFolder} to .gitignore`);
  program.parse(process.argv);

  const args: any = program.opts();
  args.interval = parseInt(args.interval as any);

  if (args.remove === true) {
    args.remove = 'keep-layer';
  } else if (args.remove) {
    if (!validRemoveOptions.includes(args.remove)) {
      throw new InvalidOptionArgumentError(
        `Invalid option: '${args.remove}'. Valid options are: ${validRemoveOptions.join(', ')}`,
      );
    }
  }

  return args;
}

// function validateRemoveOption(value: any) {
//   console.log("REMOVE", value);

//   if (value === true) {
//     return "keep-layer";
//   }

//   if (!validRemoveOptions.includes(value)) {
//     throw new InvalidOptionArgumentError(
//       `Invalid option: '${value}'. Valid options are: ${validRemoveOptions.join(", ")}`
//     );
//   }
//   return value;
// }
