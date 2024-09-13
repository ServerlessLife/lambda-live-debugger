import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import fs from 'fs/promises';
import { startDebugger } from './utils/startDebugger.js';
import { expectInfraRemoved } from './utils/expectInfraRemoved.js';
import { expectInfraDeployed } from './utils/expectInfraDeployed.js';
import { removeInfra } from './utils/removeInfra.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { callLambda } from './utils/callLambda.js';
import { getSamplePayload } from './utils/getSamplePayload.js';
import { validateLocalResponse } from './utils/validateLocalResponse.js';
import { getTestProjectFolder } from './utils/getTestProjectFolder.js';
import path from 'path';

export const execAsync = promisify(exec);

export const observableMode = process.env.OBSERVABLE_MODE === 'true';

describe('cdk-esm', async () => {
  const folder = await getTestProjectFolder('cdk-esm');

  let lldProcess: ChildProcess | undefined;

  beforeAll(async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      lldProcess = await startDebugger(folder, ['-c=environment=test']);
    }
  });

  afterAll(async () => {
    // stop the debugger
    lldProcess?.kill();
  });

  test('check infra', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestTsCommonJs',
    );
    await expectInfraDeployed(lambdaName);
  });

  test('call Lambda - testTsCommonJs', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestTsCommonJs',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testTsEsModule', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestTsEsModule',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsCommonJs', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestJsCommonJs',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.runningLocally).toEqual(!observableMode);
    expect(response.inputEvent).toEqual(payload);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsEsModule', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestJsEsModule',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsCommonJsBase', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestJsCommonJsBase',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsEsModuleBase', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'FunctionNameTestJsEsModuleBase',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('remove infra', async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      await removeInfra(lldProcess, folder);
      const lambdaName = await getFunctionName(
        folder,
        'FunctionNameTestTsCommonJs',
      );
      await expectInfraRemoved(lambdaName);
    }
  });
});

async function getFunctionName(folder: string, functionName: string) {
  const cdkOutputs = JSON.parse(
    await fs.readFile(path.join(folder, 'cdk-outputs.json'), 'utf-8'),
  );
  const lambdaName = cdkOutputs['test-lld-cdk-esm'][functionName];
  return lambdaName;
}
