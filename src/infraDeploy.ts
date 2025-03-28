import {
  DeleteLayerVersionCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  PublishLayerVersionCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  ListLayersCommand,
} from '@aws-sdk/client-lambda';
import {
  IAMClient,
  GetRolePolicyCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { getVersion } from './version.js';
import fs from 'fs/promises';
import * as path from 'path';
import { Configuration } from './configuration.js';
import { AwsCredentials } from './awsCredentials.js';
import { getModuleDirname } from './getDirname.js';
import { Logger } from './logger.js';
import * as crypto from 'crypto';

let lambdaClient: LambdaClient | undefined;
let iamClient: IAMClient | undefined;

const inlinePolicyName = 'LambdaLiveDebuggerPolicy';
const layerName = 'LambdaLiveDebugger';
const lldWrapperPath = '/opt/lld-wrapper';
let layerDescription: string | undefined;

/**
 * Policy document to attach to the Lambda role
 */
const policyDocument = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Action: [
        'iot:DescribeEndpoint',
        'iot:Connect',
        'iot:Publish',
        'iot:Subscribe',
        'iot:Receive',
      ],
      Resource: '*',
    },
  ],
};

/**
 * Get the Lambda client
 * @returns
 */
function getLambdaClient(): LambdaClient {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: Configuration.config.region,
      credentials: AwsCredentials.getCredentialsProvider({
        region: Configuration.config.region,
        profile: Configuration.config.profile,
        role: Configuration.config.role,
      }),
    });
  }
  return lambdaClient;
}

/**
 * Get the IAM client
 * @returns
 */
function getIAMClient(): IAMClient {
  if (!iamClient) {
    iamClient = new IAMClient({
      region: Configuration.config.region,
      credentials: AwsCredentials.getCredentialsProvider({
        region: Configuration.config.region,
        profile: Configuration.config.profile,
        role: Configuration.config.role,
      }),
    });
  }
  return iamClient;
}

/**
 * Find an existing layer
 * @returns
 */
async function findExistingLayerVersion() {
  let nextMarker: string | undefined;
  const layerDescription = await getLayerDescription();

  do {
    const listLayerVersionsCommand = new ListLayerVersionsCommand({
      LayerName: layerName,
      Marker: nextMarker,
    });

    const response = await getLambdaClient().send(listLayerVersionsCommand);
    if (response.LayerVersions && response.LayerVersions.length > 0) {
      const matchingLayer = response.LayerVersions.find(
        (layer) => layer.Description === layerDescription,
      );
      if (matchingLayer) {
        Logger.verbose(
          `Matching layer version: ${matchingLayer.Version}, description: ${matchingLayer.Description}`,
        );
        return matchingLayer;
      }
    }

    nextMarker = response.NextMarker;
  } while (nextMarker);

  Logger.verbose('No existing layer found.');

  return undefined;
}

/**
 * Get the description of the Lambda Layer that is set to the layer
 * @returns
 */
async function getLayerDescription() {
  if (!layerDescription) {
    layerDescription = `Lambda Live Debugger Layer version ${await getVersion()}`;
  }

  if ((await getVersion()) === '0.0.1') {
    // add a random string to the description to make it unique
    layerDescription = `Lambda Live Debugger Layer - development ${crypto.randomUUID()}`;
  }

  return layerDescription;
}

/**
 * Deploy the Lambda Layer
 * @returns
 */
