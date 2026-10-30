import fs from 'node:fs';
import { apiRequest, ensureEnvFile } from '../api.js';
import { readConfig, getProjectConfig } from '../config.js';
import { encryptEnv, parseEnv } from '../crypto.js';

export async function pushCommand(options = {}) {
  const config = readConfig();
  if (!config) {
    throw new Error('Not logged in. Run: envshare login');
  }

  const projectConfig = getProjectConfig();
  const envName = options.env || projectConfig?.env || 'development';
  ensureEnvFile();

  const envPath = process.cwd() + '/.env';
  const localText = fs.readFileSync(envPath, 'utf8');
  const keyNames = Object.keys(parseEnv(localText));
  const { ciphertext, iv } = encryptEnv(localText, config.teamKey);

  const envs = await apiRequest(`/teams/${projectConfig?.teamId || config.teamId}/projects`);
  const projectId = projectConfig?.projectId || envs?.[0]?.id;
  if (!projectId) {
    throw new Error('Missing project context. Run envshare init first.');
  }

  const project = (await apiRequest(`/teams/${projectConfig?.teamId || config.teamId}/projects`)).find((item) => item.id === projectId) || { id: projectId };
  const envsForProject = project.environments || [];
  const env = envsForProject.find((entry) => entry.name === envName);
  if (!env) {
    throw new Error(`Environment ${envName} not found in project ${project.name || projectId}.`);
  }

  await apiRequest(`/environments/${env.id}/versions`, {
    method: 'POST',
    body: JSON.stringify({
      ciphertext,
      iv,
      key_names: keyNames,
      message: options.message || '',
    }),
  });

  console.log(`Pushed ${envName} environment for project ${project.id}.`);
}
