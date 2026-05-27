---
name: agent-crew
version: 0.3.0
description: >
  Autonomous multi-agent team orchestration framework. Reads a project.md
  file that defines roles, requirements, design, and acceptance criteria,
  then spawns sub-agents for each role, manages task flow via filesystem
  state, handles completion callbacks, retries failures, and guarantees the
  project runs to completion. Use when: (1) starting a multi-step project
  that needs multiple roles (developer, tester, reviewer), (2) user says
  "start project" or "run project.md", (3) long-running work that must not
  stall, (4) multi-agent coordination with task handoff and validation.
  NOT for: simple one-off tasks, single-file edits, or questions.
---

# Agent Crew

## Changelog

| Version | Date | Changes |
|---------|------|------|
| 0.3.0 | 2026-05-27 | **Breaking**: Cron IS the orchestrator (no long-lived orchestrator session). Borrowed from Ralph loop: one step per cron cycle, sub-agent output via file + status tags, 10min timeout for dead agents. Eliminates all "session died" failure modes. |
| 0.2.0 | 2026-05-27 | Added blocked state, prerequisites, auto-resume on condition met, watchdog condition probing, status.mjs script, removed Python scripts |
| 0.1.0 | 2026-05-26 | Initial release: project lifecycle (start/resume/pause/cancel/status), filesystem-based state, heartbeat tracking, global logging, role prompts with output protocol, watchdog/resume protocols, init-project script |

Autonomous multi-agent team framework. One `project.md` in, completed project out.

## How It Works

```
project.md -> Parse -> State File -> Spawn Roles -> Validate -> Next Task -> Done
                           ^                                        |
                           +---------- Watchdog (2min) ------------+
```

## Commands

This skill responds to the following user intents:

### Start (create)

Trigger: user says "start project", "run project.md", or provides a project file path.

Action: Parse the project file, create work directory with state.json, set up watchdog cron, begin spawning roles.

### Resume

Trigger: user says "resume project", "continue project", or the watchdog cron fires and detects an active project.

Action: Read state.json from work directory, determine current step, pick up where it left off. Handles:
- Agent session restart after crash
- Manual resume after user paused
- Watchdog-triggered recovery from stall

### Cancel

Trigger: user says "cancel project", "stop project", or "abort <projectId>".

Action:
1. Kill all running sub-agent sessions for this project
2. Set state.json status to "cancelled"
3. Remove watchdog cron job
4. Notify user with summary of completed vs pending tasks

### Pause

Trigger: user says "pause project" or "hold project".

Action:
1. Let current sub-agent finish (do not kill mid-work)
2. Set state.json status to "paused"
3. Watchdog switches to monitor-only mode (no new spawns)
4. Notify user

### Status

Trigger: user says "project status", "how is the project going".

Action: Read state.json, report progress, active role, failures, elapsed time.

## Work Directory Structure

For each project file `project/<name>.md`, a work directory is created at `project/<name>/`:

```
project/
  my-feature.md                     # project definition (user writes this)
  my-feature/                       # work directory (auto-created)
    state.json                      # state machine (single source of truth)
    tasks/
      001-design-api/
        prompt.md                   # what was sent to sub-agent
        output.md                   # sub-agent result
        validation.md               # PASS/FAIL with reason
      002-implement-core/
        prompt.md
        output.md
        validation.md
    checkpoints/
      after-001.md                  # context summary for next role
      after-002.md
    log.md                          # append-only event log
```

## State File (state.json)

The state file is the single source of truth. Any agent (orchestrator, watchdog, sub-agent) can read it. Only orchestrator writes to it.

