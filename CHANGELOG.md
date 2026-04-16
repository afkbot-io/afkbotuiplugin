# Changelog

All notable changes to this plugin are tracked here.

## 0.4.0 - 2026-04-16

- add the leading human-only `PLAN` column to Task Flow and keep staged work out of the AI claim path
- migrate the UI from `prompt` to `description` so task copy matches the backend contract
- support persisted task attachments from both file picker and clipboard paste flows in the inspector
- keep attachment drafts stable during polling and route attachment sync through the backend attachment API
- require AFKBOT `1.2.0+` for the updated Task Flow contract and release metadata

## 0.3.4 - 2026-04-15

- add a task session feed inside the Task Flow inspector so operators can review recent user and assistant turns for the active task session
- surface live session activity events with incremental polling instead of forcing a full inspector rerender
- preserve inspector and board scroll position during manual and automatic refreshes while a task card stays open
- sync release metadata to version `0.3.4`

## 0.3.3 - 2026-04-15

- polish Task Flow layout so it matches the shared workspace header and toolbar pattern
- widen kanban columns, add drag-to-pan horizontal scrolling, and refine task card states and spacing
- unify fixed card widths across Automations, Subagents, Skills, and Bootstrap
- sync release metadata to version `0.3.3`

## 0.3.2 - 2026-04-15

- remove bulk edit fields from the Task Flow quick-action bar and keep only visible selection, clear, and delete actions
- simplify kanban cards by removing the preview label line, showing the current owner directly on each card, and tightening checkbox sizing
- switch Automations to a denser fixed-width card grid so entries no longer stretch like long planks
- add more breathing room below the top workspace menu and tighten shared spacing around the Task Flow selection bar
- sync release metadata to version `0.3.2`

## 0.3.1 - 2026-04-14

- polish Task Flow card selection so compact checkboxes no longer waste space with a visible `Select` label
- normalize task preview copy to avoid showing literal `\n` sequences in kanban cards and review queue cards
- restore inspector and side-panel scrolling across Task Flow, Automations, and Subagents, and keep close actions visually circular
- improve checkbox row alignment so `Require review` stays inside the grid without breaking the form layout
- shorten webhook secret messaging in Automations and keep profile-missing states for Skills and Bootstrap inside the workspace UI instead of surfacing a raw 404-style failure
- refine shared workspace scroll handling and hide Task Flow column scrollbars for a cleaner board presentation

## 0.3.0 - 2026-04-14

- release the unified AFKBOT workspace shell across Automations, Task Flow, Subagents, Skills, and Bootstrap
- embed Task Flow as a reactive kanban workspace with inspector, comments, bulk actions, and responsive behavior
- add profile-local sections for Subagents, Skills, and Bootstrap files
- unify workspace UI patterns, modals, cards, spacing, and inspector behavior
- improve webhook automation diagnostics with URL, path, token visibility after create or rotate
- add webhook token rotation from the UI and fix webhook edit behavior so it no longer falls into cron validation
- improve browser-side handling of issued webhook secrets so they stay visible in the same browser after reload

## 0.2.0 - 2026-04-08

- introduce the plugin runtime, embedded web shell, profile switcher, and automation management surface
- add cron and webhook automation CRUD with inspector views

## 0.1.0 - 2026-04-08

- initial plugin scaffold and first published AFKBOT UI package
