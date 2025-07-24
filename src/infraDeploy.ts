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
 * Type for Lambda update data
 */
export type InfraLambdaUpdate = {
  functionName: string;
  layers: string[];
  environmentVariables: Record<string, string>;
  timeout: number;
};

/**
 * Type for infrastructure changes when adding Lambda Live Debugger
 */
export type InfraAddingChanges = {
  deployLayer: boolean;
  existingLayerVersionArn: string | undefined;
  lambdasToAdd: InfraLambdaUpdate[];
  rolesToAdd: string[];
  lambdasToRemove: InfraLambdaUpdate[];
  rolesToRemove: string[];
};

/**
 * Type for infrastructure changes when removing Lambda Live Debugger
 */
export type InfraRemovalChanges = {
  lambdasToRemove: InfraLambdaUpdate[];
  rolesToRemove: string[];
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

  Logger.verbose(
    `No matching layer version found with description ${layerDescription}`,
  );

  return undefined;
}

/**
 * Get the description of the Lambda layer that is set to the layer
 * @returns
 */
async function getLayerDescription() {
  if (!layerDescription) {
    layerDescription = `Lambda Live Debugger layer version ${await getVersion()}`;
  }

  if ((await getVersion()) === '0.0.1') {
    // add a random string to the description to make it unique
    layerDescription = `Lambda Live Debugger layer - development ${crypto.randomUUID()}`;
  }

  return layerDescription;
}

/**
 * Deploy the Lambda Layer
 * @returns
 */
async function deployLayer() {
  const layerDescription = await getLayerDescription();

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
      throw new Error(`File for the layer not found: ${layerZipPathFullPath}.`);
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
    throw new Error('Failed to retrieve the layer version ARN.');
  }

  Logger.verbose(
    `Deployed ${response.Description} ARN: ${response.LayerVersionArn}`,
  );
  return response.LayerVersionArn;
}

/**
 * Delete the Lambda layer
 */
