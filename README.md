# AFKBOT UI Plugin

Unified AFKBOT workspace plugin for automations, Task Flow, subagents, skills, and bootstrap files.

Current release: `0.4.3`

## What is in 0.4.3

- single shell workspace at `/plugins/afkbotui`
- profile-aware sections for `Automations`, `Task Flow`, `Subagents`, `Skills`, and `Bootstrap`
- core-level operator auth integration through AFKBOT `afk auth ...`, with login redirect, session badge, and logout support
- safer automation inspector behavior: webhook URLs are no longer cached in browser storage after issuance
- graph-aware automation inspector with runtime path, lazy graph preview, recent runs, and latest trace summary
- reactive Task Flow board without full page refreshes
- task inspector session feed with recent chat turns and live activity events for the current agent session
- unified modal-driven CRUD flows across the workspace
- kanban-style Task Flow with inspector, comments, review actions, quick selection, delete actions, and mobile behavior
- project-centric Task Flow flow manager with modal search, inline add/delete actions, and richer project metadata
- stronger Task Flow validation for create/edit/settings flows, plus safer filter reset behavior when profiles or projects change
- profile-local text libraries for subagents, skills, and bootstrap files
- webhook automation inspector with diagnostics, copy actions, error emphasis, and URL rotation from the UI
- inspector refresh that preserves scroll position while board and session data continue updating in the background
- UI polish pass for card previews, owner visibility, tighter bulk actions, card-based automation layout, and cleaner spacing below the workspace header

## Highlights

### Automations

- cron and webhook automation management inside the workspace
- create, edit, delete, filter, and inspect flows without leaving the page
- webhook diagnostics include URL, execution timestamps, last session, resume command, and clearer failure state
- graph automations expose a lazy `View Graph` preview so operators can inspect nodes, edges, recent runs, and AI handoff presence without leaving the inspector
- existing webhook tokens can be rotated directly from the UI

### Task Flow

- embedded kanban board in the same shell
- project manager modal with search, ranked matches, metadata visibility, and inline destructive confirmation
- task inspector, comments, dependency and run visibility
- quick visible-selection and bulk delete actions
- responsive column behavior and per-column scrolling
- preserved board, inspector, modal, and project-list scroll state during refreshes

### Profile libraries

- `Subagents`: profile-local markdown files for agent definitions
- `Skills`: profile-local `SKILL.md` assets
- `Bootstrap`: profile-local bootstrap files for the active profile

### Operator auth

- when AFKBOT core auth is enabled, the workspace redirects to `/auth/login` before any UI or plugin API access is granted
- the shell shows the current signed-in operator and provides logout in the top bar
- the plugin now fails closed against missing core auth endpoints instead of silently booting without protection
- no auth state is stored in plugin config; enforcement and secrets stay in AFKBOT core

## Install

Install locally into AFKBOT:

```bash
afk plugin install ../afkbotui
```

AFKBOT UI `0.4.3` requires AFKBOT `1.4.2` or newer because the automation inspector now depends on the core operator-side webhook reveal API for durable webhook URL display.

Optional plugin config:

```bash
afk plugin config-get afkbotui
afk plugin config-set afkbotui '{"poll_interval_sec":20,"default_profile_id":"default"}'
```

Start the runtime:

```bash
afk start
```

## Routes

- API: `/v1/plugins/afkbotui/...`
- UI: `/plugins/afkbotui`

## Current API surface

- `GET /v1/plugins/afkbotui/config`
- `PATCH /v1/plugins/afkbotui/config`
- `DELETE /v1/plugins/afkbotui/config`
- `GET /v1/plugins/afkbotui/profiles`
- `GET /v1/plugins/afkbotui/automations`
- `GET /v1/plugins/afkbotui/automations/{id}`
- `GET /v1/plugins/afkbotui/automations/{id}/webhook-endpoint`
- `GET /v1/plugins/afkbotui/automations/{id}/graph-preview`
- `POST /v1/plugins/afkbotui/automations`
- `PATCH /v1/plugins/afkbotui/automations/{id}`
- `DELETE /v1/plugins/afkbotui/automations/{id}`
- `GET /v1/plugins/afkbotui/task-flow/...`
- `GET /v1/plugins/afkbotui/subagents/...`
- `GET /v1/plugins/afkbotui/skills/...`
- `GET /v1/plugins/afkbotui/bootstrap-files/...`

## Notes

- AFKBOT does not return live webhook bearer endpoints from ordinary `list` or generic detail calls; the inspector uses a dedicated operator-only reveal path for the current endpoint
- older webhook automations that were created before durable reveal storage was configured may still require one explicit rotate before the current URL becomes recoverable
- version history is tracked in `CHANGELOG.md`
