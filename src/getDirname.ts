import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirname = path.resolve(".");

/**
 * Get the dirname of the Lambda Live Debugger NPM module
 * @returns
 */
export function getModuleDirname() {
  return __dirname;
}

/**
 * Get the dirname of the project
 * @returns
 */
export function getProjectDirname() {
  return projectDirname;
}
