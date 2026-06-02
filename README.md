# AFKBOT UI Plugin

Unified AFKBOT workspace plugin for automations, Task Flow, and profile-local text libraries.

Current release: `1.0.10`

## Overview

AFKBOT UI is an embedded AFKBOT plugin mounted at `/plugins/afkbotui`. It ships a prebuilt React workspace shell backed by the plugin API at `/v1/plugins/afkbotui`.

Current frontend/runtime contract:

- React 19 + TypeScript + Vite for development
- LESS styling with the `afkbotweb`-aligned visual system and self-hosted fonts
- production payload served from `web/dist`
- operator auth handled by AFKBOT core via `/v1/auth/session`
- webhook endpoint reveal handled through a dedicated operator-only API route

The shipped bundle no longer includes the old pre-React `web/dist/assets/core/*` or `web/dist/assets/features/*` payloads.

## What Is In 1.0.10

- single-shell workspace with `Automations`, `Task Flow`, `Docs`, `Subagents`, `Skills`, and `Bootstrap`
- React-native route surfaces for every section, with shared loaders, dialogs, async buttons, and responsive layout primitives
- self-hosted `Inter`, `Unbounded`, and `JetBrains Mono` assets so install and release builds do not depend on Google Fonts
- `afkbotweb`-aligned theme: tighter shell geometry, updated buttons/selects, branded loaders, compact mobile nav, and tablet-safe layouts
- operator auth integration with login redirect, session badge, logout, and fail-closed handling when AFKBOT auth endpoints are missing
- masked webhook metadata in ordinary automation list/detail payloads, with reveal only through `/automations/{id}/webhook-endpoint`
- automation inspector with cron/webhook diagnostics, copy actions, graph preview, runtime path, and webhook URL rotation
- Task Flow board with Plan-first status ordering, flow management modal, flow rename/edit/delete, per-flow filtering, stable silent polling, inspector, review flows, comments, dependencies, runs, session activity, local inspector section navigation, and live chat-style activity modal
- Task Flow Employee Feed, context bundle, and flow/task document controls expose employee assignments, wake signals, plans, specs, handoffs, and confirmed revisions directly in the board and flow library
- Task Flow employees are profile-local workforce descriptors; profile is the organization boundary, flow is the project, and owner/reviewer/actor controls use canonical `employee` principals
- Task Flow employee settings and org chart views show managers, direct reports, delegation scope, and runtime-safe owner choices without treating CLI subagents as Task Flow owners
- Employees is a first-class workspace route with a full-width React Flow org chart, tree/compact layout controls, click-through employee details, create/edit/delete modals, drag-from-node creation, delegation, tool policy, and org validation details
- Docs workspace for profile-wide Task Flow document search, scope/status filtering, preview, revision metadata, confirmation, and deletion
- Task cards show human-readable flow title badges instead of raw flow ids
- named Task Flow priority chips replace raw `pNN` scores with low-to-critical labels and direction markers
- inspector discussion and live activity panels keep long content inside their panes, collapse oversized comments, keep the comment composer at the bottom, and let operators jump directly to comments or activity from the task section menu
- Task Flow comments normalize legacy `web-user` human placeholders to the validated local human principal required by AFKBOT core
- moving a Task Flow task out of `Blocked` clears blocker metadata explicitly, while ordinary task edits preserve existing blocker reasons unless the payload changes them
- autonomous manager escalation tasks show source-task badges and Task Flow labels on the board so recovery work is visible without opening every task
- Task Flow comments, task runs, activity, flow documents, and task documents are shown newest-first in the inspector and knowledge panel
- Task Flow create/edit routes submit canonical `description` payloads while still reading legacy `prompt` tasks during mixed-version upgrades
- profile-local CRUD surfaces for subagents, skills, and bootstrap files with richer markdown-derived summaries
- last selected profile is restored when the workspace opens without an explicit profile parameter
- release-contract checks that verify version sync and shipped `web/dist` integrity
- browser smoke coverage for desktop, mobile, auth, mutations, and responsive shell behavior

## Feature Summary

### Automations

- create, edit, delete, filter, and inspect cron and webhook automations
- masked webhook URLs in normal payloads, with reveal fetched only when the inspector opens a webhook automation
- rotate webhook URLs directly from the inspector
- graph preview with nodes, edges, recent runs, and latest trace summary

### Task Flow

- kanban-style board inside the same workspace shell
- Employee Feed modal for the selected Task Flow employee, including assigned tasks, mentions, wake requests, recovery signals, runtime claim rejects, and org chart context
- employee controls for selecting active Task Flow owners/reviewers from profile-local employee descriptors; CLI subagents remain a separate tool capability, not a Task Flow principal
- flow library modal with search, add, rename/edit, delete, quick selection, and project-level flow docs
- task inspector with create/edit/delete, comments, dependencies, runs, review actions, live session activity, context bundle summaries, and flow/task docs
- review actions stay available for review tasks that are already claimed or running by an AI reviewer
- durable flow/task document editing and revision confirmation for plans, specs, roadmaps, decisions, handoffs, QA notes, and agent-readable project knowledge
- polling that pauses around active edits and resumes without full-page reloads

### Profile Libraries

- `Subagents`: profile-local markdown definitions
- `Skills`: profile-local `SKILL.md` assets
- `Bootstrap`: profile-local bootstrap files for the active profile

### Operator Auth

- when AFKBOT core auth is enabled, the workspace redirects to `/auth/login` before UI access
- the shell shows the current signed-in operator and supports logout
- auth state stays in AFKBOT core; plugin config does not store session state or secrets

