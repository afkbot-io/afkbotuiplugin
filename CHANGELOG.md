# Changelog

All notable changes to this plugin are tracked here.

## 1.0.11 - 2026-06-03

- resolve Cloud UI Task Flow document put/confirm/delete actions through the
  validated local human principal when the UI still sends the legacy `web-user`
  placeholder
- sync release metadata to version `1.0.11`

## 1.0.10 - 2026-06-02

- require AFKBOT `1.9.15+` so manager escalation task badges are only shown
  against a core runtime that creates and wakes autonomous recovery tasks
- show Task Flow manager escalation source badges and task labels directly on
  board cards so blocked-work recovery chains are readable without opening the
  task inspector
- sync release metadata to version `1.0.10`

## 1.0.9 - 2026-06-02

- require AFKBOT `1.9.14+` so Task Flow UI installs only on the core release
  that treats the actual uv-tool receipt as the source of truth for update
  replay
- sync release metadata to version `1.0.9`

## 1.0.8 - 2026-06-02

- require AFKBOT `1.9.13+` so uv-tool GitHub installs stay on the GitHub/archive
  source even when stale package install metadata exists from an older update
- sync release metadata to version `1.0.8`

## 1.0.7 - 2026-06-02

- allow Task Flow tasks to move out of `Blocked` by explicitly clearing blocker
  reason metadata only when the operator sends that state change
- preserve existing Task Flow blocker fields on ordinary task patch and bulk
  update calls when the payload does not include blocker fields
- show Task Flow comments, task runs, activity, flow documents, and task
  documents newest-first in the inspector and knowledge panel
- require AFKBOT `1.9.12+` for uv-tool update source recovery and downgrade
  protection
- sync release metadata to version `1.0.7`

## 1.0.6 - 2026-06-02

- normalize legacy `web-user` human actor placeholders to the validated local human principal before Task Flow comment writes
- add compact in-task section navigation for edit, session, review, docs, comments, and activity
- require AFKBOT `1.9.11+` for manager reassignment blocker feed escalation
- sync release metadata to version `1.0.6`

## 1.0.5 - 2026-06-01

- add full employee edit and delete flows from the Employees graph detail modal
- expose Task Flow employee update/delete API routes with conflict responses for employees that still own Task Flow references or manage reports
- extend employee forms with manager, status, allowed tools, subagent permission, and subagent allowlist fields
- sync release metadata to version `1.0.5`

## 1.0.4 - 2026-06-01

- expand Employees into a full-width React Flow workspace, remove the persistent roster side panel, and open employee details in a modal from graph node clicks
- add tree/compact layout controls and a subtree-based graph layout so profile teams are readable by manager branch instead of compressed into crossed rows
- add Task Flow employee creation from the Employees route, including drag-from-node creation for manager/report edges
- sync release metadata to version `1.0.4`

## 1.0.3 - 2026-06-01

- add a top-level Employees workspace route with an interactive React Flow org chart, roster, delegation, tool policy, and org validation details
- add a Task Flow Employees action so operators can jump from the board to the employee graph without hunting through settings
- render flow titles on task-card badges instead of raw flow ids while keeping the id in the badge tooltip
- sync release metadata to version `1.0.3`

## 1.0.2 - 2026-06-01

- fix the Python plugin router for AFKBOT `1.9.9` by removing stale Task Flow `ai_profile`/`ai_subagent` imports and using the employee service endpoints shipped by core
- expose `/task-flow/employees` and `/task-flow/org-chart` from the backend package so the React workspace can load employee rosters after a fresh GitHub install
- normalize old persisted Task Flow actor config to a safe human actor while accepting the new canonical `employee` actor type
- sync release metadata to version `1.0.2`

## 1.0.1 - 2026-06-01

- switch Task Flow UI to the employee-only workforce model: owners, reviewers, feeds, settings, and project defaults use canonical `employee` principals instead of profile/subagent actors
- add employee org chart and employee feed surfaces so operators can inspect manager/report relationships, assignments, mentions, wake signals, and active runtime context from the board
- remove stale Task Flow team roster and subagent-owner endpoints from the e2e contract, while keeping CLI subagents as a separate capability outside Task Flow ownership
- allow real employee ids such as `orchestrator`, require AFKBOT `1.9.9+`, and sync release metadata to version `1.0.1`

