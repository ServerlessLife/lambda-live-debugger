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

const observableMode = process.env.OBSERVABLE_MODE === 'true';

describe('sam-alt', async () => {
  const folder = await getTestProjectFolder('sam-alt');
  let lldProcess: ChildProcess | undefined;

  beforeAll(async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      lldProcess = await startDebugger(folder, [
        '--config-env=test',
        '--sam-config-file=alt-samconfig.yaml',
        '--sam-template-file=alt-template.yaml',
      ]);
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

  test('remove infra', async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      await removeInfra(lldProcess, folder, [
        '--config-env=test',
        '--sam-config-file=alt-samconfig.yaml',
        '--sam-template-file=alt-template.yaml',
      ]);
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
