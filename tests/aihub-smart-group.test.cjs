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

test('normalizes ShuaiAPI group payloads and extracts model options', () => {
  const groups = core.extractShuaiGroups({ data: { groups: [
    {
      group: 'cheap-gpt',
      ratio: 0.04,
      request_count: 20,
      success_rate: 99.5,
      models: [{ model_name: 'gpt-5.6-sol', request_count: 20, success_rate: 99.5 }],
    },
  ] } });

  assert.equal(groups[0].name, 'cheap-gpt');
  assert.equal(groups[0].ratio, 0.04);
  assert.deepEqual(core.buildShuaiModelOptions(groups), ['gpt-5.6-sol']);
});

test('ranks ShuaiAPI groups by selected model, reliability, and ratio', () => {
  const groups = core.extractShuaiGroups({ groups: [
    { group: 'wrong-model', ratio: 0.01, request_count: 100, success_rate: 100, models: [{ model_name: 'grok-4.5', request_count: 100, success_rate: 100 }] },
    { group: 'cheap-gpt', ratio: 0.04, request_count: 100, success_rate: 99.8, models: [{ model_name: 'gpt-5.6-sol', request_count: 100, success_rate: 99.8, avg_ttft_ms: 900 }] },
    { group: 'stable-gpt', ratio: 0.06, request_count: 100, success_rate: 100, models: [{ model_name: 'gpt-5.6-sol', request_count: 100, success_rate: 100, avg_ttft_ms: 1200 }] },
  ] });

  const ranked = core.rankShuaiGroups(groups, 'gpt-5.6-sol', core.SHUAI_DEFAULT_CONFIG);
  assert.deepEqual(ranked.map((group) => group.name), ['cheap-gpt', 'stable-gpt']);
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5.6-sol').cheapest.name, 'cheap-gpt');
});

test('excludes explicitly unstable ShuaiAPI groups from reliable recommendations', () => {
  const groups = core.extractShuaiGroups({ groups: [
    { group: 'warning-cheap', ratio: 0.01, request_count: 10, success_rate: 100, description: '不稳定，建议使用其他分组', models: [{ model_name: 'gpt-x', request_count: 10, success_rate: 100 }] },
    { group: 'stable', ratio: 0.1, request_count: 10, success_rate: 99.2, models: [{ model_name: 'gpt-x', request_count: 10, success_rate: 99.2 }] },
  ] });

  const result = core.getShuaiRecommendations(groups, 'gpt-x');
  assert.equal(result.cheapest.name, 'warning-cheap');
  assert.equal(result.recommended.name, 'stable');
});

test('classifies model filters without changing original model names', () => {
  assert.equal(core.classifyShuaiModel('claude-sonnet'), 'claude');
  assert.equal(core.classifyShuaiModel('grok-4.5'), 'grok');
  assert.equal(core.matchesShuaiModel({ models: [{ name: 'gpt-5' }] }, 'category:gpt'), true);
  assert.equal(core.matchesShuaiModel({ models: [{ name: 'gpt-5' }] }, 'claude-sonnet'), false);
});

test('projects ShuaiAPI token metadata without exposing the key value', () => {
  const tokens = core.extractShuaiTokens({ data: { items: [
    { id: 9, name: 'main', key: 'sk-secret-value', group: 'gpt001', status: 'enabled', cross_group_retry: false },
  ] } });

  assert.deepEqual(tokens, [{ id: 9, name: 'main', group: 'gpt001', status: 'enabled', crossGroupRetry: false }]);
  assert.equal(JSON.stringify(tokens).includes('sk-secret-value'), false);
});

test('does not recommend a group whose latest performance bucket has no requests', () => {
  const groups = core.extractShuaiGroups({ groups: [
    {
      group: 'gpt001',
      ratio: 0.01,
      request_count: 500,
      success_rate: 99.99,
      start_ts: 1000,
      end_ts: 3000,
      bucket_seconds: 1000,
      series: [
        { ts: 1000, request_count: 500, success_rate: 99.99 },
        { ts: 2000, request_count: 0, success_rate: 0 },
      ],
      models: [{ model_name: 'gpt-5', request_count: 500, success_rate: 99.99 }],
    },
    {
      group: 'active',
      ratio: 0.05,
      request_count: 20,
      success_rate: 99.5,
      series: [{ ts: 2000, request_count: 20, success_rate: 99.5 }],
      models: [{ model_name: 'gpt-5', request_count: 20, success_rate: 99.5 }],
    },
  ] });

  assert.equal(core.hasRecentShuaiActivity(groups[0]), false);
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5').cheapest.name, 'active');
});

