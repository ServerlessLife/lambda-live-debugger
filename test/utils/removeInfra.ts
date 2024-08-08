import { ChildProcess, execSync } from 'child_process';
import { setTimeout } from 'timers/promises';

export async function removeInfra(
  lldProcess: ChildProcess | undefined,
  folder: string,
  args: string[] = [],
) {
  lldProcess?.kill();

  let command = `node ../../dist/lldebugger.mjs --remove ${args?.join(' ')}`;

  if (process.env.REAL_NPM === 'true') {
    command = `lld --remove ${args?.join(' ')}`;
  }

  await execSync(command, {
    cwd: folder,
  });

  await setTimeout(5000);
}
