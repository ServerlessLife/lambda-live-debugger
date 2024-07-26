import path from "path";
import fs from "fs/promises";

export async function getTestProjectFolder(projectName: string) {
  const projectFolder = path.resolve(`test/${projectName}`);

  try {
    await fs.access(projectFolder);
    return projectFolder;
  } catch (e) {
    return path.resolve(projectName);
  }
}