```json
{
  "projectId": "my-feature",
  "status": "running",
  "startedAt": "2026-01-01T10:00:00Z",
  "lastHeartbeat": "2026-01-01T10:12:00Z",
  "heartbeats": [
    {"agent": "orchestrator", "at": "2026-01-01T10:12:00Z", "action": "spawned task 003"},
    {"agent": "watchdog", "at": "2026-01-01T10:10:00Z", "action": "health check: ok"},
    {"agent": "dev-002", "at": "2026-01-01T10:08:00Z", "action": "task completed"}
  ],
  "currentTaskIndex": 2,
  "tasks": [
    {
      "id": "001",
      "name": "Design API interface",
      "role": "dev",
      "status": "passed",
      "startedAt": "2026-01-01T10:00:00Z",
      "completedAt": "2026-01-01T10:05:00Z",
      "retryCount": 0
    },
    {
      "id": "002",
      "name": "Implement core module",
      "role": "dev",
      "status": "passed",
      "startedAt": "2026-01-01T10:05:00Z",
      "completedAt": "2026-01-01T10:08:00Z",
      "retryCount": 0
    },
    {
      "id": "003",
      "name": "Test core functionality",
      "role": "test",
      "status": "running",
      "startedAt": "2026-01-01T10:08:00Z",
      "retryCount": 0
    }
  ]
}
```

### Heartbeat Records

The `heartbeats` array is append-only (keep last 50 entries). Any agent interacting with the project appends a heartbeat:

- **orchestrator**: when it spawns a task, validates output, advances state
- **watchdog**: every time it checks health (every 2min)
- **sub-agent**: when it starts work, hits milestones, completes

`lastHeartbeat` is the timestamp of the most recent entry. External systems can monitor this field to detect if the entire project has gone silent (no heartbeat for >10min = something is wrong).

## Completion Criteria

### Project Statuses

```
created -> running -> completed
                  \-> failed
                  \-> cancelled
                  \-> paused -> running (resume)
                  \-> blocked -> running (condition met)
```

### When a Task is "blocked"

A task is blocked when:
1. The sub-agent reports `STATUS: BLOCKED` in its output
2. A prerequisite check fails before task execution
3. An external dependency is unavailable (build not done, service down, etc.)

Blocked is NOT a failure. It does not consume retry attempts.

The sub-agent output format for blocked:
```
STATUS: BLOCKED
REASON: <human-readable explanation>
RETRY_CONDITION: <machine-checkable condition>
```

Supported RETRY_CONDITION formats:
- `file_exists:<path>` - Check if a file/directory exists
- `command:<shell command>` - Run command, unblocked if exit code = 0
- `manual` - Only user can unblock (via "resume project")

state.json for a blocked task:
```json
{
  "id": "001",
  "status": "blocked",
  "blockedReason": "Build not complete",
  "retryCondition": "file_exists:/path/to/expected/output",
  "blockedAt": "2026-05-26T16:00:00Z",
  "retryCount": 0
}
```

Watchdog behavior on blocked tasks:
- Every 2 minutes: evaluate RETRY_CONDITION
- If condition met: set task status to "pending", log unblock, trigger orchestrator resume
- If condition not met: log heartbeat, continue waiting
- If blocked > 30 minutes: notify user (but keep checking)

### When a Task is "passed"

ALL of the following must be true:
1. Sub-agent produced `tasks/<id>/output.md` with non-empty content
2. Orchestrator evaluated output against acceptance criteria for this task
3. Every criterion relevant to this task is marked as met
4. Evaluation result written to `tasks/<id>/validation.md`
5. validation.md contains explicit "PASSED" verdict

### When a Task is "failed"

ANY of the following:
1. Sub-agent produced no output (timeout or crash)
2. Sub-agent output does not meet one or more criteria
3. validation.md contains "FAILED" verdict with reasons

Failed tasks retry indefinitely. On retry, the prompt includes previous failure reasons. There is no retry limit.

### When a Project is "completed"

ALL of the following must be true:
1. Every task in state.json has status = "passed"
2. Every task has a valid validation.md with "PASSED" verdict
3. All acceptance criteria from project.md are covered by at least one task validation
4. State is set to "completed" with completedAt timestamp

### When a Project is "failed"

ANY of the following:
1. A task is manually cancelled by the user
2. A blocking dependency cannot be resolved

Failed projects notify the user with full context: what succeeded, what failed, why.

## Constraints and Limitations

### Must Reuse (existing OpenClaw mechanisms)

- `sessions_spawn` - for creating sub-agent sessions
- `sessions_send` - for cross-session communication
- `cron` - for watchdog periodic checks
- `exec` - for running scripts
- File system `read`/`write` - for all state persistence

