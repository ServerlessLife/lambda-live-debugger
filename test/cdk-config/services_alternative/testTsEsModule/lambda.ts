import { Handler } from 'aws-lambda';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const stsClient = new STSClient({});

export const lambdaHandler: Handler = async (event, context) => {
  // check context
  const remainingTime = context.getRemainingTimeInMillis();
  if (remainingTime === undefined) {
    throw new Error('Remaining time is undefined');
  }

  // check SDK works
  const command = new GetCallerIdentityCommand({});
  const identity = await stsClient.send(command);

  const response = {
    inputEvent: event,
    accountId: identity.Account,
    runningLocally: process.env.IS_LOCAL === 'true',
  };

  if (process.env.IS_LOCAL === 'true') {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(
      '..',
      'local_lambda_responses',
      `${context.functionName}.json`,
    );

    fs.writeFileSync(filePath, JSON.stringify(response, null, 2));
  }

  return response;
};
