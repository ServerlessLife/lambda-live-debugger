import fs from 'fs/promises';
import path from 'path';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { getProjectDirname } from './getDirname.js';
import { Logger } from './logger.js';
import { getRuntimeExecutableForIde } from './utils/getRuntimeExecutableForIde.js';

const workspaceXmlPath = path.join(
  getProjectDirname(),
  '.idea',
  'workspace.xml',
);

async function getJetBrainsLaunchConfig() {
  let runtimeExecutable = await getRuntimeExecutableForIde(false);

  if (!runtimeExecutable) {
    return undefined;
  }

  runtimeExecutable = runtimeExecutable.replace(
    '${workspaceFolder}',
    '$PROJECT_DIR$',
  );
  return {
    configuration: {
      '@_name': 'Lambda Live Debugger',
      '@_type': 'NodeJSConfigurationType',
      '@_path-to-js-file': runtimeExecutable,
      '@_working-dir': '$PROJECT_DIR$',
      method: { '@_v': '2' },
    },
  };
}

async function readWorkspaceXml(
  filePath: string,
): Promise<{ json: any; xmlString: string }> {
  try {
    const xmlString = await fs.readFile(filePath, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      allowBooleanAttributes: true,
    });
    const json = parser.parse(xmlString);
    return { json, xmlString };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { json: null, xmlString: '' };
    }
    throw new Error(`Error reading ${filePath}`, { cause: err });
  }
}

async function writeWorkspaceXml(filePath: string, json: any) {
  try {
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      suppressEmptyNode: true,
      suppressBooleanAttributes: false,
    });
    const xmlString = builder.build(json);
    await fs.writeFile(filePath, xmlString, 'utf-8');
    Logger.verbose(`Updated JetBrains IDE configuration at ${filePath}`);
  } catch (err) {
    throw new Error(`Error writing ${filePath}`, { cause: err });
  }
}

async function isConfigured() {
  const { json } = await readWorkspaceXml(workspaceXmlPath);
  if (!json) return false;

  const components = Array.isArray(json.project?.component)
    ? json.project.component
    : [json.project?.component];
  const runManager = components.find((c: any) => c['@_name'] === 'RunManager');
  if (!runManager) return false;

  const configurations = runManager.configuration || [];
  return configurations.some(
    (c: any) => c['@_name'] === 'Lambda Live Debugger',
  );
}

async function addConfiguration() {
  Logger.verbose('Adding JetBrains IDE run/debug configuration');
  const { json } = await readWorkspaceXml(workspaceXmlPath);
  const config = await getJetBrainsLaunchConfig();

  if (!config) {
    Logger.error(
      'Cannot find a locally installed Lambda Live Debugger. The JetBrains IDE debugger cannot use a globally installed version.',
    );
    return;
  }

  if (!json) {
    // Create new workspace.xml if it does not exist
    const newJson = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      project: {
        '@_version': '4',
        component: {
          '@_name': 'RunManager',
          configuration: [config.configuration],
        },
      },
    };
    await fs.mkdir(path.dirname(workspaceXmlPath), { recursive: true });
    await writeWorkspaceXml(workspaceXmlPath, newJson);
    return;
  }

  let runManager = json.project.component.find(
    (c: any) => c['@_name'] === 'RunManager',
  );

  if (!runManager) {
    Logger.verbose('RunManager not found, creating new RunManager component');
    runManager = { '@_name': 'RunManager', configuration: [] };
    json.project.component.push(runManager);
  }

  let configurations;
  if (!runManager.configuration) {
    configurations = [];
  } else if (!Array.isArray(runManager.configuration)) {
    configurations = [runManager.configuration];
  } else {
    configurations = runManager.configuration;
  }

  const exists = configurations.some(
    (c: any) => c['@_name'] === config.configuration['@_name'],
  );
  if (!exists) {
    Logger.verbose('Adding new configuration to workspace.xml');
    runManager.configuration = [...configurations, config.configuration];
    await writeWorkspaceXml(workspaceXmlPath, json);
  } else {
    Logger.verbose('Configuration already exists in workspace.xml');
  }
}

export const JetBrains = {
  isConfigured,
  addConfiguration,
};
