export type VsCodeLaunchEnv = {
  [key: string]: string;
};

export type VsCodeLaunchConfiguration = {
  name: string;
  type: string;
  request: string;
  runtimeExecutable: string;
  runtimeArgs: string[];
  console: string;
  skipFiles: string[];
  env: VsCodeLaunchEnv;
};

export type VsCodeLaunch = {
  version: string;
  configurations?: VsCodeLaunchConfiguration[];
};