## 1.0.0 - 2026-05-24

- add a Task Flow team roster endpoint and settings UI so strict backend scheduling and the board share the same allowed teammate profiles, while packaged core employees remain assignable without exposing core templates through the editable Subagents library
- expand Task Flow subagent assignment to every allowed teammate profile and add roster presets for solo, all-profile, and delivery-team setups
- rename the AI queue surface to Team Feed and show the selected Team Orchestrator or employee alongside the available worker roster
- replace the default new-subagent template with a Task Flow worker contract that points agents at context bundles, durable docs, comments, blockers, review handoffs, and delegation tools
- require AFKBOT `1.9.0+`, keep settings saves from partially persisting stale roster actors, and fall back gracefully when a mixed rollout is missing the new team endpoints
- sync release metadata to version `1.0.0`

## 0.5.8 - 2026-05-27

- add flow editing in the Task Flow `Flow Library` so operators can rename flows and update description, labels, and default owner without recreating the flow
- expose `PATCH /v1/plugins/afkbotui/task-flow/flows/{flow_id}` for operator-side flow metadata updates
- raise the plugin AFKBOT core requirement to `>=1.9.7` because flow updates are implemented in core
- sync release metadata to version `0.5.8`

## 0.5.7 - 2026-05-27

- add document deletion from the standalone `Docs` workspace with inline confirmation and revision-conflict protection
- expose `DELETE /v1/plugins/afkbotui/task-flow/docs/{document_id}` for operator-side Task Flow document deletion
- raise the plugin AFKBOT core requirement to `>=1.9.6` because document deletion is implemented in core
- sync release metadata to version `0.5.7`

## 0.5.6 - 2026-05-27

- add a standalone `Docs` workspace route for profile-wide Task Flow documents with search, scope/status filters, document preview, revision metadata, and confirm actions
- expose `GET /v1/plugins/afkbotui/task-flow/documents` so the UI can list flow and task documents without requiring a selected board task
- raise the plugin AFKBOT core requirement to `>=1.9.3` because the profile-wide Task Flow document service is provided by newer core releases
- sync release metadata to version `0.5.6`

## 0.5.5 - 2026-05-15

- add Task Flow AI-only agent feed, context bundle, and flow/task document controls so operators can see AI assignments, mentions, wake/recovery signals, plans, specs, handoffs, and confirmed document revisions from the board and flow library
- align Task Flow feed/review API calls with AFKBOT core by sending `task_limit`, preserving omitted reviewers, allowing explicit reviewer clearing, and showing review actions for active review claims
- keep background refreshes silent across Task Flow, Automations, and profile libraries so polling no longer shifts dashboards or flips refresh buttons every cycle
- preserve revealed webhook URLs in open automation inspectors unless the operator explicitly rotates the endpoint
- restore the last selected profile when the workspace opens without a `profile` URL parameter
- show richer one-line summaries for Subagents, Skills, and Bootstrap files by deriving previews from markdown content instead of terse names
- replace raw `pNN` task priority chips with named priority levels and Jira-style direction markers
- tighten Task Flow inspector layouts by aligning the Review field, constraining live activity overflow, moving the Discussion composer below existing comments, and collapsing long comments
- allow `ai_subagent` as a persisted Task Flow actor type in plugin config metadata and API validation
- sync release metadata to version `0.5.5`

## 0.5.3 - 2026-04-28

- add Subagent as a Task Flow owner and reviewer type while sending the canonical `ai_subagent` owner value to AFKBOT core
- replace free-text subagent owner fields with profile-local subagent selects for task, review, flow default owner, and Task Flow actor settings
- validate subagent owner refs before submit so `ai_subagent` payloads use `<profile_id>:<subagent_name>` instead of stale profile IDs
- render subagent-owned task cards and flow summaries from `owner_ref` values such as `default:researcher` instead of showing them as unassigned
- infer Task Flow session profile fallbacks from `ai_subagent` owner refs in the plugin API
- sync release metadata to version `0.5.3`

## 0.5.2 - 2026-04-28

