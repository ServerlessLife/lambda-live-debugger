import { readFile, writeFile } from 'fs/promises';
import { argv } from 'process';

/**
 * Prepare the package.json file for testing.
 * Remove everything that is not needed for testing.
 * @param {*} testCase
 */
async function modifyPackageJson(testCase) {
  const filePath = 'package.json';

  const data = await readFile(filePath, 'utf-8');
  const packageJson = JSON.parse(data);

  // Delete scripts and devDependencies nodes
  delete packageJson.scripts;
  delete packageJson.devDependencies;

  // Replace workspaces node with the test and the test case workspaces
  // With this all the necessary npm packages will be installed
  packageJson.workspaces = ['test', `test/${testCase}`];

  await writeFile(filePath, JSON.stringify(packageJson, null, 2), 'utf-8');
  console.log(`Modified ${filePath} successfully!`);
}

const [testCase] = argv.slice(2);
if (!testCase) {
  console.error('Usage: node prepareForTest.js <testCase>');
  process.exit(1);
}

void modifyPackageJson(testCase).catch(console.error);
