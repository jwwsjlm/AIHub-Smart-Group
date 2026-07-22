# AIHub Two-Column Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertically expanding settings and log accordions with a stable two-column panel whose right column switches between settings and logs.

**Architecture:** Keep the userscript as one file. Restructure only the panel shell into main and side columns, add a small normalized tab state inside `Controller`, and use responsive CSS to collapse to one internally scrolling column below `760px`.

**Tech Stack:** Tampermonkey userscript, vanilla JavaScript, CSS Grid, Node built-in test runner, ESLint, Playwright CLI.

---

### Task 1: Add Tab-State Regression Coverage

**Files:**
- Modify: `tests/aihub-smart-group.test.cjs`
- Modify: `aihub-smart-group.user.js`

- [ ] **Step 1: Write the failing test**

Add a test proving that only `settings` and `logs` are accepted and every missing or invalid value falls back to `settings`:

```js
test('normalizes the side panel tab to settings or logs', () => {
  assert.equal(core.normalizePanelTab('settings'), 'settings');
  assert.equal(core.normalizePanelTab('logs'), 'logs');
  assert.equal(core.normalizePanelTab('unknown'), 'settings');
  assert.equal(core.normalizePanelTab(), 'settings');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="normalizes the side panel tab" tests/aihub-smart-group.test.cjs`

Expected: FAIL because `core.normalizePanelTab` does not exist.

- [ ] **Step 3: Implement the minimal pure function**

Add and export:

```js
function normalizePanelTab(value) {
  return value === 'logs' ? 'logs' : 'settings';
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --test-name-pattern="normalizes the side panel tab" tests/aihub-smart-group.test.cjs`

Expected: PASS.

### Task 2: Build the Desktop Two-Column Panel

**Files:**
- Modify: `aihub-smart-group.user.js`

- [ ] **Step 1: Restructure the panel shell**

Wrap the existing primary controls and candidate list in `.asg-main-column`. Replace the settings and log `<details>` elements with `.asg-side-column`, a `role="tablist"`, two buttons carrying `data-panel-tab="settings|logs"`, and two corresponding views. Keep all existing `data-setting`, `data-field`, and `data-action` hooks intact.

- [ ] **Step 2: Add tab interaction**

Initialize `this.sideTab` to `settings`. Add `setSideTab(value)` to normalize the value, update `aria-selected` and `tabIndex`, and toggle the two views with `hidden`. Route clicks on `[data-panel-tab]` to that method without issuing requests or saving configuration.

- [ ] **Step 3: Add stable desktop sizing and independent scrolling**

Set the panel to `680px` wide and at most `calc(100vh - 32px)` tall. Make the body a two-column grid; keep the title fixed while `.asg-main-column` and `.asg-side-column` scroll independently. Remove the old log-list height cap so logs use the right column.

- [ ] **Step 4: Add narrow-screen fallback**

Below `760px`, restore a `340px` single-column panel, make `.asg-body` the scroll container, remove the side border, and prevent nested column scrolling. Preserve wrapping for long names, hints, and log entries.

### Task 3: Release Metadata and Documentation

**Files:**
- Modify: `aihub-smart-group.user.js`
- Modify: `README.md`

- [ ] **Step 1: Update documentation**

Describe the persistent desktop double-column layout, right-side settings/log tabs, independent scrolling, and mobile single-column fallback.

- [ ] **Step 2: Upgrade release version**

Set userscript metadata, `SCRIPT_VERSION`, and README current version to `0.4.5`.

- [ ] **Step 3: Run automated verification**

Run:

```powershell
node --check aihub-smart-group.user.js
node scripts/check-repository.cjs
node --test tests/*.test.cjs
npx --yes eslint@9.39.2 aihub-smart-group.user.js scripts/check-repository.cjs tests/*.test.cjs
git diff --check
```

Expected: all commands exit `0`, with all Node tests passing.

### Task 4: Browser Verification

**Files:**
- No tracked file changes

- [ ] **Step 1: Verify desktop behavior**

At `1366x768`, confirm the panel is two columns, stays within the viewport, the title remains visible, both columns scroll independently, settings save correctly, and the logs tab renders and clears logs.

- [ ] **Step 2: Verify responsive boundaries**

Check `760px`, `759px`, and `360px` viewport widths. Confirm two columns at `760px`, single column below it, internal scrolling, no horizontal overflow, and no overlapping controls or long text.

- [ ] **Step 3: Commit implementation**

Stage only `README.md`, `aihub-smart-group.user.js`, and `tests/aihub-smart-group.test.cjs`, then commit:

```powershell
git commit -m "feat: add two-column control panel"
```

### Scope Amendment: Group Exclusions and Fractional Cooldown

The release also includes two settings requested during implementation:

- `excludedGroupKeywords` stores normalized, pipe-separated lowercase keywords. Candidate names are compared case-insensitively with substring matching before any mode ranking.
- `cooldownMinutes` remains bounded from `0` to `1440` but is no longer rounded; the UI uses `0.1` steps so `0.1` means six seconds.
- Tests cover normalization, candidate exclusion, and the exact fractional cooldown boundary.
