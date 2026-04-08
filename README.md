# AFKBOT UI Plugin

Extensible AFKBOT admin workspace plugin.

Current release: `0.1.0`

What it exposes right now:

- persistent left-rail admin shell
- automation workspace at `/plugins/afkbotui`
- profile switcher
- summary strip for total / active / paused / cron / webhook counts
- dense automations table with search and filters
- right-side drawer for view / create / edit flows
- trigger-specific editor blocks for `cron` and `webhook`
- webhook endpoint diagnostics with masked token display and copy actions

Design goals:

- keep the UI installable without a JS build step
- avoid React lock-in
- keep the shell ready for future sections such as `Subagents`, `MCP`, `AI Settings`, and `Profiles`

Install locally into AFKBOT:

```bash
afk plugin install ../afkbotui
```

Optional plugin config:

```bash
afk plugin config-get afkbotui
afk plugin config-set afkbotui '{"poll_interval_sec":20,"default_profile_id":"default"}'
```

Then start the runtime:

```bash
afk start
```

Plugin routes:

- API: `/v1/plugins/afkbotui/...`
- UI: `/plugins/afkbotui`

Current API surface:

- `GET /v1/plugins/afkbotui/ui-config`
- `GET /v1/plugins/afkbotui/profiles`
- `GET /v1/plugins/afkbotui/automations`
- `GET /v1/plugins/afkbotui/automations/{id}`
- `POST /v1/plugins/afkbotui/automations`
- `PATCH /v1/plugins/afkbotui/automations/{id}`
- `DELETE /v1/plugins/afkbotui/automations/{id}`

Notes:

- webhook tokens are visible in a read-only way and cannot be edited or rotated from this UI
- cron settings remain editable through the right-side form
