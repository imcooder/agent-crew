# Project File Format

The `project.md` is the single input to the orchestrator. It defines everything needed to run an autonomous multi-agent team.

## Required Sections

### Goal

A clear, one-line statement of what the project achieves.

```markdown
## Goal
Implement user authentication module
```

### Roles

Define each role that participates. At minimum: id, responsibilities, capabilities.

```markdown
## Roles

| Role | ID | Responsibilities | Capabilities |
|------|-----|-----------------|--------------|
| Developer | dev | Write production code, fix bugs | read/write files, exec commands, git |
| Tester | test | Validate functionality via UI | exec commands, screenshot, UI interaction |
| Reviewer | review | Code review, architecture validation | read files, suggest changes |
```

**Built-in role behaviors:**
- `dev` / `developer` - Spawned as ACP (Codex/Claude Code) for coding tasks
- `test` / `tester` - Spawned as subagent with testing rules (must use UI, no API bypass)
- `review` / `reviewer` - Spawned as subagent, read-only validation
- `pm` - Orchestrator itself acts as PM by default

### Requirements

Numbered list of what must be built/achieved.

```markdown
## Requirements
1. User login with email and password
2. Session token management
3. Auto-refresh expired tokens
4. Logout and session cleanup
```

### Design

Your technical approach. The more specific, the better the agents perform.

```markdown
## Design
- AuthService class manages login/logout lifecycle
- JWT tokens stored in secure storage
- React components: LoginForm, SessionStatus
- State management: zustand
- Error handling: retry 3x with exponential backoff
```

### Acceptance Criteria

Checkboxes that define "done". Each criterion is testable.

```markdown
## Acceptance Criteria
- [ ] Connect to SSH server via password
- [ ] Connect to SSH server via private key
- [ ] Display file list with name, size, and date
- [ ] Upload a file and verify on server
- [ ] Download a file and verify locally
- [ ] Create and delete directories
- [ ] All features tested via UI interaction
```

### Constraints

Project-specific limits and context.

```markdown
## Constraints
- Path: /path/to/your/project
- Branch: feature/auth
- Style: Follow existing code conventions
- Testing: All tests must use UI operations (no direct API calls)
- Language: TypeScript
```

## Optional Sections

### Task Breakdown (optional)

If you want to control task ordering yourself instead of letting the orchestrator derive it:

```markdown
## Tasks
1. [dev] Design auth service interface
2. [dev] Implement login and token management
3. [test] Verify login and session (email + password)
4. [dev] Implement auto-refresh and logout
5. [test] Verify token refresh and logout via UI
6. [review] Final code review
```

Format: `[role-id] Task description`

If omitted, the orchestrator will derive tasks from Requirements + Design.

### Dependencies (optional)

```markdown
## Dependencies
- Task 3 depends on Task 2
- Task 5 depends on Task 4
- Task 6 depends on all previous
```

If omitted, tasks run sequentially by default.

### Notifications (optional)

```markdown
## Notifications
- On completion: notify via current channel
- On block: notify immediately
- Progress: every 30 minutes
```

### Prerequisites (optional)

Conditions that must be true before the project can start. Each prerequisite has a machine-checkable condition.

```markdown
## Prerequisites
- Build completed: file_exists:/path/to/project/dist/main.js
- Node.js available: command:node --version
- Git repo clean: command:git status --porcelain
```

Format: `- <description>: <condition_type>:<condition_value>`

Supported condition types:
- `file_exists:<path>` - File or directory must exist
- `command:<cmd>` - Command must exit with code 0

If prerequisites are not met at start time, the project enters `blocked` status. The watchdog cron checks prerequisites every 2 minutes and auto-starts when all are met.

## Minimal Example

```markdown
# Project: Add Dark Mode

## Goal
Add dark mode toggle to the settings page

## Roles
| Role | ID | Responsibilities |
|------|-----|-----------------|
| Developer | dev | Implement the feature |
| Tester | test | Verify it works |

## Requirements
1. Dark mode toggle in settings
2. Persists across sessions
3. Applies to all pages

## Design
- CSS variables for theming
- localStorage for persistence
- Toggle component in Settings.tsx

## Acceptance Criteria
- [ ] Toggle switches between light and dark
- [ ] Preference persists after refresh
- [ ] All pages respect the theme

## Constraints
- Path: ./my-app
- Branch: feature/dark-mode
```
