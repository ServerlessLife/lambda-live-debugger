import { expect } from "vitest";
import { getFuntionConfiguration } from "./getFuntionConfiguration.js";
import { getPolicyDocument } from "./getPolicyDocument.js";

export async function expectInfraDeployed(lambdaName: any) {
  if (process.env.CI === "true" || process.env.RUN_TEST_FROM_CLI === "true") {
    const lambdaConfiguration = await getFuntionConfiguration(lambdaName);
    const roleArn = lambdaConfiguration.Configuration?.Role;
    const policyDocument = await getPolicyDocument(roleArn);

    expect(
      lambdaConfiguration.Configuration?.Environment?.Variables,
    ).toMatchObject({
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/lld-wrapper",
      LLD_DEBUGGER_ID: expect.any(String),
      LLD_FUNCTION_ID: expect.any(String),
      LLD_INITIAL_TIMEOUT: expect.any(String),
      NODE_OPTIONS: "--enable-source-maps",
    });

    const initialTimeout = parseInt(
      lambdaConfiguration.Configuration?.Environment?.Variables
        ?.LLD_INITIAL_TIMEOUT as string,
    );
    expect(initialTimeout).toBeLessThanOrEqual(10);
    expect(initialTimeout).toBeGreaterThan(0);

    expect(lambdaConfiguration.Configuration?.Layers?.length).toEqual(1);

    expect(lambdaConfiguration.Configuration?.Layers![0].Arn).toContain(
      ":layer:LambdaLiveDebugger:",
    );
    expect(policyDocument).toEqual({
      Statement: [
        {
          Action: "iot:*",
          Effect: "Allow",
          Resource: "*",
        },
      ],
      Version: "2012-10-17",
    });
  }
}