async function deployLayer() {
  const layerDescription = await getLayerDescription();

  // Check if the layer already exists
  const existingLayer = await findExistingLayerVersion();
  if (existingLayer && existingLayer.LayerVersionArn) {
    Logger.verbose(`${layerDescription} already deployed.`);
    return existingLayer.LayerVersionArn;
  }

  // check the ZIP
  let layerZipPathFullPath = path.resolve(
    path.join(getModuleDirname(), './extension/extension.zip'),
  );

  // get the full path to the ZIP file
  try {
    await fs.access(layerZipPathFullPath);
  } catch {
    // if I am debugging
    const layerZipPathFullPath2 = path.join(
      getModuleDirname(),
      '../dist/extension/extension.zip',
    );

    try {
      await fs.access(layerZipPathFullPath2);
      layerZipPathFullPath = layerZipPathFullPath2;
    } catch {
      throw new Error(`File for the layer not found: ${layerZipPathFullPath}`);
    }
  }

  Logger.verbose(`Layer ZIP path: ${layerZipPathFullPath}`);

  // Read the ZIP file containing your layer code
  const layerContent = await fs.readFile(layerZipPathFullPath);

  Logger.verbose(`Deploying ${layerDescription}`);

  // Create the command for publishing a new layer version
  const publishLayerVersionCommand = new PublishLayerVersionCommand({
    LayerName: layerName,
    Description: layerDescription,
    Content: {
      ZipFile: layerContent,
    },
    CompatibleArchitectures: ['x86_64', 'arm64'],
    CompatibleRuntimes: ['nodejs18.x', 'nodejs20.x'],
  });

  const response = await getLambdaClient().send(publishLayerVersionCommand);

  if (!response.LayerVersionArn) {
    throw new Error('Failed to retrieve the layer version ARN');
  }

  Logger.verbose(
    `Deployed ${response.Description} ARN: ${response.LayerVersionArn}`,
  );
  return response.LayerVersionArn;
}

/**
 * Delete the Lambda Layer
 */
async function deleteLayer() {
  let nextMarker: string | undefined;
  do {
    const layers = await getLambdaClient().send(
      new ListLayersCommand({
        Marker: nextMarker,
        MaxItems: 10,
      }),
    );

    // Filter layers by name
    const targetLayers =
      layers.Layers?.filter((layer) => layer.LayerName === layerName) || [];

    for (const layer of targetLayers) {
      await deleteAllVersionsOfLayer(layer.LayerArn!);
    }

    nextMarker = layers.NextMarker;
  } while (nextMarker);
}

/**
 * Delete all versions of a layer
 * @param layerArn
 */
async function deleteAllVersionsOfLayer(layerArn: string): Promise<void> {
  let nextMarker: string | undefined;
  do {
    const versions = await getLambdaClient().send(
      new ListLayerVersionsCommand({
        LayerName: layerArn,
        Marker: nextMarker,
        //MaxItems: 5,
      }),
    );

    for (const version of versions.LayerVersions || []) {
      await deleteLayerVersion(layerArn, version.Version!);
    }

    nextMarker = versions.NextMarker;
  } while (nextMarker);
}

/**
 * Delete a specific version of a layer
 * @param layerArn
 * @param versionNumber
 */
async function deleteLayerVersion(
  layerArn: string,
  versionNumber: number,
): Promise<void> {
  try {
    Logger.verbose(`Deleting version ${versionNumber} of layer ${layerArn}`);
    await getLambdaClient().send(
      new DeleteLayerVersionCommand({
        LayerName: layerArn,
        VersionNumber: versionNumber,
      }),
    );
  } catch (error) {
    Logger.error(
      `Error deleting version ${versionNumber} of layer ${layerArn}:`,
      error,
    );
    throw error;
  }
}

/**
 * Remove the layer from the Lambda function
 * @param functionName
 */
