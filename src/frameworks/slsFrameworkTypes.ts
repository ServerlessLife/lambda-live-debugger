/**
 * Mock types for the Serverless Framework.
 * Copied from node_modules/@types/serverless/index.d.ts when the 'serverless' package is not installed.
 * External references (AwsProvider, Service class, etc.) are inlined or simplified.
 */

/** Stand-in for AwsProvider.Event so we don't depend on awsProvider.d.ts */
type Event = unknown;

/**
 * Service instance shape (copied from @types/serverless/classes/Service.d.ts).
 * Only the properties used by slsFramework are typed in full.
 */
export interface ServerlessService {
  custom: { [key: string]: any };
  plugins: string[];
  functions: {
    [key: string]:
      | Serverless.FunctionDefinitionHandler
      | Serverless.FunctionDefinitionImage;
  };
}

// --- Copied from @types/serverless/index.d.ts (declare namespace Serverless) ---
// eslint-disable-next-line @typescript-eslint/no-namespace -- mirrors @types/serverless for slsFramework cast Serverless.FunctionDefinitionHandler
export namespace Serverless {
  /**
   * CLI options provided to the command
   * @example
   * // serverless --verbose --stage prod
   * { verbose: true, stage: 'prod' }
   */
  export interface Options {
    function?: string | undefined;
    watch?: boolean | undefined;
    verbose?: boolean | undefined;
    extraServicePath?: string | undefined;
    stage?: string | undefined;
    region?: string | undefined;
    noDeploy?: boolean | undefined;
    [key: string]: string | boolean | string[] | undefined;
  }

  export interface Config {
    servicePath: string;
    serviceDir: string;
  }

  export interface FunctionDefinition {
    name?: string | undefined;
    package?: Package | undefined;
    reservedConcurrency?: number | undefined;
    runtime?: string | undefined;
    timeout?: number | undefined;
    memorySize?: number | undefined;
    environment?: { [name: string]: string } | undefined;
    events: Event[];
    tags?: { [key: string]: string } | undefined;
  }

  export interface LogOptions {
    color?: string | undefined;
    bold?: boolean | undefined;
    underline?: boolean | undefined;
    entity?: string | undefined;
  }

  export interface FunctionDefinitionHandler extends FunctionDefinition {
    handler: string;
  }

  export interface FunctionDefinitionImage extends FunctionDefinition {
    image: string;
  }

  export interface Package {
    /** @deprecated use `patterns` instead */
    include?: string[] | undefined;
    /** @deprecated use `patterns` instead */
    exclude?: string[] | undefined;
    patterns?: string[] | undefined;
    artifact?: string | undefined;
    individually?: boolean | undefined;
  }

  export type EventType = Event | object;
}

// --- Serverless instance (declare class Serverless) - only the shape used by slsFramework ---

/**
 * Serverless instance. Full class in @types/serverless has more members; this mock keeps service, init(), run().
 */
export interface Serverless {
  service: ServerlessService;
  init(): Promise<any>;
  run(): Promise<any>;
}
