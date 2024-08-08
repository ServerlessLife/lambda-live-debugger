import { expect } from 'vitest';
import { getFuntionConfiguration } from './getFuntionConfiguration.js';
import { getPolicyDocument } from './getPolicyDocument.js';

export async function expectInfraRemoved(fuctionName: string) {
  const lambdaConfiguration = await getFuntionConfiguration(fuctionName);
  const roleArn = lambdaConfiguration.Configuration?.Role;
  const policyDocument = await getPolicyDocument(roleArn);

  const envVariables =
    lambdaConfiguration.Configuration?.Environment?.Variables ?? {};

  expect(envVariables.AWS_LAMBDA_EXEC_WRAPPER).toBeUndefined();
  expect(envVariables.LLD_DEBUGGER_ID).toBeUndefined();
  expect(envVariables.LLD_FUNCTION_ID).toBeUndefined();
  expect(envVariables.LLD_INITIAL_TIMEOUT).toBeUndefined();
  expect(envVariables.NODE_OPTIONS).toBeUndefined();

  expect(lambdaConfiguration.Configuration?.Layers).toBeUndefined();
  expect(policyDocument).toBeUndefined();
}
