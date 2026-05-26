#!/usr/bin/env node

/**
 * status.mjs
 *
 * Read and display the current status of a project.
 * Used by orchestrator, watchdog, or user to check project health.
 *
 * Usage:
 *   node scripts/status.mjs <path-to-work-dir>
 *
 * Example:
 *   node scripts/status.mjs ./project/my-feature
 *
 * Output: JSON report to stdout with project status, progress, and health info.
 *
 * Exit codes:
 *   0 - Success
 *   1 - State file not found or invalid
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const workDir = process.argv[2];

if (!workDir) {
  console.error('Usage: node status.mjs <path-to-work-dir>');
  process.exit(1);
}

const statePath = resolve(workDir, 'state.json');

if (!existsSync(statePath)) {
  console.error(`State file not found: ${statePath}`);
  process.exit(1);
}

let state;
try {
  state = JSON.parse(readFileSync(statePath, 'utf-8'));
} catch (err) {
  console.error(`Failed to parse state.json: ${err.message}`);
  process.exit(1);
}

const now = Date.now();
const startedAt = state.startedAt ? new Date(state.startedAt).getTime() : now;
const elapsed = now - startedAt;

// Task stats
const tasks = state.tasks || [];
const total = tasks.length;
const passed = tasks.filter(t => t.status === 'passed').length;
const failed = tasks.filter(t => t.status === 'failed' || t.status === 'escalated').length;
const running = tasks.filter(t => t.status === 'running').length;
const pending = tasks.filter(t => t.status === 'pending').length;

// Current task info
const currentTask = tasks[state.currentTaskIndex] || null;

// Health check
const lastHeartbeat = state.lastHeartbeat ? new Date(state.lastHeartbeat).getTime() : 0;
const heartbeatAge = now - lastHeartbeat;
const isHealthy = heartbeatAge < 5 * 60 * 1000; // < 5min

// Recent heartbeats (last 5)
const recentHeartbeats = (state.heartbeats || []).slice(-5);

const report = {
  projectId: state.projectId,
  status: state.status,
  startedAt: state.startedAt,
  elapsed: formatDuration(elapsed),
  progress: {
    total,
    passed,
    failed,
    running,
    pending,
    percentage: total > 0 ? Math.round((passed / total) * 100) : 0
  },
  currentTask: currentTask ? {
    id: currentTask.id,
    name: currentTask.name,
    role: currentTask.role,
    status: currentTask.status,
    retryCount: currentTask.retryCount,
    startedAt: currentTask.startedAt
  } : null,
  health: {
    lastHeartbeat: state.lastHeartbeat,
    heartbeatAge: formatDuration(heartbeatAge),
    isHealthy,
    status: isHealthy ? 'alive' : 'stalled'
  },
  recentActivity: recentHeartbeats.map(h => `[${h.at}] [${h.agent}] ${h.action}`)
};

console.log(JSON.stringify(report, null, 2));


function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
