import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = path.join(os.homedir(), '.envshare');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);
}

export function deleteConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
}

export function getProjectConfig() {
  const localConfigPath = path.resolve(process.cwd(), '.envshare.json');
  if (!fs.existsSync(localConfigPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeProjectConfig(config) {
  const localConfigPath = path.resolve(process.cwd(), '.envshare.json');
  fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2));
}
