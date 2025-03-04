import { exec } from 'child_process';
import { promisify } from 'util';
import { TerraformFramework } from './terraformFramework.js';

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
