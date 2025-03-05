import { ChildProcess, execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { getDebuggerStartCommand } from './getDebuggerStartCommand.js';

export async function removeInfra(
  lldProcess: ChildProcess | undefined,
  folder: string,
  args: string[] = [],
) {
  lldProcess?.kill();

  const command = getDebuggerStartCommand(folder, [...args, '--remove']);

  await execSync(command, {
    cwd: folder,
  });

  await setTimeout(5000);
}
