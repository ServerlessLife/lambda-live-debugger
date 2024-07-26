import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { AwsCredentialIdentityProvider } from "@smithy/types";
import { AwsConfiguration } from "./types/awsConfiguration.js";

/**
 * Get AWS credentials provider
 * @param awsConfiguration
 * @returns
 */
function getCredentialsProvider(
  awsConfiguration: AwsConfiguration
): AwsCredentialIdentityProvider {
  return fromNodeProviderChain({
    clientConfig: { region: awsConfiguration.region },
    profile: awsConfiguration.profile,
    roleArn: awsConfiguration.role,
  });
}

export const AwsCredentials = {
  getCredentialsProvider,
};
