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

export const execAsync = promisify(exec);

export const observableMode = process.env.OBSERVABLE_MODE === 'true';

describe('sam-nested', async () => {
  const folder = await getTestProjectFolder('sam-nested');
  let lldProcess: ChildProcess | undefined;

  beforeAll(async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      lldProcess = await startDebugger(folder, ['--config-env=test']);
    }
  });

  afterAll(async () => {
    // stop the debugger
    lldProcess?.kill();
  });

  test('check infra', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestTsCommonJs',
    );
    await expectInfraDeployed(lambdaName);
  });

  test('call Lambda - testTsCommonJs', async () => {
    const lambdaName = await getSamFunctionName(
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
    const lambdaName = await getSamFunctionName(
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
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestJsCommonJs',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsEsModule', async () => {
    const lambdaName = await getSamFunctionName(
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

  test('call Lambda - testTsCommonJsFromNestedStack', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestTsCommonJsFromNestedStack',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testTsEsModuleFromNestedStack', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestTsEsModuleFromNestedStack',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsCommonJsFromNestedStack', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestJsCommonJsFromNestedStack',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.runningLocally).toEqual(!observableMode);
    expect(response.inputEvent).toEqual(payload);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testTsCommonJsNested', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestTsCommonJsNested',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testTsEsModuleNested', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestTsEsModuleNested',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsCommonJsNested', async () => {
    const lambdaName = await getSamFunctionName(
      folder,
      'FunctionNameTestJsCommonJsNested',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.runningLocally).toEqual(!observableMode);
    expect(response.inputEvent).toEqual(payload);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('remove infra', async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      await removeInfra(lldProcess, folder, ['--config-env=test']);
      const lambdaName = await getSamFunctionName(
        folder,
        'FunctionNameTestTsCommonJs',
      );
      await expectInfraRemoved(lambdaName);
    }
  });
});

export async function getSamFunctionName(folder: string, functionName: string) {
  const outputs = JSON.parse(
    await fs.readFile(`${folder}/sam-outputs.json`, 'utf-8'),
  );
  const lambdaName = outputs.find(
    (o: any) => o.OutputKey === functionName,
  )?.OutputValue;
  return lambdaName;
}