### Must Not

- Require external services, databases, or APIs beyond OpenClaw
- Require new OpenClaw features not yet available
- Poll in tight loops (use cron intervals, not while-loops)
- Store state only in session memory (sessions are ephemeral)
- Hardcode to a specific LLM model

### Design Rules

- All state persisted to filesystem (state.json is the truth)
- Each sub-agent session is stateless (all context passed via prompt + files)
- Sub-agents write output to agreed-upon file paths
- Orchestrator is the only writer to state.json
- Work directory is self-contained (can be copied, inspected, or resumed elsewhere)

### Known Limitations

- Validation is LLM-based judgment, not deterministic test execution
- Cannot guarantee sub-agent perfectly follows its prompt
- Watchdog granularity is cron interval (minimum 2 minutes)
- Context window limits apply: orchestrator reads only current task context, not full history
- Concurrent sub-agents for independent tasks not yet supported (sequential only)

## Core Workflow

### Design Principle: Cron IS the Orchestrator

Borrowed from Ralph loop: the outer loop must be a process that never dies.
In OpenClaw/channel mode, that process is a **cron job**. Each cron invocation
is a fresh stateless session that reads state.json, takes exactly one step,
and exits. There is NO long-lived orchestrator session.

The "orchestrator" is an emergent pattern from repeated cron invocations.

### 1. Initialize (one-time, on "start project")

1. Run `scripts/parse-project.mjs` to extract structured data
2. Create work directory `project/<name>/` with:
   - `state.json` (all tasks as "pending")
   - `tasks/` directory structure
   - `checkpoints/` directory
   - `log.md` (first entry: "Project started")
3. Set up the orchestrator cron:
```
openclaw cron add \
  --name "crew-{projectId}" \
  --every "2m" \
  --session isolated \
  --task "<orchestrator prompt from watchdog-protocol.md>"
```
4. Notify user: project started, cron active

### 2. Cron Cycle (every 2 minutes, autonomous)

Each cron invocation performs exactly ONE step:

```
Read state.json
    |
    +-- completed/cancelled → remove cron, exit
    +-- paused → heartbeat, exit
    +-- running/blocked → find current task:
         |
         +-- task.status = "passed" → advance to next, exit
         +-- task.status = "pending" → spawn sub-agent, set running, exit
         +-- task.status = "running":
         |     +-- output.md exists → validate (see step 3)
         |     +-- no output, started < 10min → wait, heartbeat, exit
         |     +-- no output, started > 10min → assume dead, set pending, exit
         +-- task.status = "blocked":
         |     +-- evaluate retryCondition
         |     +-- condition met → set pending, exit
         |     +-- not met, > 30min → notify user (once), exit
         |     +-- not met, < 30min → heartbeat, exit
         +-- task.status = "failed":
               +-- increment retryCount, set pending
               +-- every 5th: notify user (FYI only)
               +-- exit
    +-- all tasks passed → set completed, remove cron, notify user
```

Key rule: **one step per cycle, then exit.** This prevents context overflow.

### 3. Validation (within a cron cycle)

When `tasks/<id>/output.md` exists:

1. Read output content
2. Check for status tags:
   - `STATUS: COMPLETE` → task passed
   - `STATUS: BLOCKED` + `REASON:` → task blocked
   - `STATUS: FAILED` + `REASON:` → task failed
   - No tag but substantive content → evaluate against acceptance criteria
   - Empty/garbage → task failed
3. Write result to `tasks/<id>/validation.md`
4. Update state.json
5. Write checkpoint to `checkpoints/after-<id>.md` (if passed)

### 4. Sub-Agent Spawning (within a cron cycle)

When spawning a sub-agent for a task:

1. Build prompt from `references/role-prompts.md` template
2. Include last checkpoint as context
3. If retry: include previous failure reasons
4. Write full prompt to `tasks/<id>/prompt.md`
5. Instruct sub-agent to write output to `tasks/<id>/output.md`
6. Spawn via `sessions_spawn` (mode: run, isolated)
7. Set task status = "running", record startedAt
8. Append heartbeat, exit

