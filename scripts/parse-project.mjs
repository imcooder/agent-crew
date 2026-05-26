#!/usr/bin/env node

/**
 * parse-project.mjs
 * 
 * Parses a project.md file into structured JSON for the orchestrator.
 * 
 * Usage:
 *   node scripts/parse-project.mjs <path-to-project.md>
 * 
 * Output: JSON to stdout
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node parse-project.mjs <path-to-project.md>');
  process.exit(1);
}

const content = readFileSync(resolve(filePath), 'utf-8');

function parseProjectMd(md) {
  const sections = {};
  let currentSection = null;
  let currentContent = [];

  for (const line of md.split('\n')) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = headerMatch[1].toLowerCase().replace(/\s+/g, '_');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  // Extract project title from H1
  const titleMatch = md.match(/^#\s+(?:Project:\s*)?(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Project';

  // Parse roles table
  const roles = parseRolesTable(sections.roles || '');

  // Parse requirements list
  const requirements = parseNumberedList(sections.requirements || '');

  // Parse acceptance criteria
  const acceptanceCriteria = parseChecklist(sections.acceptance_criteria || '');

  // Parse tasks (if provided)
  const tasks = parseTasks(sections.tasks || sections.task_breakdown || '');

  // Parse constraints
  const constraints = parseConstraints(sections.constraints || '');

  return {
    title,
    goal: sections.goal || '',
    roles,
    requirements,
    design: sections.design || '',
    acceptanceCriteria,
    tasks,
    constraints,
    dependencies: sections.dependencies || '',
    notifications: sections.notifications || '',
    raw: sections
  };
}

function parseRolesTable(text) {
  const roles = [];
  const lines = text.split('\n').filter(l => l.includes('|') && !l.match(/^\s*\|?\s*[-:]+/));
  
  // Skip header row
  const dataLines = lines.slice(1);
  
  for (const line of dataLines) {
    const cells = line.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 2) {
      roles.push({
        role: cells[0] || '',
        id: cells[1] || cells[0]?.toLowerCase().replace(/\s+/g, '-') || '',
        responsibilities: cells[2] || '',
        capabilities: cells[3] || ''
      });
    }
  }
  return roles;
}

function parseNumberedList(text) {
  const items = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  return items;
}

function parseChecklist(text) {
  const items = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^-\s+\[[ x]\]\s+(.+)/i);
    if (match) {
      items.push({
        criterion: match[1].trim(),
        done: line.includes('[x]') || line.includes('[X]')
      });
    }
  }
  return items;
}

function parseTasks(text) {
  if (!text) return [];
  const tasks = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\d+\.\s+\[(\w+)\]\s+(.+)/);
    if (match) {
      tasks.push({
        roleId: match[1].trim(),
        description: match[2].trim()
      });
    }
  }
  return tasks;
}

function parseConstraints(text) {
  const constraints = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^-\s+(\w[\w\s]*?):\s*(.+)/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      constraints[key] = match[2].trim();
    }
  }
  return constraints;
}

// Run
const result = parseProjectMd(content);
console.log(JSON.stringify(result, null, 2));
