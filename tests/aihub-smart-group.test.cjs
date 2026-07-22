const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../aihub-smart-group.user.js');

test('defaults the adjustable 10m availability threshold to 10 percent', () => {
  assert.equal(core.DEFAULT_CONFIG.minSuccess10m, 0.1);
  assert.equal(core.normalizeConfig({}).minSuccess10m, 0.1);
  assert.equal(core.normalizeConfig({ minSuccess6h: 0.95 }).minSuccess10m, 0.1);
});

test('normalizes thresholds and safety settings', () => {
  const config = core.normalizeConfig({
    minSuccess10m: '0.9',
    consecutiveChecks: 0,
    pollIntervalSeconds: 2,
    cooldownMinutes: -1,
    requireNoWarnings: false,
  });

  assert.equal(config.minSuccess10m, 0.9);
  assert.equal(config.consecutiveChecks, 1);
  assert.equal(config.pollIntervalSeconds, 10);
  assert.equal(config.cooldownMinutes, 0);
  assert.equal(config.requireNoWarnings, false);
});

test('filters and orders eligible monitor rows by recent availability then price', () => {
  const rows = [
    { planType: 'slow-cheap', group_id: 3, priceMultiplier: 0.03, available: true, successRates: { '10m': 1, '24h': 0.01 }, firstTokenLatencyMs: 3000, warningReasons: [] },
    { planType: 'best', group_id: 2, priceMultiplier: 0.05, available: true, successRates: { '10m': 1, '24h': 1 }, firstTokenLatencyMs: 800, warningReasons: [] },
    { planType: 'unavailable', group_id: 1, priceMultiplier: 0.001, available: false, successRates: { '10m': 1, '24h': 1 }, warningReasons: [] },
    { planType: 'warning', group_id: 4, priceMultiplier: 0.02, available: true, successRates: { '10m': 1, '24h': 1 }, warningReasons: [{ type: 'input_tokens_change' }] },
    { planType: 'low-10m', group_id: 5, priceMultiplier: 0.01, available: true, successRates: { '10m': 0, '24h': 1 }, warningReasons: [] },
  ];

  const ranked = core.rankCandidates(rows, core.DEFAULT_CONFIG);

  assert.deepEqual(ranked.map((row) => row.planType), ['slow-cheap', 'best']);
});

test('uses reliability and latency as deterministic tie breakers', () => {
  const rows = [
    { planType: 'slow', group_id: 1, priceMultiplier: 0.05, available: true, successRates: { '10m': 0.98, '24h': 0.99 }, firstTokenLatencyMs: 2000, warningReasons: [] },
    { planType: 'fast', group_id: 2, priceMultiplier: 0.05, available: true, successRates: { '10m': 0.98, '24h': 0.99 }, firstTokenLatencyMs: 1000, warningReasons: [] },
  ];

  assert.equal(core.rankCandidates(rows, core.DEFAULT_CONFIG)[0].planType, 'fast');
});

test('computes availability from valid monitor samples in the latest 10 minutes', () => {
  const now = Date.parse('2026-07-22T05:10:00Z');
  const rows = [
    { id: 'api-1', successRates: { '24h': 0.5 } },
    { id: 'api-2', successRates: { '24h': 1 } },
  ];
  const series = {
    generatedAt: new Date(now).toISOString(),
    seriesByApiId: {
      'api-1': [
        [now - 11 * 60_000, 0],
        [now - 9 * 60_000, 1],
        [now - 4 * 60_000, 0],
      ],
      'api-2': [[now - 11 * 60_000, 1]],
    },
  };

  const enriched = core.attachRecentAvailability(rows, series, 10 * 60_000);
  assert.equal(enriched[0].successRates['10m'], 0.5);
  assert.equal(enriched[0].recentSampleCount, 2);
  assert.equal(Number.isNaN(enriched[1].successRates['10m']), true);
  assert.equal(enriched[1].recentSampleCount, 0);
});

