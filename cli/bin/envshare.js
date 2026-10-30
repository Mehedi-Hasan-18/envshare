#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from '../src/commands/login.js';
import { initCommand } from '../src/commands/init.js';
import { pushCommand } from '../src/commands/push.js';
import { pullCommand } from '../src/commands/pull.js';
import { diffCommand } from '../src/commands/diff.js';
import { logoutCommand } from '../src/commands/logout.js';

const program = new Command();
program.name('envshare').description('Secure .env sharing with EnvShare');

program
  .command('login')
  .description('Log in with an API token and save config')
  .action(loginCommand);

program
  .command('init')
  .description('Initialize a project in the current folder')
  .action(initCommand);

program
  .command('push')
  .description('Push the current .env file as a new encrypted version')
  .option('-e, --env <name>', 'Environment name', 'development')
  .option('-m, --message <message>', 'Optional push message')
  .action(pushCommand);

program
  .command('pull')
  .description('Pull the latest env version and write it to .env')
  .option('-e, --env <name>', 'Environment name', 'development')
  .action(pullCommand);

program
  .command('diff')
  .description('Compare local .env with the latest remote version')
  .option('-e, --env <name>', 'Environment name', 'development')
  .action(diffCommand);

program
  .command('logout')
  .description('Remove stored local config')
  .action(logoutCommand);

program.parse(process.argv);