test('allows opting out of the recent-data requirement', () => {
  const groups = core.extractShuaiGroups({ groups: [
    {
      group: 'historical-only',
      ratio: 0.01,
      request_count: 50,
      success_rate: 100,
      series: [{ ts: 1000, request_count: 0 }],
      models: [{ model_name: 'gpt-5', request_count: 50, success_rate: 100 }],
    },
  ] });

  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5').cheapest, null);
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5', {
    ...core.SHUAI_DEFAULT_CONFIG,
    requireRecentData: false,
  }).cheapest.name, 'historical-only');
});

test('treats omitted latest buckets as no recent activity', () => {
  const groups = core.extractShuaiGroups({ data: {
    start_ts: 1000,
    end_ts: 3000,
    bucket_seconds: 1000,
    groups: [{
      group: 'omitted-latest-bucket',
      ratio: 0.01,
      request_count: 50,
      success_rate: 100,
      series: [{ ts: 1000, request_count: 50, success_rate: 100 }],
      models: [{ model_name: 'gpt-5', request_count: 50, success_rate: 100 }],
    }],
  } });

  assert.equal(groups[0].startTs, 1000);
  assert.equal(groups[0].endTs, 3000);
  assert.equal(core.hasRecentShuaiActivity(groups[0]), false);
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5').cheapest, null);
});

test('resolves a clicked recommendation only when it is an available target group', () => {
  assert.equal(core.pickShuaiTargetGroup({ name: 'cheap' }, [{ name: 'cheap' }]), 'cheap');
  assert.equal(core.pickShuaiTargetGroup({ name: 'missing' }, [{ name: 'cheap' }]), '');
  assert.equal(core.pickShuaiTargetGroup(null, [{ name: 'cheap' }]), '');
});

test('selects ShuaiAPI candidates for price, balance, and speed modes', () => {
  const groups = core.extractShuaiGroups({ groups: [
    { group: 'cheap', ratio: 0.04, request_count: 10, success_rate: 100, avg_ttft_ms: 500, models: [{ model_name: 'gpt-5', request_count: 10, success_rate: 100, avg_ttft_ms: 500 }] },
    { group: 'balanced', ratio: 0.045, request_count: 10, success_rate: 100, avg_ttft_ms: 100, models: [{ model_name: 'gpt-5', request_count: 10, success_rate: 100, avg_ttft_ms: 100 }] },
    { group: 'fast', ratio: 0.08, request_count: 10, success_rate: 100, avg_ttft_ms: 50, models: [{ model_name: 'gpt-5', request_count: 10, success_rate: 100, avg_ttft_ms: 50 }] },
  ] });

  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5', { ...core.SHUAI_DEFAULT_CONFIG, mode: 'price' }).modeCandidate.name, 'cheap');
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5', { ...core.SHUAI_DEFAULT_CONFIG, mode: 'balance' }).modeCandidate.name, 'balanced');
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5', { ...core.SHUAI_DEFAULT_CONFIG, mode: 'speed' }).modeCandidate.name, 'fast');
});

test('normalizes unsupported ShuaiAPI modes to price', () => {
  assert.equal(core.normalizeShuaiConfig({ mode: 'unknown' }).mode, 'price');
  assert.equal(core.normalizeShuaiConfig({ mode: 'speed' }).mode, 'speed');
});

test('normalizes and persists adjustable ShuaiAPI mode settings', () => {
  const config = core.normalizeShuaiConfig({
    mode: 'balance',
    balancePricePercent: '35',
    autoSelectTarget: false,
    pollIntervalSeconds: '10',
  });

  assert.equal(config.mode, 'balance');
  assert.equal(config.balancePricePercent, 35);
  assert.equal(config.autoSelectTarget, false);
  assert.equal(config.pollIntervalSeconds, 30);
});

test('uses the configured price range for balance mode', () => {
  const groups = core.extractShuaiGroups({ groups: [
    { group: 'cheap', ratio: 0.04, request_count: 10, success_rate: 100, avg_ttft_ms: 500, models: [{ model_name: 'gpt-5', request_count: 10, success_rate: 100, avg_ttft_ms: 500 }] },
    { group: 'near-fast', ratio: 0.045, request_count: 10, success_rate: 100, avg_ttft_ms: 100, models: [{ model_name: 'gpt-5', request_count: 10, success_rate: 100, avg_ttft_ms: 100 }] },
  ] });

  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5', {
    ...core.SHUAI_DEFAULT_CONFIG,
    mode: 'balance',
    balancePricePercent: 5,
  }).modeCandidate.name, 'cheap');
  assert.equal(core.getShuaiRecommendations(groups, 'gpt-5', {
    ...core.SHUAI_DEFAULT_CONFIG,
    mode: 'balance',
    balancePricePercent: 20,
  }).modeCandidate.name, 'near-fast');
});