test('selects AIHub candidates for price, balance, and speed modes', () => {
  const rows = [
    { planType: 'cheap', group_id: 1, priceMultiplier: 0.04, available: true, successRates: { '10m': 1, '24h': 1 }, firstTokenLatencyMs: 500, warningReasons: [] },
    { planType: 'balanced', group_id: 2, priceMultiplier: 0.045, available: true, successRates: { '10m': 1, '24h': 1 }, firstTokenLatencyMs: 100, warningReasons: [] },
    { planType: 'fast', group_id: 3, priceMultiplier: 0.08, available: true, successRates: { '10m': 1, '24h': 1 }, firstTokenLatencyMs: 50, warningReasons: [] },
  ];

  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'price' })[0].planType, 'cheap');
  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.05 })[0].planType, 'balanced');
  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'speed' })[0].planType, 'fast');
});

test('normalizes adjustable AIHub mode settings', () => {
  const config = core.normalizeConfig({ mode: 'balance', balanceMaxPrice: '0.1', balancePricePercent: 500 });
  assert.equal(config.mode, 'balance');
  assert.equal(config.balanceMaxPrice, 0.1);
  assert.equal(Object.hasOwn(config, 'balancePricePercent'), false);
  assert.equal(core.normalizeConfig({ mode: 'unknown', balanceMaxPrice: 9999 }).mode, 'price');
  assert.equal(core.normalizeConfig({ mode: 'unknown', balanceMaxPrice: 9999 }).balanceMaxPrice, 1000);
});

test('ignores groups above the absolute balance price limit', () => {
  const rows = [
    { planType: 'cheap', group_id: 1, priceMultiplier: 0.04, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 500, warningReasons: [] },
    { planType: 'balanced', group_id: 2, priceMultiplier: 0.045, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100, warningReasons: [] },
    { planType: 'too-expensive', group_id: 3, priceMultiplier: 0.08, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 10, warningReasons: [] },
  ];

  assert.deepEqual(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.05 }).map((row) => row.planType), ['balanced', 'cheap']);
  assert.deepEqual(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.04 }).map((row) => row.planType), ['cheap']);
  assert.deepEqual(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.03 }), []);
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

