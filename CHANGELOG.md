# Changelog

All notable changes to this plugin are tracked here.

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
