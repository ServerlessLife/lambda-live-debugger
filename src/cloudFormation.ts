import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { AwsCredentials } from "./awsCredentials.js";
import { AwsConfiguration } from "./types/awsConfiguration.js";

let cloudFormationClient: CloudFormationClient;

/**
 * Get CloudFormation stack template
 * @param stackName
 * @param awsConfiguration
 * @returns
 */
async function getCloudFormationStackTemplate(
  stackName: string,
  awsConfiguration: AwsConfiguration
) {
  const { GetTemplateCommand } = await import("@aws-sdk/client-cloudformation");
  const command = new GetTemplateCommand({ StackName: stackName });
  const cloudFormationClient = await getCloudFormationClient(awsConfiguration);

  try {
    const response = await cloudFormationClient.send(command);

    if (!response.TemplateBody) {
      throw new Error(`No template found for stack ${stackName}`);
    }

    const cfTemplate = JSON.parse(response.TemplateBody);
    return cfTemplate;
  } catch (error: any) {
    if (error.name === "ValidationError") {
      throw new Error(
        `Stack ${stackName} not found. Try specifying a region. Error: ${error.message}`,
        { cause: error }
      );
    } else {
      throw error;
    }
  }
}

/**
 * Get CloudFormation client
 * @param awsConfiguration
 * @returns
 */
async function getCloudFormationClient(awsConfiguration: AwsConfiguration) {
  if (!cloudFormationClient) {
    const { CloudFormationClient } = await import(
      "@aws-sdk/client-cloudformation"
    );
    cloudFormationClient = new CloudFormationClient({
      region: awsConfiguration.region,
      credentials: AwsCredentials.getCredentialsProvider(awsConfiguration),
    });
  }
  return cloudFormationClient;
}

/**
 * Get CloudFormation resources
 * @param stackName
 * @param awsConfiguration
 * @returns
 */
async function getCloudFormationResources(
  stackName: string,
  awsConfiguration: AwsConfiguration
) {
  const { ListStackResourcesCommand } = await import(
    "@aws-sdk/client-cloudformation"
  );
  const command = new ListStackResourcesCommand({
    StackName: stackName,
  });
  const cloudFormationClient = await getCloudFormationClient(awsConfiguration);

  try {
    const response = await cloudFormationClient.send(command);

    return response;
  } catch (error: any) {
    if (error.name === "ValidationError") {
      throw new Error(
        `Stack ${stackName} not found. Try specifying a region. Error: ${error.message}`,
        { cause: error }
      );
    } else {
      throw error;
    }
  }
}

/**
 * Get Lambdas in stack
 * @param stackName
 * @param awsConfiguration
 * @returns
 */
async function getLambdasInStack(
  stackName: string,
  awsConfiguration: AwsConfiguration
): Promise<
  Array<{
    lambdaName: string;
    logicalId: string;
  }>
> {
  const response = await getCloudFormationResources(
    stackName,
    awsConfiguration
  );
  const lambdaResources = response.StackResourceSummaries?.filter(
    (resource) => resource.ResourceType === "AWS::Lambda::Function"
  );

  return lambdaResources?.map((resource) => {
    return {
      lambdaName: resource.PhysicalResourceId!,
      logicalId: resource.LogicalResourceId!,
    };
  })!;
}

export const CloudFormation = {
  getCloudFormationStackTemplate,
  getLambdasInStack,
};
