import {
  DeleteLayerVersionCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  PublishLayerVersionCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  ListLayersCommand,
} from "@aws-sdk/client-lambda";
import {
  IAMClient,
  GetRolePolicyCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { getVersion } from "./version.js";
import fs from "fs/promises";
import * as path from "path";
import { Configuration } from "./configuration.js";
import { AwsCredentials } from "./awsCredentials.js";
import { getModuleDirname } from "./getDirname.js";
import { Logger } from "./logger.js";

let lambdaClient: LambdaClient | undefined;
let iamClient: IAMClient | undefined;

const inlinePolicyName = "LambdaLiveDebuggerPolicy";
const layerName = "LambdaLiveDebugger";

/**
 * Policy document to attach to the Lambda role
 */
const policyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Action: "iot:*",
      Resource: "*",
      Effect: "Allow",
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
 * @param layerName
 * @returns
 */
async function findExistingLayer(layerName: string) {
  const listLayerVersionsCommand = new ListLayerVersionsCommand({
    LayerName: layerName,
  });

  const response = await getLambdaClient().send(listLayerVersionsCommand);
  if (response.LayerVersions && response.LayerVersions.length > 0) {
    const latestLayer = response.LayerVersions[0];

    Logger.verbose(
      `Latest layer version: ${latestLayer.Version}, description: ${latestLayer.Description}`
    );

    return latestLayer;
  }

  Logger.verbose("No existing layer found.");

  return undefined;
}

/**
 * Deploy the Lambda Layer
 * @returns
 */
async function deployLayer() {
  const layerDescription = `Lambda Live Debugger Layer version ${await getVersion()}`;

  let layerZipPathFullPath = path.resolve(
    path.join(getModuleDirname(), "./extension/extension.zip")
  );

  Logger.verbose(`Layer ZIP path: ${layerZipPathFullPath}`);

  // check if file exists
  try {
    await fs.access(layerZipPathFullPath);
  } catch {
    // if I am debugging
    let layerZipPathFullPath2 = path.join(
      getModuleDirname(),
      "../dist/extension/extension.zip"
    );

    try {
      await fs.access(layerZipPathFullPath2);
      layerZipPathFullPath = layerZipPathFullPath2;
    } catch {
      throw new Error(`File for the layer not found: ${layerZipPathFullPath}`);
    }
  }

  const existingLayer = await findExistingLayer(layerName);
  if (
    existingLayer &&
    existingLayer.LayerVersionArn &&
    existingLayer.Description === layerDescription // check if the layer version is already deployed
  ) {
    // delete existing layer when developing
    if ((await getVersion()) === "0.0.1") {
      Logger.verbose(
        "Deleting existing layer version, because it is a development mode."
      );
      const deleteLayerVersionCommand = new DeleteLayerVersionCommand({
        LayerName: layerName,
        VersionNumber: existingLayer.Version,
      });
      await getLambdaClient().send(deleteLayerVersionCommand);
    } else {
      Logger.verbose("Layer already deployed.");
      return existingLayer.LayerVersionArn;
    }
  }

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
    CompatibleArchitectures: ["x86_64", "arm64"],
    CompatibleRuntimes: ["nodejs18.x", "nodejs20.x"],
  });

  const response = await getLambdaClient().send(publishLayerVersionCommand);

  if (!response.LayerVersionArn) {
    throw new Error("Failed to retrieve the layer version ARN");
  }

  Logger.verbose(
    `Deployed ${response.Description} ARN: ${response.LayerVersionArn}`
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
      })
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
      })
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
  versionNumber: number
): Promise<void> {
  try {
    Logger.verbose(`Deleting version ${versionNumber} of layer ${layerArn}`);
    await getLambdaClient().send(
      new DeleteLayerVersionCommand({
        LayerName: layerArn,
        VersionNumber: versionNumber,
      })
    );
  } catch (error) {
    Logger.error(
      `Error deleting version ${versionNumber} of layer ${layerArn}:`,
      error
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
        `Skipping detaching layer from the function ${functionName}, no layer attached`
      );
    }

    const ddlEnvironmentVariables = getEnvironmentVarablesForDebugger("xxx", 0);

    // check if environment variables are set for each property
    for (const [key, value] of Object.entries(ddlEnvironmentVariables)) {
      if (environmentVariables && environmentVariables[key]) {
        needToUpdate = true;
        break;
      }
    }

    if (needToUpdate) {
      Logger.verbose(
        `Updating function configuration for ${functionName} to remove layer and reset environment variables`
      );

      Logger.verbose(
        "Existing environment variables",
        JSON.stringify(environmentVariables, null, 2)
      );

      //remove environment variables
      for (const [key] of Object.entries(ddlEnvironmentVariables)) {
        if (environmentVariables && environmentVariables[key]) {
          delete environmentVariables[key];
        }
      }

      Logger.verbose(
        "New environment variables",
        JSON.stringify(environmentVariables, null, 2)
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

      getLambdaClient().send(updateFunctionConfigurationCommand);

      Logger.verbose(`Function configuration cleared ${functionName}`);
    } else {
      Logger.verbose(`Function ${functionName} configuration already cleared.`);
    }
  } catch (error: any) {
    throw new Error(
      `Failed to remove layer from lambda ${functionName}: ${error.message}`,
      { cause: error }
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
      })
    );

    const timeout = getFunctionResponse.Configuration?.Timeout;

    // get all layers this fuction has by name
    const layers = getFunctionResponse.Configuration?.Layers || [];
    const layerArns = layers.map((l) => l.Arn).filter((arn) => arn) as string[];
    const ddlLayerArns = layerArns.filter((arn) =>
      arn?.includes(`:layer:${layerName}:`)
    );

    const otherLayerArns = layerArns.filter(
      (arn) => !arn?.includes(`:layer:${layerName}:`)
    );

    const environmentVariables: Record<string, string> =
      getFunctionResponse.Configuration?.Environment?.Variables ?? {};

    let initialTimeout: number;

    let initialTimeoutStr = environmentVariables?.LLD_INITIAL_TIMEOUT;

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
      { cause: error }
    );
  }
}