## Requirements

- AFKBOT UI `1.0.10`
- AFKBOT `>=1.9.15,<2.0.0`
- current AFKBOT `1.x` auth/chat runtime surface, including:
  - `/v1/auth/session`
  - `/v1/auth/logout`
  - operator-side automation webhook reveal support
  - Task Flow document workspace APIs
  - Task Flow flow metadata update APIs
  - Task Flow employee/org-chart support

## Install

Install locally into AFKBOT:

```bash
afk plugin install ../afkbotui
```

Optional plugin config:

```bash
afk plugin config-get afkbotui
afk plugin config-set afkbotui '{"poll_interval_sec":20,"default_profile_id":"default"}'
```

Start the runtime:

```bash
afk start
```

At install/runtime time AFKBOT uses the embedded plugin bundle:

- python entrypoint from `python/`
- static web payload from `web/dist`
- local font assets from the shipped bundle

Operators do not need Node.js during install or runtime.

## Development

Install dependencies:

```bash
npm install
```

Useful commands:

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run test:e2e
npm run release:check
```

Development happens in `web/src`. Production always serves the generated `web/dist` bundle.

Release preparation, `dist` integrity checks, and version-sync rules are documented in [docs/release.md](docs/release.md).

## Mounts

- UI: `/plugins/afkbotui`
- API: `/v1/plugins/afkbotui`

## Current API Surface

### Core

- `GET /v1/plugins/afkbotui/health`
- `GET /v1/plugins/afkbotui/config`
- `GET /v1/plugins/afkbotui/ui-config`
- `PATCH /v1/plugins/afkbotui/config`
- `DELETE /v1/plugins/afkbotui/config`
- `GET /v1/plugins/afkbotui/profiles`

### Automations

- `GET /v1/plugins/afkbotui/automations`
- `GET /v1/plugins/afkbotui/automations/{id}`
- `GET /v1/plugins/afkbotui/automations/{id}/webhook-endpoint`
- `GET /v1/plugins/afkbotui/automations/{id}/graph-preview`
- `POST /v1/plugins/afkbotui/automations`
- `PATCH /v1/plugins/afkbotui/automations/{id}`
- `DELETE /v1/plugins/afkbotui/automations/{id}`

### Task Flow

- `GET /v1/plugins/afkbotui/task-flow/flows`
- `POST /v1/plugins/afkbotui/task-flow/flows`
- `DELETE /v1/plugins/afkbotui/task-flow/flows/{flow_id}`
- `GET /v1/plugins/afkbotui/task-flow/board`
- `GET /v1/plugins/afkbotui/task-flow/feed`
- `GET /v1/plugins/afkbotui/task-flow/documents`
- `GET /v1/plugins/afkbotui/task-flow/employees`
- `GET /v1/plugins/afkbotui/task-flow/org-chart`
- `GET /v1/plugins/afkbotui/task-flow/docs`
- `PUT /v1/plugins/afkbotui/task-flow/docs`
- `POST /v1/plugins/afkbotui/task-flow/docs/{document_id}/confirm`
- `DELETE /v1/plugins/afkbotui/task-flow/docs/{document_id}`
- `GET /v1/plugins/afkbotui/task-flow/sessions/activity`
- `POST /v1/plugins/afkbotui/task-flow/tasks`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}/context`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}/session`
- `PATCH /v1/plugins/afkbotui/task-flow/tasks/{task_id}`
- `DELETE /v1/plugins/afkbotui/task-flow/tasks/{task_id}`
- `POST /v1/plugins/afkbotui/task-flow/tasks/bulk-update`
- `POST /v1/plugins/afkbotui/task-flow/tasks/bulk-delete`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}/comments`
- `POST /v1/plugins/afkbotui/task-flow/tasks/{task_id}/comments`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}/dependencies`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}/events`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}/runs`
- `GET /v1/plugins/afkbotui/task-flow/review`
- `POST /v1/plugins/afkbotui/task-flow/tasks/{task_id}/review/approve`
- `POST /v1/plugins/afkbotui/task-flow/tasks/{task_id}/review/request-changes`

### Profile Libraries

- `GET /v1/plugins/afkbotui/subagents`
- `GET /v1/plugins/afkbotui/subagents/{name}`
- `POST /v1/plugins/afkbotui/subagents`
- `PATCH /v1/plugins/afkbotui/subagents/{name}`
- `DELETE /v1/plugins/afkbotui/subagents/{name}`
- `GET /v1/plugins/afkbotui/skills`
- `GET /v1/plugins/afkbotui/skills/{name}`
- `POST /v1/plugins/afkbotui/skills`
- `PATCH /v1/plugins/afkbotui/skills/{name}`
- `DELETE /v1/plugins/afkbotui/skills/{name}`
- `GET /v1/plugins/afkbotui/bootstrap-files`
- `GET /v1/plugins/afkbotui/bootstrap-files/{file_name}`
- `POST /v1/plugins/afkbotui/bootstrap-files`
- `PATCH /v1/plugins/afkbotui/bootstrap-files/{file_name}`
- `DELETE /v1/plugins/afkbotui/bootstrap-files/{file_name}`

## Notes

- ordinary automation list/detail responses do not expose live webhook bearer endpoints
- the inspector fetches the current webhook URL through the dedicated operator-only reveal route
- older webhook automations may require one explicit rotate before the current URL becomes recoverable
- version history is tracked in `CHANGELOG.md`
