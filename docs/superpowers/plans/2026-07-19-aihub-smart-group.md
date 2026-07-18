# AIHub Smart Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a directly installable Tampermonkey userscript that recommends and safely switches an AIHub API key to the cheapest reliable group.

**Architecture:** A single installable userscript contains a small pure core and a browser controller. The core owns configuration normalization, candidate ranking, stability tracking, key projection, and auto-switch decisions; the controller owns same-origin API calls, Tampermonkey persistence, timers, and a fixed utility panel.

**Tech Stack:** JavaScript ES2020, Tampermonkey APIs, browser Fetch API, Node.js built-in test runner.

---

### Task 1: Recommendation Core

**Files:**
- Create: `tests/aihub-smart-group.test.cjs`
- Create: `aihub-smart-group.user.js`

- [ ] Write failing tests for configuration normalization, candidate filtering,
  deterministic ordering, consecutive checks, cooldown decisions, and safe key
  projection.
- [ ] Run `node --test tests/aihub-smart-group.test.cjs` and verify failure due
  to the missing userscript module.
- [ ] Implement the minimal pure functions in `aihub-smart-group.user.js` and
  export them only when CommonJS is available.
- [ ] Re-run the focused tests and verify all core tests pass.

### Task 2: AIHub API And Persistence

**Files:**
- Modify: `aihub-smart-group.user.js`
- Test: `tests/aihub-smart-group.test.cjs`

- [ ] Add a failing test for paginated key aggregation and auth-header creation
  through injected request dependencies.
- [ ] Run the focused tests and verify the new assertions fail.
- [ ] Implement monitor loading, paginated key loading, group updates, and
  Tampermonkey-backed settings without persisting tokens or API key values.
- [ ] Re-run all tests.

### Task 3: Utility Panel And Polling

**Files:**
- Modify: `aihub-smart-group.user.js`

- [ ] Add the fixed panel, candidate list, target-key selector, settings,
  manual refresh, manual confirmed switch, and opt-in auto-switch controls.
- [ ] Add polling, two-check stability, cooldown enforcement, visibility-safe
  status updates, and error reporting.
- [ ] Run syntax validation with `node --check aihub-smart-group.user.js` and
  all Node tests.

### Task 4: Documentation And Live Verification

**Files:**
- Create: `README.md`

- [ ] Document installation, defaults, data handling, switching safeguards,
  and uninstall steps.
- [ ] Run `node --test tests/aihub-smart-group.test.cjs` and
  `node --check aihub-smart-group.user.js`.
- [ ] Load the script in the authenticated AIHub page, verify monitor data and
  key metadata render, and confirm no group update is sent during validation.
