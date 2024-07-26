import { LldConfigBase } from "../types/lldConfig.js";
import { LambdaResource } from "../types/resourcesDiscovery.js";

/**
 * Framework support interface
 */
export interface IFramework {
  /**
   * Framework name
   */
  name: string;

  /**
   * Can this class handle the current project
   * @returns
   */
  canHandle(): Promise<boolean>;

  /**
   * Get Lambda functions
   * @param config
   * @returns
   */
  getLambdas: (config: LldConfigBase) => Promise<LambdaResource[]>;
}
