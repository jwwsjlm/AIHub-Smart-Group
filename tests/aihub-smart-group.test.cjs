const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../aihub-smart-group.user.js');

test('normalizes thresholds and safety settings', () => {
  const config = core.normalizeConfig({
    minSuccess6h: '0.9',
    minSuccess24h: 'invalid',
    consecutiveChecks: 0,
    pollIntervalSeconds: 2,
    cooldownMinutes: -1,
    requireNoWarnings: false,
  });

  assert.equal(config.minSuccess6h, 0.9);
  assert.equal(config.minSuccess24h, 0.9);
  assert.equal(config.consecutiveChecks, 1);
  assert.equal(config.pollIntervalSeconds, 10);
  assert.equal(config.cooldownMinutes, 0);
  assert.equal(config.requireNoWarnings, false);
});

test('filters and orders eligible monitor rows by price then reliability', () => {
  const rows = [
    { planType: 'slow-cheap', group_id: 3, priceMultiplier: 0.03, available: true, successRates: { '6h': 1, '24h': 0.95 }, firstTokenLatencyMs: 3000, warningReasons: [] },
    { planType: 'best', group_id: 2, priceMultiplier: 0.05, available: true, successRates: { '6h': 1, '24h': 1 }, firstTokenLatencyMs: 800, warningReasons: [] },
    { planType: 'unavailable', group_id: 1, priceMultiplier: 0.001, available: false, successRates: { '6h': 1, '24h': 1 }, warningReasons: [] },
    { planType: 'warning', group_id: 4, priceMultiplier: 0.02, available: true, successRates: { '6h': 1, '24h': 1 }, warningReasons: [{ type: 'input_tokens_change' }] },
    { planType: 'low-24h', group_id: 5, priceMultiplier: 0.01, available: true, successRates: { '6h': 1, '24h': 0.5 }, warningReasons: [] },
  ];

  const ranked = core.rankCandidates(rows, core.DEFAULT_CONFIG);

  assert.deepEqual(ranked.map((row) => row.planType), ['slow-cheap', 'best']);
});

test('uses reliability and latency as deterministic tie breakers', () => {
  const rows = [
    { planType: 'slow', group_id: 1, priceMultiplier: 0.05, available: true, successRates: { '6h': 0.98, '24h': 0.99 }, firstTokenLatencyMs: 2000, warningReasons: [] },
    { planType: 'fast', group_id: 2, priceMultiplier: 0.05, available: true, successRates: { '6h': 0.98, '24h': 0.99 }, firstTokenLatencyMs: 1000, warningReasons: [] },
  ];

  assert.equal(core.rankCandidates(rows, core.DEFAULT_CONFIG)[0].planType, 'fast');
});

test('selects AIHub candidates for price, balance, and speed modes', () => {
  const rows = [
    { planType: 'cheap', group_id: 1, priceMultiplier: 0.04, available: true, successRates: { '6h': 1, '24h': 1 }, firstTokenLatencyMs: 500, warningReasons: [] },
    { planType: 'balanced', group_id: 2, priceMultiplier: 0.045, available: true, successRates: { '6h': 1, '24h': 1 }, firstTokenLatencyMs: 100, warningReasons: [] },
    { planType: 'fast', group_id: 3, priceMultiplier: 0.08, available: true, successRates: { '6h': 1, '24h': 1 }, firstTokenLatencyMs: 50, warningReasons: [] },
  ];

  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'price' })[0].planType, 'cheap');
  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'balance', balancePricePercent: 20 })[0].planType, 'balanced');
  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'speed' })[0].planType, 'fast');
});

test('normalizes adjustable AIHub mode settings', () => {
  const config = core.normalizeConfig({ mode: 'balance', balancePricePercent: '35' });
  assert.equal(config.mode, 'balance');
  assert.equal(config.balancePricePercent, 35);
  assert.equal(core.normalizeConfig({ mode: 'unknown', balancePricePercent: 999 }).mode, 'price');
  assert.equal(core.normalizeConfig({ mode: 'unknown', balancePricePercent: 999 }).balancePricePercent, 500);
});

test('keeps bounded, sanitized runtime logs', () => {
  const logs = core.appendLogEntries([], {
    at: 1,
    scope: 'aihub',
    level: 'error',
    message: '请求失败 sk-secret-value',
  }, 2);
  const next = core.appendLogEntries(logs, { at: 2, scope: 'aihub', level: 'info', message: '已切换' }, 2);
  const bounded = core.appendLogEntries(next, { at: 3, scope: 'aihub', level: 'info', message: '第三条' }, 2);

  assert.equal(bounded.length, 2);
  assert.equal(bounded[0].message, '第三条');
  assert.equal(bounded[1].message.includes('sk-secret-value'), false);
  assert.match(core.formatLogLine(bounded[0]), /第三条/);
});

test('requires the same winner for the configured number of checks', () => {
  let state = core.createStabilityState();
  state = core.advanceStability(state, 14, 2);
  assert.equal(state.stable, false);
  state = core.advanceStability(state, 14, 2);
  assert.equal(state.stable, true);
  state = core.advanceStability(state, 20, 2);
  assert.equal(state.groupId, 20);
  assert.equal(state.count, 1);
  assert.equal(state.stable, false);
});

test('blocks auto switching during cooldown and when already on target', () => {
  const config = { ...core.DEFAULT_CONFIG, cooldownMinutes: 10 };
  assert.equal(core.canAutoSwitch({ now: 1_000, lastSwitchAt: 500, currentGroupId: 1, targetGroupId: 2, stable: true, config }), false);
  assert.equal(core.canAutoSwitch({ now: 601_000, lastSwitchAt: 500, currentGroupId: 2, targetGroupId: 2, stable: true, config }), false);
  assert.equal(core.canAutoSwitch({ now: 601_000, lastSwitchAt: 500, currentGroupId: 1, targetGroupId: 2, stable: true, config }), true);
});

test('projects key metadata without exposing complete API key values', () => {
  const projected = core.projectKeys([{ id: 7, name: 'main', key: 'sk-secret-value', group_id: 14, group: { name: 'A006-Plus' }, status: 'active' }]);
  assert.deepEqual(projected, [{ id: 7, name: 'main', groupId: 14, groupName: 'A006-Plus', status: 'active' }]);
  assert.equal(JSON.stringify(projected).includes('sk-secret-value'), false);
});

test('adds the current page auth token only to transient request headers', () => {
  assert.deepEqual(core.buildAuthHeaders('token-value'), { Authorization: 'Bearer token-value' });
  assert.deepEqual(core.buildAuthHeaders(''), {});
});

test('marks authenticated user API requests like the AIHub client', () => {
  assert.deepEqual(core.buildApiHeaders('/keys?page=1', 'token-value'), {
    Authorization: 'Bearer token-value',
    'X-User-UI-Request': '1',
  });
  assert.deepEqual(core.buildApiHeaders('/public/monitor/summary', ''), {});
});

test('merges paginated API key responses without duplicates', () => {
  const merged = core.mergeKeyPages([
    { items: [{ id: 1 }, { id: 2 }], pages: 2 },
    { items: [{ id: 2 }, { id: 3 }], pages: 2 },
  ]);
  assert.deepEqual(merged.map((key) => key.id), [1, 2, 3]);
});
