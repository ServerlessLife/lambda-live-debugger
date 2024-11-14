import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
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

describe('osls-esbuild-esm', async () => {
  const folder = await getTestProjectFolder('osls-esbuild-esm');
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
    const lambdaName = 'lls-osls-esbuild-esm-test-testTsEsModule';
    await expectInfraDeployed(lambdaName);
  });

  test('call Lambda - testTsEsModule', async () => {
    const lambdaName = 'lls-osls-esbuild-esm-test-testTsEsModule';

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
      const lambdaName = 'lls-osls-esbuild-esm-test-testTsEsModule';
      await expectInfraRemoved(lambdaName);
    }
  });
});