async function removeLayerFromLambda(functionName: string) {
  try {
    let needToUpdate: boolean = false;

    const {
      environmentVariables,
      ddlLayerArns,
      otherLayerArns,
      initialTimeout,
    } = await getLambdaCongfiguration(functionName);

    if (ddlLayerArns.length > 0) {
      needToUpdate = true;
      Logger.verbose(`Detaching layer from the function ${functionName}`);
    } else {
      Logger.verbose(
        `Skipping detaching layer from the function ${functionName}, no layer attached`,
      );
    }

    const initalExecWraper =
      environmentVariables.LLD_INITIAL_AWS_LAMBDA_EXEC_WRAPPER;

    const ddlEnvironmentVariables = getEnvironmentVarablesForDebugger({
      // set dummy data, so we just get the list of environment variables
      functionId: 'xxx',
      timeout: 0,
      verbose: true,
      initalExecWraper: 'test',
    });

    // check if environment variables are set for each property
    for (const [key] of Object.entries(ddlEnvironmentVariables)) {
      if (environmentVariables && environmentVariables[key]) {
        needToUpdate = true;
        break;
      }
    }

    if (needToUpdate) {
      Logger.verbose(
        `Updating function configuration for ${functionName} to remove layer and reset environment variables`,
      );

      Logger.verbose(
        'Existing environment variables',
        JSON.stringify(environmentVariables, null, 2),
      );

      //remove environment variables
      for (const [key] of Object.entries(ddlEnvironmentVariables)) {
        if (environmentVariables && environmentVariables[key]) {
          if (key === 'AWS_LAMBDA_EXEC_WRAPPER') {
            if (environmentVariables[key] === lldWrapperPath) {
              delete environmentVariables[key];
            } else {
              // do not remove the original AWS_LAMBDA_EXEC_WRAPPER that was set before LLD
            }
          } else {
            delete environmentVariables[key];
          }
        }
      }

      if (initalExecWraper) {
        environmentVariables.AWS_LAMBDA_EXEC_WRAPPER = initalExecWraper;
      }

      Logger.verbose(
        'New environment variables',
        JSON.stringify(environmentVariables, null, 2),
      );

      const updateFunctionConfigurationCommand =
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Layers: otherLayerArns,
          Environment: {
            Variables: {
              ...environmentVariables,
            },
          },
          Timeout: initialTimeout,
        });

      await getLambdaClient().send(updateFunctionConfigurationCommand);

      Logger.verbose(`Function configuration cleared ${functionName}`);
    } else {
      Logger.verbose(`Function ${functionName} configuration already cleared.`);
    }
  } catch (error: any) {
    throw new Error(
      `Failed to remove layer from lambda ${functionName}: ${error.message}`,
      { cause: error },
    );
  }
}

/**
 * Get the Lambda configuration
 * @param functionName
 * @returns
 */
async function getLambdaCongfiguration(functionName: string) {
  try {
    const getFunctionResponse = await getLambdaClient().send(
      new GetFunctionCommand({
        FunctionName: functionName,
      }),
    );

    const timeout = getFunctionResponse.Configuration?.Timeout;

    // get all layers this fuction has by name
    const layers = getFunctionResponse.Configuration?.Layers || [];
    const layerArns = layers.map((l) => l.Arn).filter((arn) => arn) as string[];
    const ddlLayerArns = layerArns.filter((arn) =>
      arn?.includes(`:layer:${layerName}:`),
    );

    const otherLayerArns = layerArns.filter(
      (arn) => !arn?.includes(`:layer:${layerName}:`),
    );

    const environmentVariables: Record<string, string> =
      getFunctionResponse.Configuration?.Environment?.Variables ?? {};

    let initialTimeout: number;

    const initialTimeoutStr = environmentVariables?.LLD_INITIAL_TIMEOUT;

    if (!initialTimeoutStr || isNaN(Number(initialTimeoutStr))) {
      initialTimeout = timeout!;
    } else {
      initialTimeout = Number(initialTimeoutStr);
    }

    return {
      environmentVariables,
      ddlLayerArns,
      otherLayerArns,
      initialTimeout,
    };
  } catch (error: any) {
    throw new Error(
      `Failed to get lambda configuration ${functionName}: ${error.message}`,
      { cause: error },
    );
  }
}

/**
 * Attach the layer to the Lambda function and update the environment variables
 */
