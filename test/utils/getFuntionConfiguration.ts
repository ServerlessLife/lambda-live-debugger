import { GetFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";

export const lambdaClient = new LambdaClient({});

export async function getFuntionConfiguration(lambdaName: string) {
  const lambdaConfiguration = await lambdaClient.send(
    new GetFunctionCommand({
      FunctionName: lambdaName,
    }),
  );
  return lambdaConfiguration;
}