/**
 * Attach the layer to the Lambda function
 * @param functionName
 * @param functionId
 * @param layerArn
 */
async function attachLayerToLambda(
  functionName: string,
  functionId: string,
  layerArn: string
) {
  let needToUpdate: boolean = false;

  const { environmentVariables, ddlLayerArns, otherLayerArns, initialTimeout } =
    await getLambdaCongfiguration(functionName);

  // check if layer is already attached
  if (!ddlLayerArns?.find((arn) => arn === layerArn)) {
    needToUpdate = true;
    Logger.verbose(
      `[Function ${functionName}] Layer not attached to the function`
    );
  } else {
    Logger.verbose(
      `[Function ${functionName}] Layer already attached to the function`
    );
  }

  // check if layers with the wrong version are attached
  if (!needToUpdate && ddlLayerArns.find((arn) => arn !== layerArn)) {
    needToUpdate = true;
    Logger.log("Layer with the wrong version attached to the function");
  }

  const ddlEnvironmentVariables = getEnvironmentVarablesForDebugger(
    functionId,
    initialTimeout
  );

  // check if environment variables are already set for each property
  for (const [key, value] of Object.entries(ddlEnvironmentVariables)) {
    if (!environmentVariables || environmentVariables[key] !== value) {
      needToUpdate = true;
      break;
    }
  }

  if (needToUpdate) {
    try {
      const updateFunctionConfigurationCommand =
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Layers: [layerArn, ...otherLayerArns],
          Environment: {
            Variables: {
              ...environmentVariables,
              ...ddlEnvironmentVariables,
            },
          },
          //Timeout: LlDebugger.argOptions.observable ? undefined : 300, // Increase the timeout to 5 minutes
          Timeout: 300,
        });

      getLambdaClient().send(updateFunctionConfigurationCommand);

      Logger.log(
        `[Function ${functionName}] Lambda layer and environment variables updated`
      );
    } catch (error: any) {
      throw new Error(
        `Failed to update Lambda ${functionName}: ${error.message}`,
        { cause: error }
      );
    }
  } else {
    Logger.log(
      `[Function ${functionName}] Lambda layer and environment already up to date`
    );
  }
}

/**
 * Add the policy to the Lambda role
 * @param functionName
 */
