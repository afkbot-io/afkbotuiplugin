# AFKBOT UI Plugin

Unified AFKBOT workspace plugin for automations, Task Flow, subagents, skills, and bootstrap files.

Current release: `0.4.0`

## What is in 0.4.0

- single shell workspace at `/plugins/afkbotui`
- profile-aware sections for `Automations`, `Task Flow`, `Subagents`, `Skills`, and `Bootstrap`
- core-level operator auth integration through AFKBOT `afk auth ...`, with login redirect, session badge, and logout support
- reactive Task Flow board without full page refreshes
- task inspector session feed with recent chat turns and live activity events for the current agent session
- unified modal-driven CRUD flows across the workspace
- kanban-style Task Flow with inspector, comments, review actions, quick selection, delete actions, and mobile behavior
- profile-local text libraries for subagents, skills, and bootstrap files
- webhook automation inspector with diagnostics, copy actions, and token rotation from the UI
- inspector refresh that preserves scroll position while board and session data continue updating in the background
- UI polish pass for card previews, owner visibility, tighter bulk actions, card-based automation layout, and cleaner spacing below the workspace header

## Highlights

### Automations

- cron and webhook automation management inside the workspace
- create, edit, delete, filter, and inspect flows without leaving the page
- webhook diagnostics include token state, URL, path, execution timestamps, last session, and resume command
- existing webhook tokens can be rotated directly from the UI

### Task Flow

- embedded kanban board in the same shell
- task inspector, comments, dependency and run visibility
- quick visible-selection and bulk delete actions
- responsive column behavior and per-column scrolling

### Profile libraries

- `Subagents`: profile-local markdown files for agent definitions
- `Skills`: profile-local `SKILL.md` assets
- `Bootstrap`: profile-local bootstrap files for the active profile

### Operator auth

- when AFKBOT core auth is enabled, the workspace redirects to `/auth/login` before any UI or plugin API access is granted
- the shell shows the current signed-in operator and provides logout in the top bar
- no auth state is stored in plugin config; enforcement and secrets stay in AFKBOT core

## Install

Install locally into AFKBOT:

```bash
afk plugin install ../afkbotui
```

AFKBOT UI `0.4.0` requires AFKBOT `1.3.0` or newer because plugin UI and plugin API protection now use core `afk auth` support.

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
- `POST /v1/plugins/afkbotui/automations`
- `PATCH /v1/plugins/afkbotui/automations/{id}`
- `DELETE /v1/plugins/afkbotui/automations/{id}`
- `GET /v1/plugins/afkbotui/task-flow/...`
- `GET /v1/plugins/afkbotui/subagents/...`
- `GET /v1/plugins/afkbotui/skills/...`
- `GET /v1/plugins/afkbotui/bootstrap-files/...`

## Notes

- AFKBOT does not return old plaintext webhook tokens from ordinary `list/get` calls after issuance
- the UI can reveal and cache webhook URL and token only when they are freshly created or rotated
- version history is tracked in [CHANGELOG.md](/Users/kikasnikita/PycharmProjects/afkbotui/CHANGELOG.md)
