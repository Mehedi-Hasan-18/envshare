import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { writeConfig } from '../config.js';

export async function loginCommand() {
  const rl = readline.createInterface({ input, output });
  const apiUrl = await rl.question('API URL [http://localhost:8000/api]: ');
  const token = await rl.question('API token (starts with es_): ');
  const teamKey = await rl.question('Team key (paste once): ');
  rl.close();

  const config = {
    apiUrl: apiUrl.trim() || 'http://localhost:8000/api',
    apiToken: token.trim(),
    teamKey: teamKey.trim(),
  };

  writeConfig(config);
  console.log('Logged in successfully.');
}
