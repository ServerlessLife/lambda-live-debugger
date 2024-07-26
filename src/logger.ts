let verboseEnabled = false;

/**
 * Log verbose message in verbose logging is enabled
 * @param args
 */
function verbose(...args: any[]) {
  if (verboseEnabled) {
    console.info(...args);
  }
}

/**
 *
 * @param enabled
 */
function setVerbose(enabled: boolean) {
  verboseEnabled = enabled;
}

export const Logger = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  verbose,
  setVerbose,
};
