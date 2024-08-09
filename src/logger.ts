import chalk from 'chalk';

const orange = '#D24E01';
let verboseEnabled = false;

/**
 * Log a message
 * @param args The arguments to log
 */
function log(...args: any[]) {
  args = args.map((arg) => {
    if (typeof arg === 'string') {
      // Regular expression to find text within square brackets
      return arg.replace(/\[(.*?)\]/g, (match) => chalk.gray(match)); // Colorizes the entire bracketed content
    }
    return arg;
  });
  console.log(...args);
}

/**
 * Log an important message
 * @param args The arguments to log
 */
function important(...args: any[]) {
  console.log(chalk.hex(orange)(...args));
}

/**
 * Log an error message in red
 * @param args The arguments to log
 */
function error(...args: any[]) {
  console.error(chalk.red(...args));
}

/**
 * Log a warning message in orange
 * @param args The arguments to log
 */
function warn(...args: any[]) {
  console.warn(chalk.hex(orange)(...args));
}

/**
 * Log a verbose message if verbose is enabled. Log the message in grey.
 * @param args The arguments to log
 */
function verbose(...args: any[]) {
  if (verboseEnabled) {
    console.info(chalk.grey(...args));
  }
}

/**
 * Set the verbosity of logging
 * @param enabled Whether verbose logging should be enabled
 */
function setVerbose(enabled: boolean) {
  verboseEnabled = enabled;
}

export const Logger = {
  log,
  error,
  warn,
  important,
  verbose,
  setVerbose,
};
