import {
  type ListStackResourcesCommand as ListStackResourcesCommandType,
  type StackResourceSummary,
  type CloudFormationClient,
} from '@aws-sdk/client-cloudformation';
import { AwsCredentials } from './awsCredentials.js';
import { AwsConfiguration } from './types/awsConfiguration.js';
import { Logger } from './logger.js';
import * as yaml from 'yaml';

let cloudFormationClient: CloudFormationClient;

/**
 * Get CloudFormation stack template
 * @param stackName
 * @param awsConfiguration
 * @returns
 */
async function getCloudFormationStackTemplate(
  stackName: string,
  awsConfiguration: AwsConfiguration,
) {
  const { GetTemplateCommand } = await import('@aws-sdk/client-cloudformation');
  const command = new GetTemplateCommand({ StackName: stackName });
  const cloudFormationClient = await getCloudFormationClient(awsConfiguration);

  try {
    const response = await cloudFormationClient.send(command);

    if (!response.TemplateBody) {
      throw new Error(`No template found for stack ${stackName}`);
    }

    let cfTemplate: any;
    try {
      cfTemplate = JSON.parse(response.TemplateBody);
    } catch (parseError: any) {
      if (parseError.message.includes('is not valid JSON')) {
        // If the template is not JSON, try parsing it as YAML
        cfTemplate = yaml.parse(response.TemplateBody);
      } else {
        throw parseError;
      }
    }
    return cfTemplate;
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      Logger.error(
        `Stack ${stackName} not found. Try specifying a region. Error: ${error.message}`,
        error,
      );
      return undefined;
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
      '@aws-sdk/client-cloudformation'
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
  awsConfiguration: AwsConfiguration,
) {
  // temporary disable console.error because SAM framework outputs useless errors
  const originalConsoleError = console.error;
  console.error = function () {};
  const { ListStackResourcesCommand } = await import(
    '@aws-sdk/client-cloudformation'
  );
  console.error = originalConsoleError;

  const cloudFormationClient: CloudFormationClient =
    await getCloudFormationClient(awsConfiguration);

  try {
    let nextToken: string | undefined = undefined;
    const items: StackResourceSummary[] = [];
    do {
      const command: ListStackResourcesCommandType =
        new ListStackResourcesCommand({
          StackName: stackName,
          NextToken: nextToken,
        });

      const response = await cloudFormationClient.send(command);

      if (response.StackResourceSummaries) {
        items.push(...response.StackResourceSummaries);
      }
      nextToken = response.NextToken;
    } while (nextToken);
    return items;
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      Logger.error(
        `Stack ${stackName} not found. Try specifying a region. Error: ${error.message}`,
        error,
      );
      return undefined;
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
  awsConfiguration: AwsConfiguration,
): Promise<
  Array<{
    lambdaName: string;
    logicalId: string;
    stackName: string;
  }>
> {
  const response = await getCloudFormationResources(
    stackName,
    awsConfiguration,
  );

  const lambdaResources = response?.filter(
    (resource) => resource.ResourceType === 'AWS::Lambda::Function',
  );

  const nestedStacks = response?.filter(
    (resource) => resource.ResourceType === 'AWS::CloudFormation::Stack',
  );

  const lambdas =
    lambdaResources?.map((resource) => {
      return {
        lambdaName: resource.PhysicalResourceId!,
        logicalId: resource.LogicalResourceId!,
        stackName: stackName,
      };
    }) ?? [];

  const lambdasInNestedStacks = await Promise.all(
    (nestedStacks ?? []).map(async (nestedStack) => {
      if (!nestedStack.PhysicalResourceId) return [];

      const lambdasInNestedStack = await getLambdasInStack(
        nestedStack.PhysicalResourceId,
        awsConfiguration,
      );

      return lambdasInNestedStack;
    }),
  );

  const flattenedLambdasInNestedStacks = lambdasInNestedStacks.flat();

  const allLambdas = [...lambdas, ...flattenedLambdasInNestedStacks];
  return allLambdas;
}

export const CloudFormation = {
  getCloudFormationStackTemplate,
  getLambdasInStack,
};
