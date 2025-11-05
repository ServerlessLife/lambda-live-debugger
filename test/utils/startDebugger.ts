import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

export async function startDebugger(folder: string, args: string[] = []) {
  try {
    return await startDebuggerInternal(folder, args);
  } catch (e: any) {
    console.log(`[LLD] Failed to start LLD: ${e.message}. Retrying...`);
    await setTimeout(1500);
    return await startDebuggerInternal(folder, args);
  }
}

async function startDebuggerInternal(folder: string, args: string[] = []) {
  const argsI = [...args];

  console.log('Starting LLD...');

  let testMonorepo = false;
  if (process.env.TEST_MONOREPO === 'true') {
    testMonorepo = true;
    // just the last two part of the folder
    const folderParts = folder.split('/');
    const testProjectFolder =
      folderParts[folderParts.length - 2] +
      '/' +
      folderParts[folderParts.length - 1];
    argsI.push(`-m ${testProjectFolder}`);
  }

  if (process.env.OBSERVABLE_MODE === 'true') {
    argsI.push('-o');
  }

  argsI.push('-v');

  argsI.push('--region eu-west-1');

  let command = `node ${
    testMonorepo ? '' : '../../'
  }dist/lldebugger.mjs ${argsI?.join(' ')}`;

  if (process.env.REAL_NPM === 'true') {
    console.log('Running the debugger with the real NPM');
    command = `lld ${argsI?.join(' ')}`;
  } else {
    console.log('Running the debugger with just genereted code');
  }

  const lldProcess = spawn(command, {
    cwd: !testMonorepo ? folder : undefined,
    shell: true,
  });

  // wait for the debugger to start
  await new Promise((resolve, reject) => {
    let errorWhileRunning = false;
    if (!lldProcess) {
      throw new Error('Failed to start LLD');
    }

    lldProcess.stdout?.on('data', (data) => {
      console.log('LLD: ' + data.toString());
      const line = data.toString();
      if (line.includes('Debugger started!')) {
        resolve(true);
      }
    });
    lldProcess.stderr?.on('data', (data) => {
      console.log('[LLD] ERROR: ' + data.toString());
      errorWhileRunning = true;
    });
    lldProcess.on('close', (error) => {
      console.log(`[LLD] CLOSED: error=${errorWhileRunning}`);
      if (error) {
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
  await setTimeout(7000);
  return lldProcess;
}
