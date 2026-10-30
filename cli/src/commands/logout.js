import { deleteConfig } from '../config.js';

export async function logoutCommand() {
  deleteConfig();
  console.log('Logged out and removed stored config.');
}