async function updateLambda({
  functionName,
  functionId,
  layerVersionArn,
}: {
  functionName: string;
  functionId: string;
  layerVersionArn: string;
}) {
  const { needToUpdate, layers, environmentVariables, initialTimeout } =
    await prepareLambdaUpdate({
      functionName,
      functionId,
      layerVersionArn,
    });

  if (needToUpdate) {
    try {
      const updateFunctionConfigurationCommand =
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Layers: layers,
          Environment: {
            Variables: environmentVariables,
          },
          //Timeout: LlDebugger.argOptions.observable ? undefined : 300, // Increase the timeout to 5 minutes
          Timeout: Math.max(initialTimeout, 300), // Increase the timeout to min. 5 minutes
        });

      await getLambdaClient().send(updateFunctionConfigurationCommand);

      Logger.verbose(
        `[Function ${functionName}] Lambda layer and environment variables updated`,
      );
    } catch (error: any) {
      throw new Error(
        `Failed to update Lambda ${functionName}: ${error.message}`,
        { cause: error },
      );
    }
  } else {
    Logger.verbose(
      `[Function ${functionName}] Lambda layer and environment already up to date`,
    );
  }
}

/**
 * Prepare the Lambda function for the update
 */
async function prepareLambdaUpdate({
  functionName,
  functionId,
  layerVersionArn,
}: {
  functionName: string;
  functionId: string;
  layerVersionArn: string;
}) {
  let needToUpdate: boolean = false;

  const { environmentVariables, ddlLayerArns, otherLayerArns, initialTimeout } =
    await getLambdaCongfiguration(functionName);

  // check if layer is already attached
  if (!ddlLayerArns?.find((arn) => arn === layerVersionArn)) {
    needToUpdate = true;
    Logger.verbose(
      `[Function ${functionName}] Layer not attached to the function`,
    );
  } else {
    Logger.verbose(
      `[Function ${functionName}] Layer already attached to the function`,
    );
  }

  // check if layers with the wrong version are attached
  if (!needToUpdate && ddlLayerArns.find((arn) => arn !== layerVersionArn)) {
    needToUpdate = true;
    Logger.verbose('Layer with the wrong version attached to the function');
  }

  // support for multiple internal Lambda extensions
  const initalExecWraper =
    environmentVariables.AWS_LAMBDA_EXEC_WRAPPER !== lldWrapperPath
      ? environmentVariables.AWS_LAMBDA_EXEC_WRAPPER
      : undefined;

  if (initalExecWraper) {
    Logger.warn(
      `[Function ${functionName}] Another internal Lambda extension is already attached to the function, which might cause unpredictable behavior.`,
    );
  }

  const ddlEnvironmentVariables = getEnvironmentVarablesForDebugger({
    functionId,
    timeout: initialTimeout,
    verbose: Configuration.config.verbose,
    initalExecWraper,
  });

  // check if environment variables are already set for each property
  for (const [key, value] of Object.entries(ddlEnvironmentVariables)) {
    if (!environmentVariables || environmentVariables[key] !== value) {
      needToUpdate = true;
      Logger.verbose(
        `[Function ${functionName}] need to update environment variables`,
      );
      break;
    }
  }

  return {
    needToUpdate,
    layers: [layerVersionArn, ...otherLayerArns],
    environmentVariables: {
      ...environmentVariables,
      ...ddlEnvironmentVariables,
    },
    initialTimeout,
  };
}

/**
 * Add the policy to the Lambda role
 */
async function lambdaRoleUpdate(roleName: string) {
  // add inline policy to the role using PutRolePolicyCommand
  Logger.verbose(`[Role ${roleName}] Attaching policy to the role ${roleName}`);

  await getIAMClient().send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: inlinePolicyName,
      PolicyDocument: JSON.stringify(policyDocument),
    }),
  );
}

/**
 * Prepare the Lambda role for the update
 * @param functionName
 * @returns
 */
