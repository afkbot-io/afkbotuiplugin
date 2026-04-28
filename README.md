# AFKBOT UI Plugin

Unified AFKBOT workspace plugin for automations, Task Flow, and profile-local text libraries.

Current release: `0.5.3`

## Overview

AFKBOT UI is an embedded AFKBOT plugin mounted at `/plugins/afkbotui`. It ships a prebuilt React workspace shell backed by the plugin API at `/v1/plugins/afkbotui`.

Current frontend/runtime contract:

- React 19 + TypeScript + Vite for development
- LESS styling with the `afkbotweb`-aligned visual system and self-hosted fonts
- production payload served from `web/dist`
- operator auth handled by AFKBOT core via `/v1/auth/session`
- webhook endpoint reveal handled through a dedicated operator-only API route

The shipped bundle no longer includes the old pre-React `web/dist/assets/core/*` or `web/dist/assets/features/*` payloads.

## What Is In 0.5.3

- single-shell workspace with `Automations`, `Task Flow`, `Subagents`, `Skills`, and `Bootstrap`
- React-native route surfaces for every section, with shared loaders, dialogs, async buttons, and responsive layout primitives
- self-hosted `Inter`, `Unbounded`, and `JetBrains Mono` assets so install and release builds do not depend on Google Fonts
- `afkbotweb`-aligned theme: tighter shell geometry, updated buttons/selects, branded loaders, compact mobile nav, and tablet-safe layouts
- operator auth integration with login redirect, session badge, logout, and fail-closed handling when AFKBOT auth endpoints are missing
- masked webhook metadata in ordinary automation list/detail payloads, with reveal only through `/automations/{id}/webhook-endpoint`
- automation inspector with cron/webhook diagnostics, copy actions, graph preview, runtime path, and webhook URL rotation
- Task Flow board with Plan-first status ordering, flow management modal, per-flow filtering, inspector, review flows, comments, dependencies, runs, session activity, and live chat-style activity modal
- Task Flow owner controls and task cards recognize subagent owners from `owner_ref` values like `default:researcher`
- Task Flow create/edit routes submit canonical `description` payloads while still reading legacy `prompt` tasks during mixed-version upgrades
- profile-local CRUD surfaces for subagents, skills, and bootstrap files
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
- flow library modal with search, add, delete, and quick selection
- task inspector with create/edit/delete, comments, dependencies, runs, review actions, and live session activity
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

- AFKBOT UI `0.5.3`
- AFKBOT `>=1.4.2,<2.0.0`
- current AFKBOT `1.x` auth/chat runtime surface, including:
  - `/v1/auth/session`
  - `/v1/auth/logout`
  - operator-side automation webhook reveal support

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
- `GET /v1/plugins/afkbotui/task-flow/sessions/activity`
- `POST /v1/plugins/afkbotui/task-flow/tasks`
- `GET /v1/plugins/afkbotui/task-flow/tasks/{task_id}`
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
