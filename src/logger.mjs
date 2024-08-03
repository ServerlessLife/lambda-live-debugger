let verboseEnabled = false;
/**
 * Log verbose message in verbose logging is enabled
 * @param args
 */
function verbose(...args) {
  if (verboseEnabled) {
    console.info(...args);
  }
}
/**
 *
 * @param enabled
 */
function setVerbose(enabled) {
  verboseEnabled = enabled;
}
export const Logger = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  verbose,
  setVerbose,
};