async function deleteLayer() {
  let nextMarker: string | undefined;
  do {
    const layers = await getLambdaClient().send(
      new ListLayersCommand({
        Marker: nextMarker,
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
 * Get the role name from a Lambda function
 * @param functionName
 * @returns role name
 */
async function getRoleNameFromFunction(functionName: string): Promise<string> {
  try {
    Logger.verbose(`[Function ${functionName}] Getting role from function`);

    const getFunctionResponse = await getLambdaClient().send(
      new GetFunctionCommand({
        FunctionName: functionName,
      }),
    );
    const roleArn = getFunctionResponse.Configuration?.Role;
    if (!roleArn) {
      throw new Error(
        `Failed to retrieve the role ARN for lambda ${functionName}.`,
      );
    }

    // Extract the role name from the role ARN
    const roleName = roleArn.split('/').pop();

    if (!roleName) {
      throw new Error(
        `Failed to extract role name from role ARN: ${roleArn} for lambda ${functionName}.`,
      );
    }

    Logger.verbose(`[Function ${functionName}] Found role: ${roleName}`);
    return roleName;
  } catch (error: any) {
    throw new Error(`Failed to get role name from function ${functionName}.`, {
      cause: error,
    });
  }
}

/**
 * Check if policy needs to be removed from the Lambda role
 * @param roleName
 * @returns
 */
async function analyzeRoleRemove(roleName: string) {
  try {
    Logger.verbose(
      `[Role ${roleName}] Analyzing policy removal from Lambda role`,
    );

    const existingPolicy = await createPolicyDocument(roleName);

    const needToRemovePolicy = !!existingPolicy;
    Logger.verbose(
      `[Role ${roleName}] Policy ${needToRemovePolicy ? 'needs to be removed' : 'not found to remove'} from role ${roleName}`,
    );

    return {
      needToRemovePolicy,
      roleName,
    };
  } catch (error: any) {
    throw new Error(`Failed to analyze removal policy from role ${roleName}.`, {
      cause: error,
    });
  }
}

/**
 * Remove the policy from the Lambda role
 * @param roleData
 * @returns
 */
async function removePolicyFromLambdaRole(roleName: string) {
  Logger.verbose(`[Role ${roleName}] Removing policy from the role`);
  try {
    await getIAMClient().send(
      new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: inlinePolicyName,
      }),
    );
  } catch (error: any) {
    throw new Error(`Failed to remove policy from the role ${roleName}.`, {
      cause: error,
    });
  }
}

/**
 * Create policy document needed to attach to the Lambda role needed for the Lambda Live Debugger
 * @param roleName
 * @returns
 */
async function createPolicyDocument(roleName: string) {
  try {
    Logger.verbose(`[Role ${roleName}] Checking for existing policy document`);

    const policy = await getIAMClient().send(
      new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: inlinePolicyName,
      }),
    );

    if (policy.PolicyDocument) {
      Logger.verbose(`[Role ${roleName}] Found existing policy document`);
      const policyDocument = JSON.parse(
        decodeURIComponent(policy.PolicyDocument),
      );
      return policyDocument;
    } else {
      Logger.verbose(`[Role ${roleName}] No policy document found`);
      return undefined;
    }
  } catch (error: any) {
    if (error.name === 'NoSuchEntityException') {
      Logger.verbose(`[Role ${roleName}] Policy does not exist`);
      return undefined;
    } else {
      throw new Error(
        `Failed to create policy document for role ${roleName}.`,
        { cause: error },
      );
    }
  }
}

/**
 * Deploy the infrastructure
 */
async function applyAddingInfra(changes: InfraAddingChanges) {
  Logger.verbose(
    'Starting infrastructure deployment for adding Lambda Live Debugger',
  );

  let layerVersionArn: string;

  if (changes.deployLayer) {
    Logger.verbose('Deploying new layer version');
    layerVersionArn = await deployLayer();
  } else {
    if (!changes.existingLayerVersionArn) {
      throw new Error('Expected existing layer ARN but none provided.');
    }
    Logger.verbose(
      `Using existing layer version: ${changes.existingLayerVersionArn}`,
    );
    layerVersionArn = changes.existingLayerVersionArn;
  }

  const promises: Promise<void>[] = [];

  // Add LLD to functions
  for (const lambdaData of changes.lambdasToAdd) {
    promises.push(
      addLayerToLambda({
        ...lambdaData,
        layers: [
          layerVersionArn,
          // remove LLD layer if exist
          ...lambdaData.layers.filter(
            (arn) => !arn.includes(`:layer:${layerName}:`),
          ),
        ],
      }),
    );
  }

  // Remove LLD from filtered functions
  for (const lambdaData of changes.lambdasToRemove) {
    promises.push(removeLayerFromLambda(lambdaData));
  }

  // Add policies to roles
  for (const roleName of changes.rolesToAdd) {
    promises.push(addPolicyToRole(roleName));
  }

  // Remove policies from roles
  for (const roleName of changes.rolesToRemove) {
    promises.push(removePolicyFromLambdaRole(roleName));
  }

  await Promise.all(promises);
}

/**
 * Get the planned infrastructure changes including removal from filtered functions
 */
async function getInfraChangesForAdding(): Promise<InfraAddingChanges> {
  Logger.verbose(
    'Analyzing infrastructure changes for adding Lambda Live Debugger',
  );

  const existingLayer = await findExistingLayerVersion();

  const configLambdasAll = Configuration.getLambdasAll();

  const configLambdasUpdate = configLambdasAll.filter(
    (l) => !(l.filteredOut === true),
  );
  const configLambdasRemove = configLambdasAll.filter(
    (l) => l.filteredOut === true,
  );

  const lambdasToUpdatePromise = Promise.all(
    configLambdasUpdate.map(async (func) => {
      const lambdaUpdate = await analyzeLambdaAdd(
        func.functionName,
        existingLayer?.LayerVersionArn,
      );
      return lambdaUpdate;
    }),
  );

  const lambdasToRemovePromise = Promise.all(
    configLambdasRemove.map(async (func) => {
      return analyzeLambdaRemove(func.functionName);
    }),
  );

  // Get all role names for lambdas to update, ensure uniqueness, then analyze
  const roleNamesToAddSet = new Set<string>();
  const roleNamesToAddPromise = Promise.all(
    configLambdasUpdate.map(async (func) => {
      const roleName = await getRoleNameFromFunction(func.functionName);
      roleNamesToAddSet.add(roleName);
    }),
  );

  // Get all role names for lambdas to remove, ensure uniqueness, then analyze
  const roleNamesToRemoveSet = new Set<string>();
  const roleNamesToRemovePromise = Promise.all(
    configLambdasRemove.map(async (func) => {
      const roleName = await getRoleNameFromFunction(func.functionName);
      roleNamesToRemoveSet.add(roleName);
    }),
  );

  // Analyze roles to add
  await roleNamesToAddPromise;

  const roleNamesToAdd = Array.from(roleNamesToAddSet);
  const rolesToAddPromise = Promise.all(
    roleNamesToAdd.map(async (roleName) => {
      const roleUpdate = await analyzeRoleAdd(roleName);
      return roleUpdate.addPolicy ? roleUpdate.roleName : undefined;
    }),
  );

  // Analyze roles to remove
  await roleNamesToRemovePromise;

  let roleNamesToRemove = Array.from(roleNamesToRemoveSet);

  // make sure that roles removed are not in the list to add
  roleNamesToRemove = roleNamesToRemove.filter(
    (role) => !roleNamesToAdd.includes(role),
  );

  const rolesToRemovePromise = Promise.all(
    roleNamesToRemove.map(async (roleName) => {
      const roleRemoval = await analyzeRoleRemove(roleName);
      return roleRemoval.needToRemovePolicy ? roleRemoval.roleName : undefined;
    }),
  );

  const lambdasToUpdate = await lambdasToUpdatePromise;
  const lambdasToAddFiltered = lambdasToUpdate.filter(
    (l) => l,
  ) as InfraLambdaUpdate[];

  const rolesToAdd = await rolesToAddPromise;
  const rolesToAddFiltered = [
    ...new Set(rolesToAdd.filter((r) => r)),
  ] as string[];

  const lambdasToRemove = await lambdasToRemovePromise;
  const lambdasToRemoveFiltered = lambdasToRemove.filter(
    (l) => l,
  ) as InfraLambdaUpdate[];

  const rolesToRemove = await rolesToRemovePromise;
  const rolesToRemoveFiltered = rolesToRemove.filter((r) => r) as string[];

  return {
    deployLayer: !existingLayer,
    existingLayerVersionArn: existingLayer?.LayerVersionArn,
    lambdasToAdd: lambdasToAddFiltered,
    rolesToAdd: rolesToAddFiltered,
    lambdasToRemove: lambdasToRemoveFiltered,
    rolesToRemove: rolesToRemoveFiltered,
  };
}

/**
 * Check what needs to be removed from a Lambda function
 * @param func - Lambda function properties
 * @returns Lambda update configuration or undefined if no update needed
 */
async function analyzeLambdaRemove(functionName: string) {
  try {
    const {
      environmentVariables,
      ddlLayerArns,
      otherLayerArns,
      initialTimeout,
    } = await getLambdaConfiguration(functionName);

    const needToRemoveLayer = ddlLayerArns.length > 0;
    let needToRemoveEnvironmentVariables = false;

    if (needToRemoveLayer) {
      Logger.verbose(
        `[Function ${functionName}] Lambda Live Debugger layer(s) detected: ${ddlLayerArns.join(', ')}. Marked for removal.`,
      );
    } else {
      Logger.verbose(
        `[Function ${functionName}] No Lambda Live Debugger layer(s) to remove.`,
      );
    }

    const ddlEnvironmentVariables = getEnvironmentVariablesForDebugger({
      // set dummy data, so we just get the list of environment variables
      functionName: 'xxx',
      timeout: 0,
      verbose: true,
      initialExecWrapper: 'test',
    });

    // check if environment variables are set for each property
    for (const [key] of Object.entries(ddlEnvironmentVariables)) {
      if (environmentVariables && environmentVariables[key]) {
        needToRemoveEnvironmentVariables = true;
        break;
      }
    }

    Logger.verbose(
      `[Function ${functionName}] ${needToRemoveEnvironmentVariables ? 'Environment variables needed to be removed' : 'No environment variables to remove'}. Existing environment variables: ` +
        JSON.stringify(environmentVariables, null, 2),
    );

    const needToRemove = needToRemoveLayer || needToRemoveEnvironmentVariables;

    if (needToRemove) {
      const initialExecWrapper =
        environmentVariables.LLD_INITIAL_AWS_LAMBDA_EXEC_WRAPPER;
      const ddlEnvironmentVariables = getEnvironmentVariablesForDebugger({
        functionName: 'xxx',
        timeout: 0,
        verbose: true,
        initialExecWrapper: 'test',
      });

      // Remove LLD environment variables
      const cleanedEnvironmentVariables = { ...environmentVariables };
      for (const [key] of Object.entries(ddlEnvironmentVariables)) {
        if (key === 'AWS_LAMBDA_EXEC_WRAPPER') {
          if (cleanedEnvironmentVariables[key] === lldWrapperPath) {
            delete cleanedEnvironmentVariables[key];
          }
        } else {
          delete cleanedEnvironmentVariables[key];
        }
      }

      if (initialExecWrapper) {
        cleanedEnvironmentVariables.AWS_LAMBDA_EXEC_WRAPPER =
          initialExecWrapper;
      }

      return {
        functionName,
        layers: otherLayerArns,
        environmentVariables: cleanedEnvironmentVariables,
        timeout: initialTimeout,
      };
    }
    return undefined;
  } catch (error: any) {
    throw new Error(`Failed to analyze removal from lambda ${functionName}.`, {
      cause: error,
    });
  }
}

/**
 * Get the planned removal changes
 */
async function getInfraChangesForRemoving(): Promise<InfraRemovalChanges> {
  Logger.verbose(
    'Analyzing infrastructure changes for removing Lambda Live Debugger',
  );

  const allLambdas = Configuration.getLambdasAll();

  const lambdasToRemovePromise = Promise.all(
    allLambdas.map(async (func) => {
      return analyzeLambdaRemove(func.functionName);
    }),
  );

  // Get all role names for lambdas to remove, ensure uniqueness, then analyze
  const roleNamesToRemoveSet = new Set<string>();
  await Promise.all(
    allLambdas.map(async (func) => {
      const roleName = await getRoleNameFromFunction(func.functionName);
      roleNamesToRemoveSet.add(roleName);
    }),
  );

  const roleNamesToRemove = Array.from(roleNamesToRemoveSet);

  const rolesToRemovePromise = Promise.all(
    roleNamesToRemove.map(async (roleName) => {
      const roleRemoval = await analyzeRoleRemove(roleName);
      return roleRemoval.needToRemovePolicy ? roleRemoval.roleName : undefined;
    }),
  );

  const lambdasToRemove = await lambdasToRemovePromise;
  const lambdasToRemoveFiltered = lambdasToRemove.filter(
    (l) => l,
  ) as InfraLambdaUpdate[];

  const rolesToRemove = await rolesToRemovePromise;
  const rolesToRemoveFiltered = rolesToRemove.filter((r) => r) as string[];

  return {
    lambdasToRemove: lambdasToRemoveFiltered,
    rolesToRemove: rolesToRemoveFiltered,
  };
}

/**
 * Remove the infrastructure
 */
async function applyRemoveInfra(changes: InfraRemovalChanges) {
  Logger.verbose('Starting infrastructure removal');

  const promises: Promise<void>[] = [];

  for (const lambdaData of changes.lambdasToRemove) {
    promises.push(removeLayerFromLambda(lambdaData));
  }

  for (const roleName of changes.rolesToRemove) {
    promises.push(removePolicyFromLambdaRole(roleName));
  }

  await Promise.all(promises);
}

/**
 * Get the Lambda function configuration including layers, environment variables, and timeout
 * @param functionName - The name of the Lambda function
 * @returns Lambda configuration details
 */
async function getLambdaConfiguration(functionName: string) {
  try {
    const getFunctionResponse = await getLambdaClient().send(
      new GetFunctionCommand({
        FunctionName: functionName,
      }),
    );

    const timeout = getFunctionResponse.Configuration?.Timeout;

    // get all layers this function has by name
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
    throw new Error(`Failed to get lambda configuration ${functionName}.`, {
      cause: error,
    });
  }
}

/**
 * Attach the layer to the Lambda function and update the environment variables
 * @param lambdaData
 */
async function addLayerToLambda(lambdaData: InfraLambdaUpdate) {
  Logger.verbose(
    `[Function ${lambdaData.functionName}] Adding layer and environment variables`,
  );
  try {
    await updateLambda(lambdaData);
  } catch (error: any) {
    throw new Error(
      `Failed to update add layer to lambda ${lambdaData.functionName}.`,
      { cause: error },
    );
  }
}
/**
 * Remove the layer from the Lambda function and update the environment variables
 * @param lambdaData
 */
async function removeLayerFromLambda(lambdaData: InfraLambdaUpdate) {
  Logger.verbose(
    `[Function ${lambdaData.functionName}] Removing layer and environment variables`,
  );
  try {
    await updateLambda(lambdaData);
  } catch (error: any) {
    throw new Error(
      `Failed to remove layer from lambda ${lambdaData.functionName}.`,
      { cause: error },
    );
  }
}

/**
 * General function to update the Lambda function configuration
 */
async function updateLambda(lambdaData: InfraLambdaUpdate) {
  const updateFunctionConfigurationCommand =
    new UpdateFunctionConfigurationCommand({
      FunctionName: lambdaData.functionName,
      Layers: lambdaData.layers,
      Environment: {
        Variables: lambdaData.environmentVariables,
      },
      Timeout: lambdaData.timeout,
    });

  await getLambdaClient().send(updateFunctionConfigurationCommand);
}

/**
 * Analyze the Lambda function to determine if it needs to be updated
 * @param func - Lambda function properties
 * @param existingLayerVersionArn - ARN of existing layer version if available
 * @returns Lambda update configuration or undefined if no update needed
 */
async function analyzeLambdaAdd(
  functionName: string,
  existingLayerVersionArn: string | undefined,
) {
  const { environmentVariables, ddlLayerArns, otherLayerArns, initialTimeout } =
    await getLambdaConfiguration(functionName);

  if (!existingLayerVersionArn) {
    const ddlEnvironmentVariables = getEnvironmentVariablesForDebugger({
      functionName,
      timeout: initialTimeout,
      verbose: Configuration.config.verbose,
      initialExecWrapper:
        environmentVariables.AWS_LAMBDA_EXEC_WRAPPER !== lldWrapperPath
          ? environmentVariables.AWS_LAMBDA_EXEC_WRAPPER
          : undefined,
    });

    Logger.verbose(
      `[Function ${functionName}] The layer for this version does not exist in the account. We need to add it and attach it to the function`,
    );

    return {
      functionName,
      layers: otherLayerArns,
      environmentVariables: {
        ...environmentVariables,
        ...ddlEnvironmentVariables,
      },
      timeout: Math.max(initialTimeout, 300),
    };
  } else {
    let needToUpdateLayer: boolean = false;

    // check if layer is already attached
    if (!ddlLayerArns?.find((arn) => arn === existingLayerVersionArn)) {
      needToUpdateLayer = true;
      Logger.verbose(
        `[Function ${functionName}] Layer not attached to the function`,
      );
    } else {
      Logger.verbose(
        `[Function ${functionName}] Layer already attached to the function`,
      );
    }

    // check if layers with the wrong version are attached
    if (
      !needToUpdateLayer &&
      ddlLayerArns.find((arn) => arn !== existingLayerVersionArn)
    ) {
      needToUpdateLayer = true;
      Logger.verbose(
        `[Function ${functionName}] Layer with the wrong version attached to the function`,
      );
    }

    // support for multiple internal Lambda extensions
    const initialExecWrapper =
      environmentVariables.AWS_LAMBDA_EXEC_WRAPPER !== lldWrapperPath
        ? environmentVariables.AWS_LAMBDA_EXEC_WRAPPER
        : undefined;

    if (initialExecWrapper) {
      Logger.warn(
        `[Function ${functionName}] Another internal Lambda extension is already attached to the function, which might cause unpredictable behavior.`,
      );
    }

    const ddlEnvironmentVariables = getEnvironmentVariablesForDebugger({
      functionName,
      timeout: initialTimeout,
      verbose: Configuration.config.verbose,
      initialExecWrapper,
    });

    let needToUpdateEnvironmentVariables = false;

    // check if environment variables are already set for each property
    for (const [key, value] of Object.entries(ddlEnvironmentVariables)) {
      if (!environmentVariables || environmentVariables[key] !== value) {
        needToUpdateEnvironmentVariables = true;
        break;
      }
    }
    Logger.verbose(
      `[Function ${functionName}] ${needToUpdateEnvironmentVariables ? 'Need to update environment variables' : 'No need to update environment variables'}. Existing environment variables: ` +
        JSON.stringify(environmentVariables, null, 2),
    );

    return needToUpdateLayer || needToUpdateEnvironmentVariables
      ? {
          functionName,
          layers: [existingLayerVersionArn, ...otherLayerArns],
          environmentVariables: {
            ...environmentVariables,
            ...ddlEnvironmentVariables,
          },
          timeout: Math.max(initialTimeout, 300),
        }
      : undefined;
  }
}

/**
 * Add the policy to the Lambda role
 */
async function addPolicyToRole(roleName: string) {
  Logger.verbose(`[Role ${roleName}] Attaching policy to the role`);
  try {
    await getIAMClient().send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: inlinePolicyName,
        PolicyDocument: JSON.stringify(policyDocument),
      }),
    );
  } catch (error: any) {
    throw new Error(`Failed to attach policy to role ${roleName}.`, {
      cause: error,
    });
  }
}

