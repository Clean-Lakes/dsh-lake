---
goal: Distribute Lake resource capabilities into the existing DSH workspace sidebar, composer and terminal dock
version: 1
date_created: 2026-10-22
last_updated: 2026-10-22
owner: Clean Lakes
status: 'Completed'
tags: [refactor, workspace, resources, dsh]
---
# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Remove the independent Lake main panel. Preserve DSH's unmodified conversation and workspace/session browser. Add a resource section through the additive sidebar footer slot, an input action, and a bottom terminal dock.

## 1. Requirements & Constraints

- **REQ-001**: Resources follow the selected DSH workspace through a durable workspace-to-Lake-project mapping; offer adoption of existing Lake projects.
- **REQ-002**: Register `sidebar.footer.action`, `conversation.input.left`, `shell.overlay`, and an unoccupied `shell.bottom`; never register `main`, `sidebar`, or `sidebar.workspaces` replacements.
- **REQ-003**: Resource references preserve the native draft and use revision-guarded insertion. Manual shells belong to the workspace and persist across conversation navigation within that workspace.
- **SEC-001**: Retain DSH authentication, tool approvals, private process credentials, SSH fingerprint decisions and unmodified upstream source.
- **CON-001**: DSH 0.2.1-rc.2 has no additive per-workspace-row region; use its additive footer section immediately below workspace browsing, never patch its DOM or replace its session tree.

- **REQ-004**: Add native @ resource candidates and reference chips through inputTriggers, with persistent identity and credential-free send-time serialization.

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: Provide durable workspace resource association.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Add LakeBackend.workspace/bindWorkspace in lib/backend.js and allowlisted workspace routes in lib/native-routes.js. | Yes | 2026-10-22 |
| TASK-002 | Refactor client/src/index.jsx into resource section, resource picker, composer action, global overlays and workspace terminal dock. Remove Workbench and BoundConversation registrations. Depends on TASK-001. | Yes | 2026-10-22 |
| TASK-006 | Implement client/src/references.js and tests for native @ candidates, reference identity and send-time validation. Depends on TASK-002. | Yes | 2026-10-22 |
| TASK-003 | Replace client/src/styles.css with scoped sidebar, modal and dock styles; preserve native conversation geometry. Depends on TASK-002. | Yes | 2026-10-22 |

### Implementation Phase 2

- **GOAL-002**: Verify and deliver workspace integration.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | Test mapping concurrency, persistence, adoption, workspace separation and additive slot registrations; test real DSH workspace switches, insertion, terminal and narrow layout. Depends on TASK-003. | Yes | 2026-10-22 |
| TASK-005 | Update README, docs/validation.md and package metadata to 0.3.0; build native client and installable package. Depends on TASK-004. | Yes | 2026-10-22 |

## 3. Alternatives

- **ALT-001**: Retaining the standalone Lake panel repeats workspace navigation and consumes a second sidebar.
- **ALT-002**: Shadowing the host workspace browser would replace private session-tree behavior; imperative insertion into its DOM would depend on undocumented markup.

## 4. Dependencies

- **DEP-001**: Public DSH 0.2.1-rc.2 sidebar, input, shell bottom and shell overlay contracts.

## 5. Files

- **FILE-001**: lib/backend.js and lib/native-routes.js own workspace association.
- **FILE-002**: client/src/index.jsx and styles.css own additive UI.
- **FILE-003**: test/, README.md, docs/validation.md and package.json own delivery verification.

## 6. Testing

- **TEST-001**: Distinct workspace ids have distinct resource groups; concurrent enable calls are idempotent and mappings survive backend reconstruction.
- **TEST-002**: No Lake main entry or independent composer exists; DSH models, drafts and session tree remain native.
- **TEST-003**: Workspace-bound terminal executes harmless printf; switching conversations within the workspace retains it; workspace switching disconnects it.
- **TEST-004**: Native draft insertion preserves surrounding text; stale selections refuse; sidebar collapse, light/dark and narrow geometry remain usable.

## 7. Risks & Assumptions

- **RISK-001**: Other plugins may occupy shell.bottom; fall back to an owned overlay terminal instead of shadowing them.
- **ASSUMPTION-001**: Full advanced SRE/workflow/strategy page migration is separate; this change distributes the already integrated resource and execution capabilities.

## 8. Related Specifications / Further Reading

- [Native integration](refactor-dsh-native-integration-1.md)
- [Usage](../README.md)
