---
goal: Move Lake model, conversation and message ownership to DSH and replace the iframe workbench with native resource and terminal UI
version: 1
date_created: 2026-10-22
last_updated: 2026-10-22
owner: Clean Lakes
status: 'Completed'
tags: [refactor, dsh, ui, sessions]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Replace the standalone Lake chat embedded in DSH with DSH-owned Conversation components. Keep Lake's resource store, SSH and PTY backend. Existing Lake data remains on disk. New human conversations and model configuration belong exclusively to DSH.

## 1. Requirements & Constraints

- **REQ-001**: Reuse DSH `conversation.content` Factory and Session Controller; messages, drafts, model selection, approvals and persistence use DSH.
- **REQ-002**: Render Lake resources beside the native conversation, without a second human session list or provider editor.
- **REQ-003**: Provide native project/resource creation, local/SSH terminals and model-callable resource and command tools.
- **SEC-001**: Never copy DSH model secrets into Lake. Agent commands require DSH approval before dispatch; retain backend dangerous-command rejection.
- **SEC-002**: Keep authentication, private Lake process tokens, isolated data homes and backend lifecycle protections.
- **CON-001**: Keep `upstream/lake` byte-identical. Store terminal execution scopes separately from DSH human conversation identity.
- **GUD-001**: Respect host theme and `--dsh-frame-top-clearance`; default to the host layout instead of a fixed fullscreen overlay.
- **PAT-001**: Use public installed-version SDK declarations, host slot APIs and host React; use independent isolated DSH profiles for validation.

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: Establish resource and terminal bridges with explicit host ownership.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Implement `lib/backend.js` authenticated Lake JSON requests, resource catalog projection and durable DSH-session-to-terminal-scope bindings. | Yes | 2026-10-22 |
| TASK-002 | Implement `lib/native-routes.js` authenticated allowlisted project/resource/terminal endpoints; exclude Lake model/message management. Depends on TASK-001. | Yes | 2026-10-22 |
| TASK-003 | Implement `lib/tools.js` resource query and approved command tools, preserving cancellation and refusing dangerous commands rejected by Lake. Depends on TASK-001. | Yes | 2026-10-22 |

### Implementation Phase 2

- **GOAL-002**: Build and validate the native DSH workbench.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | Implement `client/src/index.jsx`, native resource forms, scoped terminal component and styles; bind `lake.conversation` to the host SessionProvider and render `conversation.content`. Depends on TASK-002. | Yes | 2026-10-22 |
| TASK-005 | Implement `scripts/build-client.mjs`, package native assets and update plugin metadata to version 0.2.0. Depends on TASK-004. | Yes | 2026-10-22 |
| TASK-006 | Add ownership, approval, cancellation and real backend integration tests; verify clean-profile native DSH session/model sharing and UI at desktop/narrow sizes. Depends on TASK-003 and TASK-005. | Yes | 2026-10-22 |
| TASK-007 | Update README and validation records and build the installable 0.2.0 package. Depends on TASK-006. | Yes | 2026-10-22 |

## 3. Alternatives

- **ALT-001**: Synchronizing model keys and duplicating chat history between engines would keep two independent authorities and is rejected.
- **ALT-002**: Keeping an iframe for the main chat prevents native DSH session rendering and is rejected.

## 4. Dependencies

- **DEP-001**: DSH 0.2.1-rc.2 public Session Controller, UI Conversation Factory, slot renderer and tool registry contracts.
- **DEP-002**: Existing signed Lake backend and xterm 5.5.0 with fit addon 0.10.0.

## 5. Files

- **FILE-001**: `lib/index.js`, `lib/backend.js`, `lib/native-routes.js`, `lib/tools.js` own host integration.
- **FILE-002**: `client/src/`, `scripts/build-client.mjs`, `package.json` own native client delivery.
- **FILE-003**: `test/`, `README.md`, `docs/validation.md` own verification and usage.

## 6. Testing

- **TEST-001**: DSH model and session ownership: no independent Lake provider or human-chat creation from UI; native messages persist in DSH.
- **TEST-002**: Authentication and approved commands: denial prevents dispatch, cancellation interrupts the owned command, dangerous backend rejection remains visible.
- **TEST-003**: Real local PTY, resource creation, backend restart persistence and isolation.
- **TEST-004**: Browser light/dark/narrow rendering, single composer, no traffic-light overlap and no duplicate session navigation.

## 7. Risks & Assumptions

- **RISK-001**: DSH extension contracts vary by version; validate against installed 0.2.1-rc.2 and report unsupported versions explicitly.
- **RISK-002**: Existing Lake-only conversation history is retained but is not silently imported into DSH.
- **ASSUMPTION-001**: Human-session lifecycle is DSH-owned; backend-only execution scopes are internal terminal ownership records.

## 8. Related Specifications / Further Reading

- [Current plugin usage](../README.md)
- [Validation record](../docs/validation.md)
- DSH installed public SDK: `dsh-client-ui-conversation`, `dsh-api-session-controller`, `dsh-client-ui-layout`, `dsh-tools` at 0.2.1-rc.2.

Native integration scope completed. Full independent Lake advanced-page parity remains outside this plan and is explicitly documented in README and validation.
