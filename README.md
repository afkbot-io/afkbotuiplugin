# AFKBOT UI Plugin

Unified AFKBOT workspace plugin for automations, Task Flow, subagents, skills, and bootstrap files.

Current release: `0.3.3`

## What is in 0.3.3

- single shell workspace at `/plugins/afkbotui`
- profile-aware sections for `Automations`, `Task Flow`, `Subagents`, `Skills`, and `Bootstrap`
- reactive Task Flow board without full page refreshes
- unified modal-driven CRUD flows across the workspace
- kanban-style Task Flow with inspector, comments, review actions, quick selection, delete actions, and mobile behavior
- profile-local text libraries for subagents, skills, and bootstrap files
- webhook automation inspector with diagnostics, copy actions, and token rotation from the UI
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
