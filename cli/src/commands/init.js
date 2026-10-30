import fs from 'node:fs';
import { getProjectConfig, readConfig, writeProjectConfig } from '../config.js';
import { apiRequest } from '../api.js';

export async function initCommand() {
  const config = readConfig();
  if (!config) {
    throw new Error('Not logged in. Run: envshare login');
  }

  const projectConfig = getProjectConfig();
  if (projectConfig) {
    console.log('Project already initialized.');
    return;
  }

  const teams = await apiRequest('/teams');
  if (!teams.length) {
    throw new Error('No teams found. Create a team in the web app first.');
  }

  const teamId = teams[0].id;
  const projects = await apiRequest(`/teams/${teamId}/projects`);
  const projectId = projects[0]?.id;

  if (!projectId) {
    throw new Error('No project found for this team. Create one in the web app first.');
  }

  writeProjectConfig({ teamId, projectId, env: 'development' });
  console.log(`Initialized envshare for team ${teamId} and project ${projectId}.`);
}
