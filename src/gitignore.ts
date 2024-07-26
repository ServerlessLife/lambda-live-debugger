import fs from "fs/promises";
import { outputFolder } from "./constants.js";
import { Logger } from "./logger.js";

/**
 * Check if ".lldebugger" exists in .gitignore
 */
async function doesExistInGitIgnore() {
  try {
    const gitignoreContent = await fs.readFile(".gitignore", "utf-8");
    // split by new line
    const lines = gitignoreContent.split("\n");
    // check if ".lldebugger" exists
    const exists = lines.includes(outputFolder);
    return exists;
  } catch (error) {
    return false;
  }
}

/**
 * Add ".lldebugger" to .gitignore if it doesn't exist
 * @returns
 */
async function addToGitIgnore() {
  Logger.log(`Adding ${outputFolder} to .gitignore.`);
  const exists = await doesExistInGitIgnore();
  if (!exists) {
    // does file exist?
    try {
      await fs.access(".gitignore");
    } catch (error) {
      await fs.writeFile(".gitignore", `${outputFolder}\n`);
      return;
    }

    // append to existing file
    await fs.appendFile(".gitignore", `\n${outputFolder}\n`);
  } else {
    Logger.log(`${outputFolder} already exists in .gitignore`);
  }
}

/**
 * Remove ".lldebugger" from .gitignore
 */
async function removeFromGitIgnore() {
  Logger.verbose("Removing .gitignore entry...");
  const exists = await doesExistInGitIgnore();
  if (exists) {
    const gitignoreContent = await fs.readFile(".gitignore", "utf-8");
    const newContent = gitignoreContent.replace(`${outputFolder}\n`, "");
    await fs.writeFile(".gitignore", newContent);
  } else {
    Logger.log(`${outputFolder} doesn't exist in .gitignore`);
  }
}

export const GitIgnore = {
  doesExistInGitIgnore,
  addToGitIgnore,
  removeFromGitIgnore,
};