- accept legacy Task Flow `prompt` payloads while forwarding canonical `description` values into AFKBOT core for task create and update routes
- send Task Flow create/edit form data as `description` from the React workspace and keep `prompt` only as a legacy read fallback
- order Task Flow board columns as Plan, Todo, Blocked, Running, Review, Completed, Failed, and Cancelled
- show actionable server-error fallback text for opaque 500 responses so operators know to check AFKBOT API logs
- sync release metadata to version `0.5.2`

## 0.5.1 - 2026-04-22

- match `afkbotweb` more closely by bundling the same local font assets and removing runtime Google Fonts dependency from the React workspace
- replace the squeezed mobile topbar rail with a compact profile switcher plus burger-sheet navigation, and drop the redundant global refresh action from the shell
- simplify `Automations` header actions, stack the mobile filter form correctly, and fix the narrow-screen checkbox/select/button layout regressions reported in browser review
- tighten nav control geometry and inspector spacing so the workspace shell, selects, buttons, and automation title rhythm sit closer to the new AFKBOT visual contract
- remove obsolete pre-React `web/dist/assets/core/*` and legacy feature bundle outputs from the shipped plugin payload, plus clear stale local coverage and Playwright artifacts from the repo tree
- expand browser coverage with explicit mobile navigation and automation-filter layout assertions
- sync release metadata to version `0.5.1`

## 0.5.0 - 2026-04-21

- extract shared React primitives for modal shells, pending buttons, and loading surfaces so async UX stays consistent across the workspace
- split Task Flow model helpers into form/service modules and extract shared task form fields from create/edit flows
- add pending-state coverage for automation create, task save/comment, text-library create, and boot loader startup sequencing
- strengthen release checks with source mount validation and repo artifact ignore enforcement
- sync release metadata to version `0.5.0`

## 0.4.3 - 2026-04-21

- replace separate Task Flow flow creation and deletion entry points with a single project manager modal that supports inline add, search, filter, and delete flows
- treat flows as projects in the Task Flow UI, surface richer project metadata, and improve project search ranking by title, id, labels, creator, owner, and status
- harden Task Flow validation for project creation, task creation, task editing, and settings saves so invalid numbers, dates, and API failures return explicit UI feedback
- reset stale project filters safely when the active profile or remote flow list changes, preventing false empty-board states after refresh or deletion
- preserve scroll state for the project manager list alongside the board, modal, and inspector during reactive refreshes
- tighten dialog semantics and keyboard focus handling across text-library create/delete modals, and improve inline error accessibility
- compact the mobile workspace shell, add safe-area-aware overlays/toasts, and make inspector/modal layouts behave better on narrow devices
- expand verification with mobile/browser Playwright coverage, mutation smoke flows, and an explicit release-contract integrity check for `web/dist`
- sync release metadata to version `0.4.3`

## 0.4.2 - 2026-04-21

- switch the automation inspector from plugin-side webhook URL caching to the core operator-side reveal path, so the current webhook URL stays visible in the open inspector without widening generic automation metadata
- preserve revealed webhook URLs across automation list refreshes inside the open inspector while keeping list/grid payloads masked
- require AFKBOT `1.4.2+` because the plugin now depends on the new core reveal contract and durable encrypted webhook storage
- sync release metadata to version `0.4.2`

## 0.4.1 - 2026-04-20

- add graph-aware automation inspector UI with execution mode badges, lazy graph preview, recent graph runs, latest trace summary, and explicit AI handoff visibility
- simplify webhook diagnostics to show the issued webhook URL only, preserve useful session/run diagnostics, and surface failed states as inline errors
- preserve workspace scroll position during automatic automation refreshes while avoiding stale graph inspector data
- stop caching webhook endpoints in browser storage and narrow graph preview payloads to a stable, redacted plugin contract
- sync release metadata to version `0.4.1`

## 0.4.0 - 2026-04-19

- integrate the workspace with AFKBOT core operator auth so protected plugin UI and plugin API routes redirect through `/auth/login`
- add auth session preflight, session badge, logout, and unauthorized recovery in the shell without keeping plugin-local password state
- mark the plugin manifest as `auth.operator_required` and require AFKBOT `1.3.0+`
- sync release metadata to version `0.4.0`

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
