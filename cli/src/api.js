import fs from 'node:fs';
import { readConfig } from './config.js';

export function getApiBaseUrl() {
  const config = readConfig();
  return config?.apiUrl || process.env.ENVSHARE_API_URL || 'http://localhost:8000/api';
}

export function getAuthHeaders() {
  const config = readConfig();
  const token = config?.apiToken;
  if (!token) {
    throw new Error('Not logged in. Run: envshare login');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const detail = body?.detail || body?.message || text || 'Request failed';
    throw new Error(detail);
  }

  return body;
}

export function ensureEnvFile() {
  const envPath = process.cwd() + '/.env';
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, '');
  }
}