async function prepareLambdaRoleUpdate(functionName: string) {
  const getFunctionResponse = await getLambdaClient().send(
    new GetFunctionCommand({
      FunctionName: functionName,
    }),
  );
  const roleArn = getFunctionResponse.Configuration?.Role;
  if (!roleArn) {
    throw new Error(
      `Failed to retrieve the role ARN for Lambda ${functionName}`,
    );
  }

  // Extract the role name from the role ARN
  const roleName = roleArn.split('/').pop();

  if (!roleName) {
    throw new Error(
      `Failed to extract role name from role ARN: ${roleArn} for lambda ${functionName}`,
    );
  }

  const existingPolicy = await getPolicyDocument(roleName);

  let addPolicy: boolean = true;

  // compare existing policy with the new one
  if (existingPolicy) {
    if (JSON.stringify(existingPolicy) === JSON.stringify(policyDocument)) {
      Logger.verbose(
        `[Function ${functionName}] Policy already attached to the role ${roleName}`,
      );
      addPolicy = false;
    }
  }
  return { addPolicy, roleName };
}

/**
 * Get the environment variables for the Lambda function
 */
function getEnvironmentVarablesForDebugger({
  functionId,
  timeout,
  verbose,
  initalExecWraper,
}: {
  functionId: string;
  timeout: number | undefined;
  verbose: boolean | undefined;
  initalExecWraper: string | undefined;
}): Record<string, string> {
  const env: Record<string, string> = {
    LLD_FUNCTION_ID: functionId,
    AWS_LAMBDA_EXEC_WRAPPER: lldWrapperPath,
    LLD_DEBUGGER_ID: Configuration.config.debuggerId,
    LLD_INITIAL_TIMEOUT: timeout ? timeout.toString() : '-1', // should never be negative
    LLD_OBSERVABLE_MODE: Configuration.config.observable ? 'true' : 'false',
    LLD_OBSERVABLE_INTERVAL: Configuration.config.interval.toString(),
  };

  if (initalExecWraper) {
    env.LLD_INITIAL_AWS_LAMBDA_EXEC_WRAPPER = initalExecWraper;
  }

  if (verbose) {
    env.LLD_VERBOSE = 'true';
  }

  return env;
}

/**
 * Remove the policy from the Lambda role
 * @param functionName
 * @returns
 */
async function removePolicyFromLambdaRole(functionName: string) {
  try {
    // Retrieve the Lambda function's execution role ARN
    const getFunctionResponse = await getLambdaClient().send(
      new GetFunctionCommand({
        FunctionName: functionName,
      }),
    );
    const roleArn = getFunctionResponse.Configuration?.Role;
    if (!roleArn) {
      throw new Error(
        `Failed to retrieve the role ARN for lambda ${functionName}`,
      );
    }

    // Extract the role name from the role ARN
    const roleName = roleArn.split('/').pop();

    if (!roleName) {
      Logger.error(
        `Failed to extract role name from role ARN: ${roleArn} for Lambda ${functionName}`,
      );
      return;
    }

    const existingPolicy = await getPolicyDocument(roleName);

    if (existingPolicy) {
      try {
        Logger.verbose(
          `[Function ${functionName}] Removing policy from the role ${roleName}`,
        );
        await getIAMClient().send(
          new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: inlinePolicyName,
          }),
        );
      } catch (error: any) {
        Logger.error(
          `Failed to delete inline policy ${inlinePolicyName} from role ${roleName} for Lambda ${functionName}:`,
          error,
        );
      }
    } else {
      Logger.verbose(
        `[Function ${functionName}] No need to remove policy from the role ${roleName}, policy not found`,
      );
    }
  } catch (error: any) {
    throw new Error(
      `Failed to remove policy from the role for Lambda ${functionName}: ${error.message}`,
      { cause: error },
    );
  }
}

/**
 * Get the policy document needed to attach to the Lambda role needed for the Lambda Live Debugger
 * @param roleName
 * @returns
 */
async function getPolicyDocument(roleName: string) {
  try {
    const policy = await getIAMClient().send(
      new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: inlinePolicyName,
      }),
    );

    if (policy.PolicyDocument) {
      const policyDocument = JSON.parse(
        decodeURIComponent(policy.PolicyDocument),
      );
      return policyDocument;
    } else {
      return undefined;
    }
  } catch (error: any) {
    if (error.name === 'NoSuchEntityException') {
      return undefined;
    } else {
      throw error;
    }
  }
}

