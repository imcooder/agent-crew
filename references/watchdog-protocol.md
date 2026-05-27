# Watchdog Protocol

The watchdog cron IS the orchestrator. It does not "notify" anyone — it drives the project forward directly.

## Design Principle (borrowed from Ralph loop)

Ralph loop works because the outer loop is a native process that never dies.
In OpenClaw/Feishu channel mode, the equivalent is a cron job: it fires every N minutes regardless of session state. Each cron invocation is a fresh, stateless session that reads state.json and takes action.

Key insight: **no long-lived orchestrator session exists**. The "orchestrator" is a pattern that emerges from repeated cron invocations, each one reading state, acting, and exiting.

## Setup

On project start:

```
openclaw cron add \
  --name "crew-{projectId}" \
  --every "2m" \
  --session isolated \
  --task "<orchestrator prompt below>"
```

## Sub-Agent Liveness Detection

When a task is "running" but has no output.md yet, the cron must determine
if the sub-agent is still alive:

### Method 1: sessions_list (preferred)
```
Read task.sessionKey from state.json
Call sessions_list or subagents(action=list)
If sessionKey appears in active list → alive, keep waiting
If sessionKey not found or appears in completed/failed → dead
```

### Method 2: Timeout fallback
If no sessionKey was recorded (legacy state), fall back to time-based:
- Started < 10min ago → assume alive
- Started > 10min ago → assume dead

### On dead sub-agent detected:
1. Set task status = "pending"
2. Increment retryCount
3. Clear sessionKey
4. Log: `[warn] Sub-agent for task {id} died without output, retrying`
5. Next cron cycle will spawn a fresh sub-agent

### Why this matters:
Without liveness detection, a crashed sub-agent leaves the task in "running"
forever. The cron would see "running, no output, still within timeout" and
keep waiting indefinitely. Checking session state breaks this deadlock.

## Cron Prompt (the orchestrator)

Each cron invocation acts as a self-contained orchestrator turn:

```
You are the orchestrator for project "{projectId}".
Your job: advance the project by exactly one step, then exit.

Work directory: {work_dir}

## Procedure

1. Read state.json
2. Route based on project status:
   - "completed" or "cancelled" → remove this cron job, exit
   - "paused" → append heartbeat, exit
   - "running" or "blocked" → continue

3. Find the current task (currentTaskIndex):

   a) If status = "passed" → advance currentTaskIndex, find next pending task, go to (c)
   
   b) If status = "running":
      - Check if output file exists: tasks/{id}/output.md
      - If output exists → validate it (see Validation below)
      - If no output and task started > 10min ago → assume sub-agent died, reset to "pending"
      - If no output and task started < 10min ago → still working, append heartbeat, exit
   
   c) If status = "pending" → spawn sub-agent for this task:
      - Build prompt from role-prompts.md template
      - Include last checkpoint as context
      - Write prompt to tasks/{id}/prompt.md
      - Spawn sub-agent: sessions_spawn with task prompt
      - Set task status = "running", record startedAt
      - Append heartbeat, exit
   
   d) If status = "blocked":
      - Evaluate retryCondition
      - If condition met → set to "pending", log unblock
      - If not met and blocked > 30min → notify user (once)
      - Append heartbeat, exit
   
   e) If status = "failed":
      - Increment retryCount (no limit)
      - Set to "pending" for retry
      - Include failure reason in next prompt
      - Every 5th retry: notify user (FYI only, keep going)
      - Append heartbeat, exit

4. If ALL tasks are "passed" → set project status = "completed", notify user, remove cron

## Validation

When a task's output.md exists:
1. Read output.md content
2. Check for promise tags in output:
   - Contains "STATUS: COMPLETE" or "STATUS: PASSED" → mark task as passed
   - Contains "STATUS: BLOCKED" + "REASON:" → mark task as blocked
   - Contains "STATUS: FAILED" + "REASON:" → mark task as failed
   - No status tag but has substantive content → evaluate against acceptance criteria
   - Empty or garbage → mark as failed
3. Write validation result to tasks/{id}/validation.md
4. Update state.json accordingly

## Sub-Agent Output Protocol

Sub-agents MUST include in their output:

```
STATUS: COMPLETE
SUMMARY: <what was done>
```

Or:
```
STATUS: BLOCKED
REASON: <why>
RETRY_CONDITION: <file_exists:/path | command:cmd | manual>
```

Or:
```
STATUS: FAILED
REASON: <what went wrong>
```

If sub-agent crashes without writing output.md, the next cron cycle detects "running > 10min, no output" and retries.

## Heartbeat

Every cron invocation appends to state.json heartbeats:
```json
{"agent": "orchestrator", "at": "<ISO timestamp>", "action": "<what was done this cycle>"}
```

Keep last 50 entries, trim oldest.

## Self-Cleanup

Remove cron when:
- Project status = "completed"
- Project status = "cancelled"

Stay alive when:
- "running" — drive tasks forward
- "paused" — heartbeat only
- "blocked" — keep probing conditions

## Timing

- Cron interval: 2 minutes
- Sub-agent timeout: 10 minutes (if no output after 10min, assume dead)
- Blocked notification: after 30 minutes (once)
- Retry notification: every 5th failure

## Why This Works

1. **No long-lived session** — each cron is independent, reads everything from files
2. **Survives any crash** — even if OpenClaw restarts, cron picks back up
3. **One step per cycle** — prevents context overflow (each invocation is short)
4. **State is truth** — state.json is the only coordination mechanism
5. **Sub-agent independence** — sub-agents write to files, don't need orchestrator alive
```
