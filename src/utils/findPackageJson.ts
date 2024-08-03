import * as path from "path";
import * as fs from "fs/promises";

/**
 * Find the package.json file for a given code path
 * @param codePath
 * @returns
 */
export async function findPackageJson(codePath: any) {
  const handlerParsedPath = path.parse(codePath);
  const packageJsonRoot = await findAboveFolderWithAFile(
    handlerParsedPath.dir,
    "package.json",
  );

  const packageJsonPath = packageJsonRoot
    ? path.resolve(path.join(packageJsonRoot, "package.json"))
    : undefined;
  return packageJsonPath;
}

/**
 * Find the nearest folder above with a given file
 * @param dir
 * @param file
 * @returns
 */
async function findAboveFolderWithAFile(
  dir: string,
  file: string,
): Promise<string | undefined> {
  if (dir === "/") return undefined;

  try {
    // Check if the file exists in the current directory
    await fs.access(path.join(dir, file));
    return dir;
  } catch {
    return findAboveFolderWithAFile(path.resolve(path.join(dir, "..")), file);
  }
}
