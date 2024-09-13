// @ts-nocheck
import { createRequire as topLevelCreateRequire } from 'module';
const require = topLevelCreateRequire(import.meta.url);
import path from 'path';

import { workerData, parentPort } from 'node:worker_threads';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import fs from 'fs/promises'; // do not delete this line

import { Logger } from '../logger.mjs';

Logger.setVerbose(workerData.verbose);

Logger.verbose(`[CDK] [Worker] Started`);

parentPort.on('message', async (data) => {
  try {
    // this is global variable to store the data from the CDK code once it is executed
    global.lambdas = [];

    Logger.verbose(`[Worker ${workerData.workerId}] Received message`, data);

    // execute code to get the data into global.lambdas
    await fixCdkPaths(workerData.awsCdkLibPath);
    await import(data.compileOutput);

    if (!global.lambdas || global.lambdas?.length === 0) {
      throw new Error('No Lambda functions found in the CDK code');
    }

    const lambdas = global.lambdas.map((lambda) => ({
      handler: lambda.handler,
      stackName: lambda.stackName,
      codePath: lambda.codePath,
      code: {
        path: lambda.code?.path,
      },
      cdkPath: lambda.node.defaultChild.node.path,
      bundling: {
        ...lambda.bundling,
        commandHooks: undefined, // can not be serialized
      },
    }));

    Logger.verbose(
      `[CDK] [Worker] Sending found lambdas`,
      JSON.stringify(lambdas, null, 2),
    );
    parentPort.postMessage(lambdas);
  } catch (error) {
    Logger.error(`[CDK] [Worker] Error`, error);
    throw error;
  }
});

/**
 * Some paths are not resolved correctly in the CDK code, so we need to fix them
 */
async function fixCdkPaths(awsCdkLibPath) {
  // leave this lines for manual debugging
  //const awsCdkLibPath = path.resolve("node_modules/aws-cdk-lib");
  //const path = require("path");

  Logger.verbose(`[CDK] [Worker] aws-cdk-lib PATH ${awsCdkLibPath}`);

  const pathsFix = {
    'custom-resource-handlers/': `${awsCdkLibPath}/custom-resource-handlers/`,
    'aws-custom-resource-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/custom-resources/aws-custom-resource-handler`,
    'auto-delete-objects-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-s3/auto-delete-objects-handler`,
    'notifications-resource-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-s3/notifications-resource-handler`,
    'drop-spam-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-ses/drop-spam-handler`,
    'aws-stepfunctions-tasks/role-policy-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-stepfunctions-tasks/role-policy-handler`,
    'eval-nodejs-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-stepfunctions-tasks/eval-nodejs-handler`,
    'cross-account-zone-delegation-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-route53/cross-account-zone-delegation-handler`,
    'delete-existing-record-set-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-route53/delete-existing-record-set-handler`,
    'aws-api-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-events-targets/aws-api-handler`,
    'log-retention-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-logs/log-retention-handler`,
    'cluster-resource-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-eks/cluster-resource-handler`,
    'auto-delete-images-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-ecr/auto-delete-images-handler`,
    'bucket-deployment-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-s3-deployment/bucket-deployment-handler`,
    'nodejs-entrypoint-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/core/nodejs-entrypoint-handler`,
    'restrict-default-security-group-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-ec2/restrict-default-security-group-handler`,
    'dns-validated-certificate-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-certificatemanager/dns-validated-certificate-handler`,
    'auto-delete-underlying-resources-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-synthetics/auto-delete-underlying-resources-handler`,
    'replica-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-dynamodb/replica-handler`,
    'oidc-handler': `${awsCdkLibPath}/custom-resource-handlers/dist/aws-iam/oidc-handler`,
  };

  // Create a proxy to intercept calls to the path module so we can fix paths
  const pathProxy = new Proxy(path, {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return function (...args) {
          if (prop === 'resolve') {
            let resolvedPath = target[prop].apply(target, args);

            for (const [key, value] of Object.entries(pathsFix)) {
              if (resolvedPath.includes(key)) {
                // replace the beginning of the path with the value
                const i = resolvedPath.indexOf(key);
                const newResolvedPath = `${value}${resolvedPath.substring(i + key.length)}`;
                Logger.verbose(
                  `[CDK] [Worker] Fixing path ${resolvedPath} -> ${newResolvedPath}`,
                );
                resolvedPath = newResolvedPath;
              }
            }

            return resolvedPath;
          }
          if (prop === 'join') {
            let resolvedPath = target[prop].apply(target, args);

            for (const [key, value] of Object.entries(pathsFix)) {
              if (resolvedPath.includes(key)) {
                // replace the beginning of the path with the value
                const i = resolvedPath.indexOf(key);
                const newResolvedPath = `${value}${resolvedPath.substring(i + key.length)}`;
                Logger.verbose(
                  `[CDK] [Worker] Fixing path ${resolvedPath} -> ${newResolvedPath}`,
                );
                resolvedPath = newResolvedPath;
              }
            }

            return resolvedPath;
          }
          return target[prop].apply(target, args);
        };
      }
      return target[prop];
    },
  });

  // Override the path module in the require cache
  require.cache[require.resolve('path')] = {
    exports: pathProxy,
  };
}

process.on('unhandledRejection', (error) => {
  Logger.error(`[CDK] [Worker] Unhandled Rejection`, error);
});