async function addPolicyToLambdaRole(functionName: string) {
  // Retrieve the Lambda function's execution role ARN
  const getFunctionResponse = await getLambdaClient().send(
    new GetFunctionCommand({
      FunctionName: functionName,
    })
  );
  const roleArn = getFunctionResponse.Configuration?.Role;
  if (!roleArn) {
    throw new Error(
      `Failed to retrieve the role ARN for Lambda ${functionName}`
    );
  }

  // Extract the role name from the role ARN
  const roleName = roleArn.split("/").pop();

  if (!roleName) {
    throw new Error(
      `Failed to extract role name from role ARN: ${roleArn} for lambda ${functionName}`
    );
  }

  const existingPolicy = getPolicyDocument(roleName);

  let addPolicy: boolean = true;

  // compare existing policy with the new one
  if (existingPolicy) {
    if (JSON.stringify(existingPolicy) === JSON.stringify(policyDocument)) {
      Logger.verbose(
        `[Function ${functionName}] Policy already attached to the role ${roleName}`
      );
      addPolicy = false;
    }
  }

  if (addPolicy) {
    // add inline policy to the role using PutRolePolicyCommand
    Logger.log(
      `[Function ${functionName}] Attaching policy to the role ${roleName}`
    );

    await getIAMClient().send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: inlinePolicyName,
        PolicyDocument: JSON.stringify(policyDocument),
      })
    );
  }
}

/**
 * Get the environment variables for the Lambda function
 * @param functionId
 * @param timeout
 * @returns
 */
function getEnvironmentVarablesForDebugger(
  functionId: string,
  timeout: number | undefined
): Record<string, string> {
  return {
    LLD_FUNCTION_ID: functionId,
    AWS_LAMBDA_EXEC_WRAPPER: "/opt/lld-wrapper",
    NODE_OPTIONS: "--enable-source-maps",
    LLD_DEBUGGER_ID: Configuration.config.debuggerId,
    LLD_INITIAL_TIMEOUT: timeout ? timeout.toString() : "-1", // should never be negative
    LLD_OBSERVABLE_MODE: Configuration.config.observable ? "true" : "false",
    LLD_OBSERVABLE_INTERVAL: Configuration.config.interval.toString(),
  };
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
      })
    );
    const roleArn = getFunctionResponse.Configuration?.Role;
    if (!roleArn) {
      throw new Error(
        `Failed to retrieve the role ARN for lambda ${functionName}`
      );
    }

    // Extract the role name from the role ARN
    const roleName = roleArn.split("/").pop();

    if (!roleName) {
      Logger.error(
        `Failed to extract role name from role ARN: ${roleArn} for Lambda ${functionName}`
      );
      return;
    }

    const existingPolicy = await getPolicyDocument(roleName);

    if (existingPolicy) {
      try {
        Logger.log(
          `[Function ${functionName}] Removing policy from the role ${roleName}`
        );
        await getIAMClient().send(
          new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: inlinePolicyName,
          })
        );
      } catch (error: any) {
        Logger.error(
          `Failed to delete inline policy ${inlinePolicyName} from role ${roleName} for Lambda ${functionName}:`,
          error
        );
      }
    } else {
      Logger.log(
        `[Function ${functionName}] No need to remove policy from the role ${roleName}, policy not found`
      );
    }
  } catch (error: any) {
    throw new Error(
      `Failed to remove policy from the role for Lambda ${functionName}: ${error.message}`,
      { cause: error }
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
      })
    );

    if (policy.PolicyDocument) {
      const policyDocument = JSON.parse(
        decodeURIComponent(policy.PolicyDocument)
      );
      return policyDocument;
    } else {
      return undefined;
    }
  } catch (error: any) {
    if (error.name === "NoSuchEntityException") {
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
    const p = attachLayerToLambda(
      func.functionName,
      func.functionId,
      layerVersionArn
    );
    if (process.env.DISABLE_PARALLEL_DEPLOY === "true") {
      await p;
    } else {
      promises.push(p);
    }
  }

  const p = (async () => {
    // do not do it in parallel, because Lambdas could share the same role
    for (const func of Configuration.getLambdas()) {
      await addPolicyToLambdaRole(func.functionName);
    }
  })(); // creates one promise
  if (process.env.DISABLE_PARALLEL_DEPLOY === "true") {
    await p;
  } else {
    promises.push(p);
  }

  await Promise.all(promises);
}

/**
 * Remove the infrastructure
 */
async function removeInfrastructure() {
  Logger.verbose("Removing Lambda Live Debugger infrastructure.");
  const promises: Promise<void>[] = [];

  for (const func of Configuration.getLambdas()) {
    const p = removeLayerFromLambda(func.functionName);
    if (process.env.DISABLE_PARALLEL_DEPLOY === "true") {
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
  if (process.env.DISABLE_PARALLEL_DEPLOY === "true") {
    await p;
  } else {
    promises.push(p);
  }

  await Promise.all(promises);
}

export const InfraDeploy = {
  deployInfrastructure,
  removeInfrastructure,
  deleteLayer,
};