/**
 * Prepare the Lambda role for the update
 * @param roleName
 * @returns
 */
async function analyzeRoleAdd(roleName: string) {
  try {
    Logger.verbose(`[Role ${roleName}] Analyzing role for policy attachment`);

    const existingPolicy = await createPolicyDocument(roleName);

    let addPolicy: boolean = true;

    // compare existing policy with the new one
    if (existingPolicy) {
      if (JSON.stringify(existingPolicy) === JSON.stringify(policyDocument)) {
        Logger.verbose(
          `[Role ${roleName}] Policy already attached to the role`,
        );
        addPolicy = false;
      } else {
        Logger.verbose(
          `[Role ${roleName}] Different policy found on role, will update`,
        );
      }
    } else {
      Logger.verbose(`[Role ${roleName}] No policy found on role, will attach`);
    }
    return { addPolicy, roleName };
  } catch (error: any) {
    throw new Error(
      `Failed to analyze role ${roleName} for policy attachment.`,
      {
        cause: error,
      },
    );
  }
}

/**
 * Get the environment variables for the Lambda function
 */
function getEnvironmentVariablesForDebugger({
  functionName,
  timeout,
  verbose,
  initialExecWrapper,
}: {
  functionName: string;
  timeout: number | undefined;
  verbose: boolean | undefined;
  initialExecWrapper: string | undefined;
}): Record<string, string> {
  const env: Record<string, string> = {
    LLD_FUNCTION_ID: functionName,
    AWS_LAMBDA_EXEC_WRAPPER: lldWrapperPath,
    LLD_DEBUGGER_ID: Configuration.config.debuggerId,
    LLD_INITIAL_TIMEOUT: timeout ? timeout.toString() : '-1', // should never be negative
    LLD_OBSERVABLE_MODE: Configuration.config.observable ? 'true' : 'false',
    LLD_OBSERVABLE_INTERVAL: Configuration.config.interval.toString(),
  };

  if (initialExecWrapper) {
    env.LLD_INITIAL_AWS_LAMBDA_EXEC_WRAPPER = initialExecWrapper;
  }

  if (verbose) {
    env.LLD_VERBOSE = 'true';
  }

  return env;
}

export const InfraDeploy = {
  getInfraChangesForAdding,
  getInfraChangesForRemoving,
  applyAddingInfra,
  applyRemoveInfra,
  deleteLayer,
};
