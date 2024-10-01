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

describe('terraform-basic', async () => {
  const folder = await getTestProjectFolder('terraform-basic');
  let lldProcess: ChildProcess | undefined;

  beforeAll(async () => {
    if (process.env.CI === 'true' || process.env.RUN_TEST_FROM_CLI === 'true') {
      lldProcess = await startDebugger(folder);
    }
  });

  afterAll(async () => {
    // stop the debugger
    lldProcess?.kill();
  });

  test('check infra', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'lambda-test-js-commonjs_1_name',
    );
    await expectInfraDeployed(lambdaName);
  });

  test('call Lambda - testTsCommonJs', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'lambda-test-ts-commonjs_name',
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
      'lambda-test-ts-esmodule_name',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsCommonJs_1', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'lambda-test-js-commonjs_1_name',
    );

    const payload = getSamplePayload(lambdaName);
    const response = await callLambda(lambdaName, payload);

    expect(response.inputEvent).toEqual(payload);
    expect(response.runningLocally).toEqual(!observableMode);
    if (observableMode) {
      await validateLocalResponse(lambdaName, payload);
    }
  });

  test('call Lambda - testJsCommonJs_2', async () => {
    const lambdaName = await getFunctionName(
      folder,
      'lambda-test-js-commonjs_2_name',
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
    const lambdaName = await getFunctionName(
      folder,
      'lambda-test-js-esmodule_name',
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
        'lambda-test-js-commonjs_1_name',
      );
      await expectInfraRemoved(lambdaName);
    }
  });
});

export async function getFunctionName(folder: string, functionName: string) {
  let jsonString: string | undefined = await fs.readFile(
    `${folder}/terraform-outputs.json`,
    'utf-8',
  );

  // on CICD we get strange output
  const start = jsonString.indexOf('{');
  const end = jsonString.lastIndexOf('::debug::Terraform exited with code 0.');
  if (start > -1 && end > -1) {
    jsonString = jsonString.substring(start, end);
  }

  if (!jsonString) {
    throw new Error('Failed to get Terraform outputs. JSON string not found.');
  }

  let outputs: any;

  try {
    outputs = JSON.parse(jsonString);
  } catch (e: any) {
    throw new Error(
      `Failed to parse Terraform outputs: ${e.message}. JSON: ${jsonString}`,
    );
  }

  try {
    const lambdaName = outputs[functionName].value;
    return lambdaName;
  } catch {
    throw new Error(
      `Failed to get function name for ${functionName}. Outputs: ${JSON.stringify(outputs)}`,
    );
  }
}
