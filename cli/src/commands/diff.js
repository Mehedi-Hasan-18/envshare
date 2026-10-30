import fs from 'node:fs';
import { apiRequest, ensureEnvFile } from '../api.js';
import { readConfig, getProjectConfig } from '../config.js';
import { diffEnv, decryptEnv } from '../crypto.js';

export async function diffCommand(options = {}) {
  const config = readConfig();
  if (!config) {
    throw new Error('Not logged in. Run: envshare login');
  }

  const projectConfig = getProjectConfig();
  const teamId = projectConfig?.teamId || config.teamId;
  const projectId = projectConfig?.projectId || null;
  const envName = options.env || projectConfig?.env || 'development';

  if (!teamId || !projectId) {
    throw new Error('Missing team/project context. Run envshare init first.');
  }

  const project = (await apiRequest(`/teams/${teamId}/projects`)).find((item) => item.id === projectId);
  const env = project?.environments?.find((entry) => entry.name === envName);
  if (!env) {
    throw new Error(`Environment ${envName} not found.`);
  }

  ensureEnvFile();
  const localText = fs.readFileSync(process.cwd() + '/.env', 'utf8');
  const latest = await apiRequest(`/environments/${env.id}/versions/latest`);
  const remoteText = decryptEnv(latest.ciphertext, latest.iv, config.teamKey);
  const diff = diffEnv(localText, remoteText);

  console.log('Added:', diff.added.length ? diff.added.join(', ') : 'none');
  console.log('Removed:', diff.removed.length ? diff.removed.join(', ') : 'none');
  console.log('Changed:', diff.changed.length ? diff.changed.join(', ') : 'none');
}
