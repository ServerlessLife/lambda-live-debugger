export function getDebuggerStartCommand(folder: string, args: string[]) {
  let testMonorepo = process.env.TEST_MONOREPO === 'true';
  if (testMonorepo) {
    testMonorepo = true;
    // just the last two part of the folder
    const folderParts = folder.split('/');
    const testProjectFolder =
      folderParts[folderParts.length - 2] +
      '/' +
      folderParts[folderParts.length - 1];
    args.push(`-m ${testProjectFolder}`);
  }

  if (process.env.OBSERVABLE_MODE === 'true') {
    args.push('-o');
  }

  args.push('-v');

  let command: string;

  if (process.env.REAL_NPM === 'true') {
    console.log('Running the debugger with the real NPM');
    command = `lld ${args?.join(' ')}`;
  } else {
    command = `node ${testMonorepo ? '' : '../../'}dist/lldebugger.mjs ${args?.join(' ')}`;
    console.log('Running the debugger with just genereted code');
  }
  console.log(`Command to run LLD: ${command}`);
  console.log(`Current folder: ${import.meta.dirname}`);

  return command;
}