The cron does NOT wait for the sub-agent. It exits immediately after spawn.
Next cron cycle (2min later) will check if output.md appeared.

### 5. Sub-Agent Output Protocol

Sub-agents MUST write to `tasks/<id>/output.md` with this structure:

```
STATUS: COMPLETE
SUMMARY: <brief description of what was done>

## Details
<full output, code changes, test results, etc.>
```

Or for blocked:
```
STATUS: BLOCKED
REASON: <human-readable explanation>
RETRY_CONDITION: <file_exists:/path | command:cmd | manual>
```

Or for failed:
```
STATUS: FAILED
REASON: <what went wrong>

## Error Details
<stack traces, logs, etc.>
```

If sub-agent crashes without writing output.md, the next cron cycle
detects "running > 10min, no output" and resets to pending for retry.

### 6. Project Completion

When all tasks have status = "passed":
1. Set state.json status = "completed", write completedAt
2. Remove cron job
3. Write final entry to log.md
4. Notify user with summary

### Why This Never Stops

| Failure Mode | What Happens |
|---|---|
| Sub-agent crashes | No output.md → cron retries in 2min |
| Sub-agent loops forever | >10min timeout → cron kills and retries |
| Main session dies | Irrelevant — cron doesn't need it |
| OpenClaw restarts | Cron persists across restarts |
| Context overflow | Impossible — each cron cycle is fresh |
| Network timeout | Sub-agent fails → retry next cycle |

## Logging

All agents write to a single `log.md` file in the work directory. This is the global timeline of everything that happened.

### Log Format

```
[2026-01-01T10:00:00Z] [orchestrator] [info] Project started: my-feature
[2026-01-01T10:00:01Z] [orchestrator] [info] Spawned task 001 (dev): Design API interface
[2026-01-01T10:05:00Z] [dev-001] [info] Task completed: output written to tasks/001/output.md
[2026-01-01T10:05:01Z] [orchestrator] [info] Validation: task 001 PASSED
[2026-01-01T10:05:02Z] [orchestrator] [info] Spawned task 002 (dev): Implement core module
[2026-01-01T10:06:00Z] [watchdog] [info] Health check: ok (last activity 1min ago)
[2026-01-01T10:10:00Z] [dev-002] [error] Build failed: cannot find module 'foo'
[2026-01-01T10:10:01Z] [orchestrator] [warn] Task 002 failed, retrying
[2026-01-01T10:10:02Z] [orchestrator] [info] Re-spawned task 002 with error context
```

### Log Levels

| Level | When to Use |
|-------|-------------|
| info | Normal operations: spawn, complete, validate, advance |
| warn | Recoverable issues: task failed (will retry), slow response |
| error | Failures: build error, test failure, sub-agent crash |
| fatal | Unrecoverable: all retries exhausted, project cannot continue |

### Who Logs What

| Agent | Logs |
|-------|------|
| orchestrator | spawn, validate, advance, retry, pause, resume, complete |
| watchdog | health checks, stall detection, recovery triggers |
| sub-agent (dev-XXX) | work started, milestones, completion, errors encountered |
| sub-agent (test-XXX) | test started, each criterion checked, pass/fail results |
| sub-agent (review-XXX) | review started, issues found, approval/rejection |

### Script Usage

```bash
# Node.js
node scripts/log.mjs <log-file-path> <agent> <level> <message>
```

Sub-agents should be instructed in their prompt to call the log script at key moments (start, milestone, error, completion).

## Scripts

- `scripts/init-project.mjs` - Initialize work directory and state.json from project.md
- `scripts/parse-project.mjs` - Parse project.md into structured JSON
- `scripts/status.mjs` - Read and display project status, progress, and health
- `scripts/check-flow-health.mjs` - Check state.json health (used by watchdog)
- `scripts/log.mjs` - Append structured log entry

## References

- `references/project-format.md` - Project file specification and template
- `references/role-prompts.md` - Role prompt templates with output and logging protocol
- `references/resume-protocol.md` - Exact steps for resuming a stalled/paused project
- `references/watchdog-protocol.md` - Watchdog cron behavior and stall recovery