/**
 * Deploy the infrastructure
 */
async function deployInfrastructure() {
  const layerVersionArn = await deployLayer();

  const promises: Promise<void>[] = [];

  for (const func of Configuration.getLambdas()) {
    const p = updateLambda({
      functionName: func.functionName,
      functionId: func.functionId,
      layerVersionArn: layerVersionArn,
    });
    if (process.env.DISABLE_PARALLEL_DEPLOY === 'true') {
      await p;
    } else {
      promises.push(p);
    }
  }

  const rolesToUpdatePromise = Promise.all(
    Configuration.getLambdas().map(async (func) => {
      const roleUpdate = await prepareLambdaRoleUpdate(func.functionName);

      return roleUpdate.addPolicy ? roleUpdate.roleName : undefined;
    }),
  );
  const rolesToUpdate = await rolesToUpdatePromise;
  const rolesToUpdateFiltered = [
    // unique roles
    ...new Set(rolesToUpdate.filter((r) => r)),
  ] as string[];

  for (const roleName of rolesToUpdateFiltered) {
    const p = lambdaRoleUpdate(roleName);
    if (process.env.DISABLE_PARALLEL_DEPLOY === 'true') {
      await p;
    } else {
      promises.push(p);
    }
  }

  await Promise.all(promises);
}

/**
 * Get the planed infrastructure changes
 */
async function getPlanedInfrastructureChanges() {
  const existingLayer = await findExistingLayerVersion();

  const lambdasToUpdatePromise = Promise.all(
    Configuration.getLambdas().map(async (func) => {
      if (!existingLayer?.LayerVersionArn) {
        return func.functionName;
      } else {
        const lambdaUpdate = await prepareLambdaUpdate({
          functionName: func.functionName,
          functionId: func.functionId,
          layerVersionArn: existingLayer.LayerVersionArn,
        });

        return lambdaUpdate.needToUpdate ? func.functionName : undefined;
      }
    }),
  );

  const rolesToUpdatePromise = Promise.all(
    Configuration.getLambdas().map(async (func) => {
      const roleUpdate = await prepareLambdaRoleUpdate(func.functionName);

      return roleUpdate.addPolicy ? roleUpdate.roleName : undefined;
    }),
  );

  const lambdasToUpdate = await lambdasToUpdatePromise;
  const lambdasToUpdateFiltered = lambdasToUpdate.filter((l) => l) as string[];

  const rolesToUpdate = await rolesToUpdatePromise;
  const rolesToUpdateFiltered = [
    ...new Set(rolesToUpdate.filter((r) => r)),
  ] as string[];

  return {
    deployLayer: !existingLayer,
    lambdasToUpdate: lambdasToUpdateFiltered,
    rolesToUpdate: rolesToUpdateFiltered,
  };
}

/**
 * Remove the infrastructure
 */
async function removeInfrastructure() {
  Logger.verbose('Removing Lambda Live Debugger infrastructure.');
  const promises: Promise<void>[] = [];

  for (const func of Configuration.getLambdas()) {
    const p = removeLayerFromLambda(func.functionName);
    if (process.env.DISABLE_PARALLEL_DEPLOY === 'true') {
      await p;
    } else {
      promises.push(p);
    }
  }

  const p = (async () => {
    // do not do it in parallel, because Lambdas could share the same role
    for (const func of Configuration.getLambdas()) {
      await removePolicyFromLambdaRole(func.functionName);
    }
  })(); // creates one promise
  if (process.env.DISABLE_PARALLEL_DEPLOY === 'true') {
    await p;
  } else {
    promises.push(p);
  }

  await Promise.all(promises);
}

export const InfraDeploy = {
  getPlanedInfrastructureChanges,
  deployInfrastructure,
  removeInfrastructure,
  deleteLayer,
};