test('redacts bearer credentials and auth token values from logs', () => {
  const logs = core.appendLogEntries([], {
    message: 'Authorization: Bearer header.payload.signature auth_token: secret-token-value',
  });

  assert.equal(logs[0].message.includes('header.payload.signature'), false);
  assert.equal(logs[0].message.includes('secret-token-value'), false);
  assert.match(logs[0].message, /Bearer \[已隐藏\]/);
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

test('explains why automatic switching is skipped', () => {
  const config = { ...core.DEFAULT_CONFIG, cooldownMinutes: 10 };
  const ready = {
    now: 601_000,
    lastSwitchAt: 500,
    currentGroupId: 1,
    targetGroupId: 2,
    stable: true,
    config,
  };

  assert.equal(core.getAutoSwitchBlockReason(ready), '');
  assert.equal(core.getAutoSwitchBlockReason({ ...ready, stable: false }), '推荐尚未稳定');
  assert.equal(core.getAutoSwitchBlockReason({ ...ready, currentGroupId: 2 }), '当前密钥已经在推荐分组');
  assert.equal(core.getAutoSwitchBlockReason({ ...ready, now: 1_000 }), '切换冷却中');
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

test('logs periodic detection state only when it changes unless forced', () => {
  assert.equal(core.shouldLogTransition(null, 'price:14', false), true);
  assert.equal(core.shouldLogTransition('price:14', 'price:14', false), false);
  assert.equal(core.shouldLogTransition('price:14', 'price:14', true), true);
  assert.equal(core.shouldLogTransition('price:14', 'price:20', false), true);
});

test('blocks switching while loading or when key authentication failed', () => {
  const ready = {
    loading: false,
    authError: '',
    winner: { groupId: 14 },
    key: { groupId: 20 },
    stability: { stable: true, count: 2 },
    requiredChecks: 2,
  };

  assert.equal(core.getSwitchBlockReason(ready), '');
  assert.equal(core.getSwitchBlockReason({ ...ready, loading: true }), '正在检测');
  assert.equal(core.getSwitchBlockReason({ ...ready, loading: true, allowWhileLoading: true }), '');
  assert.equal(core.getSwitchBlockReason({ ...ready, error: '监控请求失败' }), '监控请求失败');
  assert.equal(core.getSwitchBlockReason({ ...ready, authError: '登录已失效' }), '登录已失效');
  assert.equal(core.getSwitchBlockReason({ ...ready, stability: { stable: false, count: 1 } }), '推荐尚未稳定（1/2 次）');
  assert.equal(core.getSwitchBlockReason({ ...ready, key: { groupId: 14 } }), '当前密钥已经在推荐分组');
});

test('builds current multiplier lookup by normalized group name', () => {
  const lookup = core.buildGroupMultiplierMap([
    { planType: ' A004-K12/BugTeam ', priceMultiplier: '0.04' },
    { name: 'A013-K12', priceMultiplier: 0.01 },
    { planType: 'invalid', priceMultiplier: 'unknown' },
  ]);

  assert.equal(lookup.get('a004-k12/bugteam'), 0.04);
  assert.equal(lookup.get('a013-k12'), 0.01);
  assert.equal(lookup.has('invalid'), false);
});

test('maps current group metrics by group id without filtering unavailable rows', () => {
  const metrics = core.buildGroupMetricMap([
    { group_id: 14, planType: 'same-name', priceMultiplier: '0.04', firstTokenLatencyMs: '1141', available: false },
    { group_id: 20, planType: 'same-name', priceMultiplier: 0.08, firstTokenLatencyMs: 320, available: true },
    { group_id: 'invalid', priceMultiplier: 0.01, firstTokenLatencyMs: 10 },
  ]);

  assert.deepEqual(metrics.get(14), { multiplier: 0.04, latencyMs: 1141 });
  assert.deepEqual(metrics.get(20), { multiplier: 0.08, latencyMs: 320 });
  assert.equal(metrics.has('same-name'), false);
  assert.equal(metrics.size, 2);
});

test('formats target key options with current group metrics and safe placeholders', () => {
  const key = {
    id: 7,
    name: 'main',
    groupId: 14,
    groupName: 'A001-K12',
    key: 'sk-must-not-appear',
  };

  assert.equal(core.formatKeyOptionLabel(key, { multiplier: 0.05, latencyMs: 1141 }), 'main · A001-K12 · ×0.05 · 首 Token 1141 ms');
  assert.equal(core.formatKeyOptionLabel(key, null), 'main · A001-K12 · 倍率暂无数据 · 首 Token 暂无数据');
  const invalid = core.formatKeyOptionLabel(key, { multiplier: Number.NaN, latencyMs: -1 });
  assert.equal(invalid, 'main · A001-K12 · 倍率暂无数据 · 首 Token 暂无数据');
  assert.equal(invalid.includes('sk-must-not-appear'), false);
});

test('formats usage multipliers without unnecessary zeroes', () => {
  assert.equal(core.formatMultiplier(0.04), '×0.04');
  assert.equal(core.formatMultiplier(1), '×1');
  assert.equal(core.formatMultiplier(0.0123456), '×0.012346');
  assert.equal(core.formatMultiplier(Number.NaN), '');
});

test('enables the panel on every AIHub page only while logged in', () => {
  assert.deepEqual(core.getPageFeatures('/providers', true), { panel: true, usage: false });
  assert.deepEqual(core.getPageFeatures('/keys?page=1', true), { panel: true, usage: false });
  assert.deepEqual(core.getPageFeatures('/usage', true), { panel: true, usage: true });
  assert.deepEqual(core.getPageFeatures('/dashboard', true), { panel: true, usage: false });
  assert.deepEqual(core.getPageFeatures('/usage', false), { panel: false, usage: false });
});
