import { exec } from 'child_process';
import { promisify } from 'util';
import { TerraformFramework } from './terraformFramework.js';
import path from 'path';
import { Logger } from '../logger.js';
import fs from 'fs/promises';

export const execAsync = promisify(exec);

/**
 * Support for Terraform framework
 */
export class OpenTofuFramework extends TerraformFramework {
  /**
   * Framework name
   */
  public get name(): string {
    return 'opentofu';
  }

  /**
   * Can this class handle the current project
   * @returns
   */
  public async canHandle(): Promise<boolean> {
    // check for any file with .tf, .tf.json, .tofu, or .tofu.json extension
    const files = await fs.readdir(process.cwd());
    const r = files.some(
      (f) =>
        f.endsWith('.tf') ||
        f.endsWith('.tf.json') ||
        f.endsWith('.tofu') ||
        f.endsWith('.tofu.json'),
    );

    if (!r) {
      Logger.verbose(
        `[${this.logName}] This is not a ${this.logName} project. There are no *.tf, *.tf.json, *.tofu, or *.tofu.json files in ${path.resolve('.')} folder.`,
      );
      return false;
    } else {
      // check if Terraform or OpenTofu is installed
      try {
        await execAsync(this.checkInstalledCommand);
        return true;
      } catch {
        Logger.verbose(
          `[${this.logName}] This is not a ${this.logName} project. ${this.logName} is not installed.`,
        );
        return false;
      }
    }
  }

  /**
   * Name of the framework in logs
   */
  protected get logName(): string {
    return 'OpenTofu';
  }

  /**
   * Get OpenTofu state CI command
   */
  protected get stateCommand(): string {
    return 'tofu show --json';
  }

  /**
   *
   * @returns Get command to check if OpenTodu is installed
   */
  protected get checkInstalledCommand(): string {
    return 'tofu --version';
  }
}

export const openTofuFramework = new OpenTofuFramework();
