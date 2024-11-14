import { readFile, writeFile } from 'fs/promises';
import { argv } from 'process';

async function modifyPackageJson(testCase) {
  const filePath = 'package.json';

  const data = await readFile(filePath, 'utf-8');
  const packageJson = JSON.parse(data);

  // Delete scripts and devDependencies nodes
  delete packageJson.scripts;
  delete packageJson.devDependencies;

  // Replace workspaces node with specified values
  packageJson.workspaces = ['test', `test/${testCase}`];

  // Write the modified package.json back to the file
  await writeFile(filePath, JSON.stringify(packageJson, null, 2), 'utf-8');
  console.log(`Modified ${filePath} successfully!`);
}

// Run the function with the provided file path and argument
const [testCase] = argv.slice(1);
if (!testCase) {
  console.error('Usage: node prepareForTest.js <workspace-arg>');
  process.exit(1);
}

modifyPackageJson(filePath, testCase);
