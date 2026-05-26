# Resume Protocol

Exact steps to resume a project from its persisted state.

## When Resume Triggers

1. User says "resume project" or "continue project"
2. Watchdog detects stall (lastHeartbeat > 5min) and sends resume signal
3. Orchestrator session restarts and finds an active project

## Resume Steps

### Step 1: Locate State

Read `state.json` from the work directory. If the file does not exist, the project was never initialized.

### Step 2: Determine Action Based on Status

| Status | Action |
|--------|--------|
| created | Begin execution (transition to "running", start first task) |
| running | Check current task and continue |
| paused | Transition to "running", continue from currentTaskIndex |
| completed | Nothing to do, report completion |
| cancelled | Nothing to do, report cancellation |
| failed | Nothing to do, report failure (user must manually restart) |

### Step 3: Recover Current Task (when status = "running")

Read `currentTaskIndex` and look at that task's status:

| Task Status | Action |
|-------------|--------|
| pending | Spawn sub-agent for this task |
| running | Check if sub-agent is still alive |
| passed | Should not happen (advance currentTaskIndex first), but if so, advance |
| failed | Check retryCount, re-spawn if < 3 |
| escalated | Notify user, wait for instruction |

### Step 4: Check Running Sub-Agent

If task status is "running", determine if the sub-agent is still working:

1. Check `tasks/{id}/output.md` - if it exists and has content, the agent finished but orchestrator did not process it. Process it now.
2. Check `lastHeartbeat` on the task - if recent (< 5min), agent is likely still working. Wait.
3. If no recent heartbeat and no output, the agent is dead. Re-spawn.

### Step 5: Re-spawn with Context

When re-spawning a task:
1. Read original `tasks/{id}/prompt.md`
2. If retry, append previous failure info
3. Include latest checkpoint for context
4. Spawn new sub-agent
5. Update state.json timestamps
6. Append heartbeat and log entry

### Step 6: Verify Watchdog

Confirm the watchdog cron job is still active. If not, recreate it.

## Resume is Idempotent

Multiple resume calls on the same state produce the same result:
- If a task is already running with a live agent, resume does nothing
- If a task is pending, resume spawns it
- Resume never spawns duplicate agents for the same task
