import { AwsConfiguration } from './awsConfiguration.js';
import { LambdaResource } from './resourcesDiscovery.js';

export type LldConfigBase = {
  /**
   * Verbose logging
   * @default false
   */
  verbose?: boolean;
  /**
   * AWS CDK context
   */
  context?: string[];
  /**
   * Serverless Framework stage
   */
  stage?: string;
  /**
   * Filter by function name
   */
  function?: string;

  /**
   * Observable mode
   * @default false
   */
  observable?: boolean;
  /**
   * Observable mode interval
   * @default 3000
   */
  interval: number;

  /**
   * Framework (cdk, sls, sam, terraform, none)
   */
  framework?: string;

  /**
   * Start debugger
   */
  start?: boolean;

  /**
   * SAM framework cli parameter config-env
   */
  configEnv?: string;

  /**
   * SAM framework cli parameter config-file
   */
  samConfigFile?: string;

  /**
   * SAM framework cli parameter template-file
   */
  samTemplateFile?: string;

  /**
   * Resources discovery function
   */
  getLambdas?: (
    foundFunctions?: LambdaResource[],
    config?: LldConfigBase,
  ) => Promise<LambdaResource[] | undefined>;

  /**
   * Monorepo subfolder
   */
  subfolder?: string;

  /**
   * Approval required for AWS infrastructure changes
   */
  approval?: boolean;
} & AwsConfiguration;

export type LldConfigCliArgs = {
  remove?: 'keep-layer' | 'all';
  vscode?: boolean;
  gitignore?: boolean;
  config?: string;
  wizard?: boolean;
} & Omit<LldConfigBase, 'getResources'>;

export type LldConfigTs = Partial<LldConfigBase>;

export type LldConfig = LldConfigCliArgs & LldConfigTs & { debuggerId: string };
