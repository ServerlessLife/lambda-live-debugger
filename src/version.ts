import * as fs from 'fs';
import * as path from 'path';
import { getModuleDirname } from './getDirname.js';

let versionStored: string | undefined = undefined;

/**
 * Get the version of the package
 * @returns the version of the package
 */
export async function getVersion(): Promise<string> {
  if (versionStored) {
    return versionStored;
  }

  const pachageJsonPath = path.join(getModuleDirname(), '../', 'package.json');

  try {
    const packageJson = await fs.promises.readFile(pachageJsonPath, 'utf-8');
    const { version } = JSON.parse(packageJson);
    versionStored = version;
    return version;
  } catch (error: any) {
    throw new Error(
      `Error reading version from ${pachageJsonPath}: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}
