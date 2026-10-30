import fs from 'node:fs';
import { apiRequest, ensureEnvFile } from '../api.js';
import { readConfig, getProjectConfig } from '../config.js';
import { decryptEnv } from '../crypto.js';

export async function pullCommand(options = {}) {
  const config = readConfig();
  if (!config) {
    throw new Error('Not logged in. Run: envshare login');
  }

  const projectConfig = getProjectConfig();
  const envName = options.env || projectConfig?.env || 'development';
  const teamId = projectConfig?.teamId || config.teamId;
  const projectId = projectConfig?.projectId || null;

  if (!teamId || !projectId) {
    throw new Error('Missing team/project context. Run envshare init first.');
  }

  const project = (await apiRequest(`/teams/${teamId}/projects`)).find((item) => item.id === projectId);
  const env = project?.environments?.find((entry) => entry.name === envName);
  if (!env) {
    throw new Error(`Environment ${envName} not found.`);
  }

  const latest = await apiRequest(`/environments/${env.id}/versions/latest`);
  const text = decryptEnv(latest.ciphertext, latest.iv, config.teamKey);

  const envPath = process.cwd() + '/.env';
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    if (existing.trim() && existing !== text) {
      const overwrite = await new Promise((resolve) => {
        process.stdout.write('Overwrite existing .env? [y/N]: ');
        process.stdin.once('data', (chunk) => resolve(String(chunk).trim().toLowerCase() === 'y'));
      });
      if (!overwrite) {
        console.log('Cancelled .env overwrite.');
        return;
      }
    }
  }

  fs.writeFileSync(envPath, text);
  console.log(`Pulled ${envName} env into .env`);
}
