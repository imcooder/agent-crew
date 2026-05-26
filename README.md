# agent-crew

An autonomous multi-agent team orchestration skill for [OpenClaw](https://openclaw.ai).

Define your project in a markdown file. The agent team handles the rest.

## Install

```bash
openclaw skills install git:imcooder/agent-crew
```

## Usage

1. Create a `project/` directory in your repository
2. Add a `.md` file for each sub-project
3. Tell your agent: "Start project/my-feature.md"

```
your-repo/
  src/
  package.json
  project/
    feature-a.md
    feature-b.md
```

## Project File Specification

Each project file requires the following sections:

### Goal (required)

One-line description of what this project achieves.

```markdown
## Goal
Add user authentication module
```

### Roles (required)

Markdown table defining participants. Each role needs an ID and responsibilities.

| Column | Required | Description |
|--------|----------|-------------|
| Role | yes | Human-readable role name |
| ID | yes | Short identifier used in task assignment |
| Responsibilities | yes | What this role does |
| Capabilities | no | What tools/permissions this role has |

```markdown
## Roles
| Role | ID | Responsibilities |
|------|-----|-----------------|
| Developer | dev | Write production code, fix bugs |
| Tester | test | Validate features through UI |
| Reviewer | review | Code review, architecture check |
```

### Requirements (required)

Numbered list of what must be built or achieved.

```markdown
## Requirements
1. Connect to SSH server with password or private key
2. Browse remote file list with name, size, modified time
3. Upload and download files
4. Create and delete directories
```

### Design (required)

Technical approach. The more specific, the better agents perform.

```markdown
## Design
- AuthService class manages login/logout lifecycle
- JWT tokens stored in secure storage
- React components: FileExplorer, FileItem, TransferDialog
- State management: zustand
- Error handling: retry 3x with exponential backoff
```

### Acceptance Criteria (required)

Checkbox list defining "done". Each item must be independently testable.

```markdown
## Acceptance Criteria
- [ ] Connect via password authentication
- [ ] Connect via private key authentication
- [ ] Display file list with name, size, date
- [ ] Upload a file and verify on server
- [ ] Download a file and verify locally
- [ ] Create and delete directories
```

### Constraints (required)

Project-specific context and rules as key-value pairs.

```markdown
## Constraints
- Path: ./src
- Branch: feature/auth
- Language: TypeScript
- Style: Follow existing project conventions
- Testing: All tests must use UI operations
```

### Tasks (optional)

Explicit task ordering. Format: `[role-id] description`. If omitted, tasks are derived automatically from Requirements and Design.

```markdown
## Tasks
1. [dev] Design auth service interface and types
2. [dev] Implement connection manager
3. [test] Verify connection with both auth methods
4. [dev] Implement file operations
5. [test] Verify file operations via UI
6. [review] Final code review
```

### Dependencies (optional)

Task dependency rules. If omitted, tasks run sequentially.

```markdown
## Dependencies
- Task 3 depends on Task 2
- Task 5 depends on Task 4
- Task 6 depends on all previous
```

### Notifications (optional)

When and how to notify the user.

```markdown
## Notifications
- On completion: notify via current channel
- On block: notify immediately
- Progress: every 30 minutes
```

## Complete Example

```markdown
# Project: Dark Mode

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
- Language: TypeScript

## Tasks
1. [dev] Implement CSS variable theming and toggle component
2. [test] Verify toggle, persistence, and full-page coverage
```

## License

MIT
