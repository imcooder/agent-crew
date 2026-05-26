#!/usr/bin/env node

/**
 * check-flow-health.mjs
 * 
 * Checks the health of active orchestrator TaskFlows.
 * Used by the watchdog cron job to detect stalled tasks.
 * 
 * Usage:
 *   node scripts/check-flow-health.mjs <state-file-path>
 * 
 * Input: Path to the orchestrator state JSON file
 * Output: JSON report to stdout
 * 
 * Exit codes:
 *   0 鈥?All healthy
 *   1 鈥?Has stalled tasks (needs intervention)
 *   2 鈥?Error reading state
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const statePath = process.argv[2];

if (!statePath) {
  console.error('Usage: node check-flow-health.mjs <state-file-path>');
  process.exit(2);
}

const fullPath = resolve(statePath);

if (!existsSync(fullPath)) {
  console.json({ status: 'no_state', message: 'State file not found. No active projects.' });
  process.exit(0);
}

let state;
try {
  state = JSON.parse(readFileSync(fullPath, 'utf-8'));
} catch (err) {
  console.error(`Failed to parse state file: ${err.message}`);
  process.exit(2);
}

const now = Date.now();
const report = {
  timestamp: new Date(now).toISOString(),
  projects: [],
  stalledTasks: [],
  summary: 'healthy'
};

const projects = Array.isArray(state.projects) ? state.projects : [state];

for (const project of projects) {
  const projectReport = {
    id: project.id || project.flowId || 'unknown',
    goal: project.goal || '',
    currentStep: project.currentStep || '',
    status: 'healthy'
  };

  // Check running tasks
  const tasks = project.tasks || project.stateJson?.tasks || [];
  for (const task of tasks) {
    if (task.status === 'running' || task.status === 'in_progress') {
      const lastActivity = task.lastActivityAt || task.startedAt || 0;
      const elapsed = now - lastActivity;

      if (elapsed > STALL_THRESHOLD_MS) {
        projectReport.status = 'stalled';
        report.stalledTasks.push({
          projectId: projectReport.id,
          taskId: task.id || task.name,
          taskName: task.name || task.description || '',
          assignedTo: task.assignedTo || task.roleId || '',
          stalledFor: `${Math.round(elapsed / 60000)}min`,
          lastActivityAt: new Date(lastActivity).toISOString()
        });
      }
    }
  }

  report.projects.push(projectReport);
}

if (report.stalledTasks.length > 0) {
  report.summary = 'stalled';
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} else {
  report.summary = 'healthy';
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
