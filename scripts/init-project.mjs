#!/usr/bin/env node

/**
 * init-project.mjs
 *
 * Initialize the work directory for a project.
 * Parses the project.md, creates directory structure, and writes initial state.json.
 *
 * Usage:
 *   node scripts/init-project.mjs <path-to-project.md>
 *
 * Output: Creates work directory alongside the project.md file.
 * Prints the path to state.json on success.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node init-project.mjs <path-to-project.md>');
  process.exit(1);
}

const fullPath = resolve(filePath);
if (!existsSync(fullPath)) {
  console.error(`File not found: ${fullPath}`);
  process.exit(1);
}

// Derive work directory name from filename (strip .md)
const projectDir = dirname(fullPath);
const projectName = basename(fullPath, '.md');
const workDir = resolve(projectDir, projectName);

if (existsSync(resolve(workDir, 'state.json'))) {
  console.error(`Project already initialized: ${workDir}/state.json exists`);
  console.error('Use resume command to continue, or delete the work directory to start fresh.');
  process.exit(1);
}

// Parse project.md to extract tasks
const content = readFileSync(fullPath, 'utf-8');
const tasks = extractTasks(content);

// Create directory structure
mkdirSync(resolve(workDir, 'tasks'), { recursive: true });
mkdirSync(resolve(workDir, 'checkpoints'), { recursive: true });

// Create task subdirectories
for (const task of tasks) {
  mkdirSync(resolve(workDir, 'tasks', task.id), { recursive: true });
}

// Write initial state.json
const state = {
  projectId: projectName,
  projectFile: basename(fullPath),
  status: 'created',
  startedAt: new Date().toISOString(),
  lastHeartbeat: new Date().toISOString(),
  heartbeats: [
    { agent: 'orchestrator', at: new Date().toISOString(), action: 'project initialized' }
  ],
  currentTaskIndex: 0,
  tasks: tasks
};

writeFileSync(resolve(workDir, 'state.json'), JSON.stringify(state, null, 2) + '\n', 'utf-8');

// Write initial log entry
const logEntry = `[${new Date().toISOString()}] [orchestrator] [info] Project initialized: ${projectName}\n`;
writeFileSync(resolve(workDir, 'log.md'), logEntry, 'utf-8');

console.log(JSON.stringify({ workDir, stateFile: resolve(workDir, 'state.json'), taskCount: tasks.length }, null, 2));


function extractTasks(md) {
  // Try explicit task list first: "1. [role] description"
  const taskLines = [];
  const taskSection = md.match(/## Tasks\n([\s\S]*?)(?=\n## |\n$|$)/);

  if (taskSection) {
    for (const line of taskSection[1].split('\n')) {
      const match = line.match(/^\d+\.\s+\[(\w+)\]\s+(.+)/);
      if (match) {
        taskLines.push({ role: match[1].trim(), name: match[2].trim() });
      }
    }
  }

  // If no explicit tasks, derive from requirements
  if (taskLines.length === 0) {
    const reqSection = md.match(/## Requirements\n([\s\S]*?)(?=\n## |\n$|$)/);
    if (reqSection) {
      for (const line of reqSection[1].split('\n')) {
        const match = line.match(/^\d+\.\s+(.+)/);
        if (match) {
          taskLines.push({ role: 'dev', name: match[1].trim() });
        }
      }
    }
  }

  // Format with zero-padded IDs
  return taskLines.map((t, i) => ({
    id: String(i + 1).padStart(3, '0'),
    name: t.name,
    role: t.role,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    retryCount: 0
  }));
}
