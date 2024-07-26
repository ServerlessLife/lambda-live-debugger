import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({});

export async function callLambda(
  lambdaName: any,
  payload: { lambdaName: any; timestamp: string }
) {
  const { Payload } = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: lambdaName,
      Payload: JSON.stringify(payload),
    })
  );

  const responseString = new TextDecoder().decode(Payload);
  const response = JSON.parse(responseString);
  return response;
}
