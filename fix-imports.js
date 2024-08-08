import { readdir, readFile, writeFile, rename } from 'fs/promises';
import { join, dirname, parse } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Recursively process all files in a directory and convert JS files to MJS files.
 * Fix import paths in the files to use the new MJS extension.
 * @param {*} directory
 */
async function processFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await processFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const data = await readFile(fullPath, 'utf8');
      const updatedData = data
        .split('\n')
        .map((line) => {
          if (line.trim().startsWith('import')) {
            return line.replace(/\.js"/g, '.mjs"');
          }
          return line;
        })
        .join('\n');
      const { dir, name } = parse(fullPath);
      const newFullPath = join(dir, `${name}.mjs`);

      await writeFile(fullPath, updatedData, 'utf8');
      await rename(fullPath, newFullPath);
    }
  }
}

const directoryPath = join(__dirname, 'dist');

processFiles(directoryPath)
  .then(() =>
    console.log(
      'JS files have been converted to MJS and import paths updated.',
    ),
  )
  .catch((err) => console.error('Error processing files:', err));
