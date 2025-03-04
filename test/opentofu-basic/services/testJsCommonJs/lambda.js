const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

const stsClient = new STSClient({});

const lambdaHandler = async (event, context) => {
  // Check context
  const remainingTime = context.getRemainingTimeInMillis();
  if (remainingTime === undefined) {
    throw new Error('Remaining time is undefined');
  }

  // check if SDK works
  const command = new GetCallerIdentityCommand({});
  const identity = await stsClient.send(command);

  const response = {
    inputEvent: event,
    accountId: identity.Account,
    runningLocally: process.env.IS_LOCAL === 'true',
  };

  if (process.env.IS_LOCAL === 'true') {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(
      '..',
      'local_lambda_responses',
      `${context.functionName}.json`,
    );

    fs.writeFileSync(filePath, JSON.stringify(response, null, 2));
  }

  return response;
};

// Export the lambda handler if needed, e.g., for unit testing
module.exports = {
  lambdaHandler,
};
