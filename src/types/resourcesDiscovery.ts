import { BuildOptions } from 'esbuild';

export type LambdaResource = {
  functionName: string;
  codePath: string;
  packageJsonPath?: string;
  handler?: string;

  /**
   * If true, the function will be bundled even if it is a JavaScript file.
   */
  forceBundle?: boolean;
  bundlingType?: BundlingType;
  esBuildOptions?: EsBuildOptions;
  metadata: {
    /**
     * Framework name
     */
    framework: string;

    /**
     * If framework is CDK or SAM, this is the stack name
     */
    stackName?: string;

    /**
     * If framework is CDK, this is the construct path
     */
    cdkPath?: string;
  };

  filteredOut?: boolean;
};

export enum BundlingType {
  ESBUILD = 'ESBUILD',
  NONE = 'NONE',
}

export type EsBuildOptions = Omit<
  BuildOptions,
  | 'outfile'
  | 'outdir'
  | 'outbase'
  | 'write'
  | 'allowOverwrite'
  | 'sourcemap'
  | 'keepnames'
  | 'entryPoints'
  | 'stdin'
>;
