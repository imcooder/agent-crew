# Watchdog Protocol

Exact behavior for the watchdog cron job.

## Setup

On project start, the orchestrator creates a cron job:

```
openclaw cron add \
  --name "crew-watchdog-{projectId}" \
  --every "2m" \
  --session isolated \
  --task "<watchdog prompt below>"
```

## Watchdog Prompt

The cron task prompt should be:

```
You are a project watchdog. Your only job is to check project health and recover stalls.

## Instructions

1. Read the state file at: {work_dir}/state.json
2. Check the project status:
   - If "completed" or "cancelled": remove this cron job and exit
   - If "paused": append watchdog heartbeat to state.json and exit
   - If "running": continue to step 3
3. Check lastHeartbeat timestamp:
   - If less than 5 minutes old: project is alive. Append watchdog heartbeat. Exit.
   - If more than 5 minutes old: project may be stalled. Continue to step 4.
4. Stall detected. Take action:
   - Append heartbeat: {"agent": "watchdog", "at": "<now>", "action": "stall detected, triggering resume"}
   - Update lastHeartbeat to now
   - Write state.json
   - Append to log.md: [warn] Watchdog detected stall, triggering resume
   - Send resume signal: sessions_send to orchestrator session or spawn a new orchestrator session with resume task

## Important Rules
- Do NOT modify task statuses. Only orchestrator does that.
- Do NOT spawn sub-agents. Only orchestrator does that.
- You MAY update: lastHeartbeat, heartbeats array
- You MAY trigger: resume of orchestrator
- Keep heartbeats array to last 50 entries (trim oldest if over)
- If state.json does not exist, log error and exit (do not create it)
```

## Self-Cleanup

The watchdog removes itself when:
- Project status is "completed"
- Project status is "cancelled"
- Project status is "failed" (all retries exhausted)

The watchdog stays alive (monitor-only) when:
- Project status is "paused" (just records heartbeats, no recovery action)

## Stall Threshold

Default: 5 minutes without any heartbeat update.

This accounts for:
- Normal task execution (most tasks complete in < 5min of silence)
- Network delays
- Cron interval (2min) + processing time

If a task legitimately runs longer than 5 minutes without logging, it should be instructed to write periodic heartbeats (e.g., "still compiling..." every 2 minutes).

## Blocked Task Handling

When the watchdog finds tasks with status = "blocked":

1. Read the task's `retryCondition` field
2. Evaluate the condition:
   - `file_exists:<path>` - Run `Test-Path` or equivalent
   - `command:<cmd>` - Execute and check exit code
   - `manual` - Skip (only user can unblock)
3. If condition is NOW met:
   - Set task status back to "pending"
   - Log: `[info] Task {id} unblocked: condition met`
   - Trigger orchestrator resume
4. If condition still not met:
   - Log: `[info] Task {id} still blocked: {reason}`
   - If blocked > 30 minutes: notify user once
   - Continue checking next cycle

This means: even if the entire project is "blocked", the cron keeps running and actively probing. The moment the external condition is satisfied (e.g., build finishes), the project resumes automatically within 2 minutes.
