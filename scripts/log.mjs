#!/usr/bin/env node

/**
 * log.mjs
 *
 * Append a structured log entry to the project's log file.
 * Used by orchestrator, watchdog, and sub-agents to record events.
 *
 * Usage:
 *   node scripts/log.mjs <log-file-path> <agent> <level> <message>
 *
 * Arguments:
 *   log-file-path  Path to log.md (e.g., project/my-feature/log.md)
 *   agent          Who is logging (orchestrator, watchdog, dev-001, test-003, etc.)
 *   level          Log level: info, warn, error, fatal
 *   message        Free-form message text
 *
 * Example:
 *   node scripts/log.mjs ./project/my-feature/log.md orchestrator info "Spawned task 003 for role test"
 *   node scripts/log.mjs ./project/my-feature/log.md dev-002 error "Build failed: missing dependency xyz"
 *
 * Output format in log.md:
 *   [2026-05-26T15:12:00Z] [orchestrator] [info] Spawned task 003 for role test
 *   [2026-05-26T15:13:00Z] [dev-002] [error] Build failed: missing dependency xyz
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const logPath = process.argv[2];
const agent = process.argv[3];
const level = process.argv[4];
const message = process.argv.slice(5).join(' ');

if (!logPath || !agent || !level || !message) {
  console.error('Usage: node log.mjs <log-file-path> <agent> <level> <message>');
  console.error('Levels: info, warn, error, fatal');
  process.exit(1);
}

const validLevels = ['info', 'warn', 'error', 'fatal'];
if (!validLevels.includes(level)) {
  console.error(`Invalid level: ${level}. Must be one of: ${validLevels.join(', ')}`);
  process.exit(1);
}

const fullPath = resolve(logPath);
const dir = dirname(fullPath);

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const timestamp = new Date().toISOString();
const entry = `[${timestamp}] [${agent}] [${level}] ${message}\n`;

appendFileSync(fullPath, entry, 'utf-8');

// Also print to stdout for capture
process.stdout.write(entry);
