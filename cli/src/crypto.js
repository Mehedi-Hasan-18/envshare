import crypto from 'node:crypto';

export function generateTeamKey() {
  return crypto.randomBytes(32).toString('base64');
}

export function encryptEnv(text, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ciphertext, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function decryptEnv(ciphertext, iv, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  const payload = Buffer.from(ciphertext, 'base64');
  const ivBytes = Buffer.from(iv, 'base64');
  const authTag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBytes);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function parseEnv(text) {
  const map = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    map[key] = value;
  }
  return map;
}

export function diffEnv(localText, remoteText) {
  const local = parseEnv(localText);
  const remote = parseEnv(remoteText);
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  const added = [];
  const removed = [];
  const changed = [];

  for (const key of [...keys].sort()) {
    if (!(key in local)) {
      added.push(key);
    } else if (!(key in remote)) {
      removed.push(key);
    } else if (local[key] !== remote[key]) {
      changed.push(key);
    }
  }

  return { added, removed, changed };
}
