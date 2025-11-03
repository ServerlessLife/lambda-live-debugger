import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsConfiguration } from './types/awsConfiguration.js';

/**
 * Get AWS credentials provider
 * @param awsConfiguration
 * @returns
 */
function getCredentialsProvider(
  awsConfiguration: AwsConfiguration,
): AwsCredentialIdentityProvider {
  return fromNodeProviderChain({
    clientConfig: { region: awsConfiguration.region },
    profile: awsConfiguration.profile,
    roleArn: awsConfiguration.role,
  });
}

/**
 * Detects if LocalStack is being used by making a test request and checking for
 * the 'x-localstack' header in the response.
 * @see {@link https://github.com/localstack/localstack/pull/12769}
 * @param awsConfiguration - AWS configuration to use for the test request
 * @returns true if LocalStack is detected (x-localstack header present), false otherwise
 */
async function isLocalStackDetected(
  awsConfiguration: AwsConfiguration,
): Promise<boolean> {
  // Enable LocalStack response header to detect LocalStack
  process.env.LOCALSTACK_RESPONSE_HEADER_ENABLED = 'true';

  const { STSClient, GetCallerIdentityCommand } = await import(
    '@aws-sdk/client-sts'
  );

  const client = new STSClient({
    region: awsConfiguration.region,
    credentials: fromNodeProviderChain({
      clientConfig: { region: awsConfiguration.region },
      profile: awsConfiguration.profile,
      roleArn: awsConfiguration.role,
    }),
  });

  const command = new GetCallerIdentityCommand({});
  const response = await client.send(command);

  // Check for x-localstack header in response metadata
  const headers = (response.$metadata as any)?.httpHeaders;
  if (
    headers &&
    ('x-localstack' in headers ||
      'X-Localstack' in headers ||
      'X-LOCALSTACK' in headers)
  ) {
    return true;
  }

  return false;
}

export const AwsCredentials = {
  getCredentialsProvider,
  isLocalStackDetected,
};
