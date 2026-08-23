const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../aihub-smart-group.user.js');
const userscriptSource = fs.readFileSync(path.join(__dirname, '..', 'aihub-smart-group.user.js'), 'utf8');

test('hides inactive availability settings despite the shared label display rule', () => {
  assert.match(userscriptSource, /\[data-availability-setting\]\[hidden\]\{display:none !important\}/);
});

test('stacks narrow-screen panel sections without unbounding the candidate list', () => {
  const mediaStart = userscriptSource.indexOf('@media (max-width:759px){');
  const styleEnd = userscriptSource.indexOf('const USAGE_STYLE', mediaStart);

  assert.notEqual(mediaStart, -1);
  assert.notEqual(styleEnd, -1);

  const mobileStyles = userscriptSource.slice(mediaStart, styleEnd);
  assert.match(mobileStyles, /#\$\{ROOT_ID\}\{width:min\(360px,calc\(100vw - 32px\)\)\}/);
  assert.match(mobileStyles, /\.asg-body\{\s*display:flex;\s*flex-direction:column;\s*overflow:auto;/);
  assert.match(mobileStyles, /\.asg-main-column,\s*#\$\{ROOT_ID\} \.asg-side-column\{\s*flex:0 0 auto;\s*min-height:auto;\s*overflow:visible;/);
  assert.match(mobileStyles, /\.asg-side-tabs\{\s*position:static;\s*top:auto;\s*z-index:auto;/);
  assert.doesNotMatch(mobileStyles, /\.asg-body\{[^}]*grid-template-columns/);
  assert.doesNotMatch(mobileStyles, /\.asg-list\{max-height:none\}/);
});

test('wires the native key group dropdown enhancer through the app router', () => {
  assert.match(userscriptSource, /class KeyGroupDropdownEnhancer/);
  assert.match(userscriptSource, /this\.keyGroups = new KeyGroupDropdownEnhancer\(\)/);
  assert.match(userscriptSource, /input\[placeholder="搜索分组\.\.\."\]/);
});

test('maps dropdown monitor tones to native group badge classes', () => {
  assert.equal(core.getGroupDropdownToneClass('available'), 'asg-key-group-badge-available');
  assert.equal(core.getGroupDropdownToneClass('warning'), 'asg-key-group-badge-warning');
  assert.equal(core.getGroupDropdownToneClass('unavailable'), 'asg-key-group-badge-unavailable');
  assert.equal(core.getGroupDropdownToneClass('disabled'), 'asg-key-group-badge-disabled');
  assert.equal(core.getGroupDropdownToneClass('error'), 'asg-key-group-badge-error');
  assert.equal(core.getGroupDropdownToneClass('unknown'), '');
  assert.equal(core.getGroupDropdownToneClass('unexpected'), '');
});

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
  assert.equal(config.availabilityMode, 'percent');
  assert.equal(config.minSuccessPoints10m, 1);
  assert.equal(config.minConsecutiveSuccesses10m, 2);
});

test('normalizes selectable availability criteria', () => {
  const config = core.normalizeConfig({ availabilityMode: 'successes', minSuccessPoints10m: '2', minConsecutiveSuccesses10m: 0 });
  assert.equal(config.availabilityMode, 'successes');
  assert.equal(config.minSuccessPoints10m, 2);
  assert.equal(config.minConsecutiveSuccesses10m, 1);
  assert.equal(core.normalizeConfig({ availabilityMode: 'unknown' }).availabilityMode, 'percent');
});

test('normalizes the selectable TTFT source and preserves the legacy default', () => {
  assert.equal(core.DEFAULT_CONFIG.latencySource, 'probe');
  assert.equal(core.normalizeConfig({}).latencySource, 'probe');
  assert.equal(core.normalizeConfig({ latencySource: 'user' }).latencySource, 'user');
  assert.equal(core.normalizeConfig({ latencySource: 'unexpected' }).latencySource, 'probe');
});

test('normalizes model price and usage cost audit settings', () => {
  assert.equal(core.DEFAULT_CONFIG.modelPriceModel, 'sol');
  assert.equal(core.DEFAULT_CONFIG.usageCostAuditEnabled, true);
  assert.equal(core.DEFAULT_CONFIG.usageCostAuditDisplay, 'anomalies');
  assert.equal(core.DEFAULT_CONFIG.usageCostAuditTolerancePercent, 1);

  const config = core.normalizeConfig({
    modelPriceModel: 'terra',
    usageCostAuditEnabled: false,
    usageCostAuditDisplay: 'all',
    usageCostAuditTolerancePercent: 0,
  });
  assert.equal(config.modelPriceModel, 'terra');
  assert.equal(config.usageCostAuditEnabled, false);
  assert.equal(config.usageCostAuditDisplay, 'all');
  assert.equal(config.usageCostAuditTolerancePercent, 0.1);
  assert.equal(core.normalizeConfig({ modelPriceModel: 'unexpected' }).modelPriceModel, 'sol');
  assert.equal(core.normalizeConfig({ usageCostAuditDisplay: 'unexpected' }).usageCostAuditDisplay, 'anomalies');
  assert.equal(core.normalizeConfig({ usageCostAuditTolerancePercent: 999 }).usageCostAuditTolerancePercent, 100);
});

test('defaults provider hall auto sorting to multiplier priority', () => {
  assert.equal(core.DEFAULT_CONFIG.providerSortPreference, 'rate');
  assert.equal(core.DEFAULT_CONFIG.providerAutoRefresh, true);
  assert.equal(core.DEFAULT_CONFIG.providerRefreshIntervalSeconds, 60);
  assert.equal(core.normalizeConfig({}).providerSortPreference, 'rate');
  assert.equal(core.normalizeProviderSortPreference('default'), 'default');
  assert.equal(core.normalizeProviderSortPreference('user'), 'user');
  assert.equal(core.normalizeProviderSortPreference('unexpected'), 'rate');
  assert.equal(core.normalizeConfig({ providerAutoRefresh: false }).providerAutoRefresh, false);
  assert.equal(core.normalizeConfig({ providerRefreshIntervalSeconds: 2 }).providerRefreshIntervalSeconds, 15);
  assert.equal(core.normalizeConfig({ providerRefreshIntervalSeconds: 9999 }).providerRefreshIntervalSeconds, 3600);
});

test('finds the requested provider hall sort button without matching table headers', () => {
  const buttons = [
    { textContent: '默认 ↓' },
    { textContent: '倍率' },
    { textContent: '用户速度 ↑' },
  ];
  assert.equal(core.findProviderSortButton(buttons, 'rate'), buttons[1]);
  assert.equal(core.findProviderSortButton(buttons, 'default'), buttons[0]);
  assert.equal(core.findProviderSortButton(buttons, 'user'), buttons[2]);
});

test('finds only the native provider hall refresh button', () => {
  const buttons = [
    { textContent: '检测' },
    { textContent: '刷新' },
    { textContent: ' 刷新中 ' },
  ];
  assert.equal(core.findProviderRefreshButton(buttons), buttons[1]);
  assert.equal(core.findProviderRefreshButton([{ textContent: '检测' }]), null);
});

test('normalizes the new provider summary response and keeps both TTFT metrics', () => {
  const summary = core.normalizeMonitorSummaryPayload({
    data: {
      generated_at: '2026-08-05T20:00:00Z',
      items: [{
        code: 'A001-Plus',
        group_id: 34,
        rate_multiplier: 0.06,
        visible_in_hall: true,
        available: true,
        probe_ttft_ms: 4373,
        probe_e2e_ttft_ms: 4500,
        user_avg_ttft_ms: 6085.5,
        user_sample_count: 16,
        user_has_data: true,
        success_rates: { '5m': 1 },
        last_probed_at: '2026-08-05T19:59:00Z',
      }],
    },
  });

  assert.equal(summary.generatedAt, '2026-08-05T20:00:00Z');
  assert.deepEqual(summary.apis.map((row) => ({
    id: row.id,
    planType: row.planType,
    priceMultiplier: row.priceMultiplier,
    probe: row.probeFirstTokenLatencyMs,
    user: row.userAvgTtftMs,
    samples: row.userSampleCount,
  })), [{ id: 34, planType: 'A001-Plus', priceMultiplier: 0.06, probe: 4373, user: 6085.5, samples: 16 }]);
});

test('normalizes the new cache, model health, and model detection fields', () => {
  const summary = core.normalizeMonitorSummaryPayload({ data: {
    items: [{
      code: 'A001-Plus',
      group_id: 34,
      rate_multiplier: 0.06,
      available: true,
      cache_hit_rate: '65.50%',
      model_health: { sol: 'healthy', terra: 'healthy', luna: 'failed' },
      model_detection: { status: 'insufficient_evidence', applicable: true },
    }],
  } });
  const row = summary.apis[0];

  assert.equal(row.cacheHitRate, 0.655);
  assert.deepEqual(row.modelHealth, { sol: 'healthy', terra: 'healthy', luna: 'failed' });
  assert.equal(row.modelDetection.status, 'insufficient_evidence');
  assert.equal(row.warningReasons.includes('model_detection_insufficient_evidence'), true);
  assert.deepEqual(core.summarizeModelHealth(row.modelHealth), {
    health: { sol: 'healthy', terra: 'healthy', luna: 'failed' },
    healthy: 2,
    failed: 1,
    insufficient: 0,
    unknown: 0,
    total: 3,
  });
});

test('keeps insufficient model health distinct from healthy and failed states', () => {
  const health = core.normalizeModelHealth({ sol: 'insufficient', terra: 'insufficient', luna: 'insufficient' });

  assert.deepEqual(health, { sol: 'insufficient', terra: 'insufficient', luna: 'insufficient' });
  assert.deepEqual(core.summarizeModelHealth(health), {
    health,
    healthy: 0,
    failed: 0,
    insufficient: 3,
    unknown: 0,
    total: 3,
  });
  assert.equal(core.formatModelHealthSummary(health), '模型健康：证据不足 3/3');
  assert.equal(core.formatModelHealthSummary(null), '');
});

test('parses cache hit rates from percentages and decimals', () => {
  assert.equal(core.normalizeCacheHitRate('65.50%'), 0.655);
  assert.equal(core.normalizeCacheHitRate(0.25), 0.25);
  assert.equal(core.normalizeCacheHitRate(25), 0.25);
  assert.equal(core.normalizeCacheHitRate('bad'), null);
  assert.equal(core.formatCacheHitRate('65.50%'), '缓存命中率 65.5%');
});

test('normalizes model prices across API casing and field conventions', () => {
  assert.deepEqual(core.normalizeModelPrices({
    SOL: {
      input_per_million: '0.65',
      cache_input_per_million: 0.065,
      output_per_million: 3.9,
    },
    Terra: {
      inputPerMillion: 0.7,
      cacheInputPerMillion: 'invalid',
      outputPerMillion: -1,
    },
    luna: 'invalid',
  }), {
    sol: {
      inputPerMillion: 0.65,
      cacheInputPerMillion: 0.065,
      outputPerMillion: 3.9,
    },
    terra: {
      inputPerMillion: 0.7,
      cacheInputPerMillion: null,
      outputPerMillion: null,
    },
  });
  assert.equal(core.normalizeModelPrices(null), null);
  assert.equal(core.normalizeModelPrices([]), null);
  assert.equal(core.normalizeModelPrices({ sol: { input_per_million: 'invalid' } }), null);
});

test('formats selected model prices in full and compact forms', () => {
  const row = {
    model_prices: {
      sol: {
        input_per_million: 0.65,
        cache_input_per_million: 0.065,
        output_per_million: 3.9,
      },
      terra: {
        input_per_million: 0.7,
        output_per_million: 4.2,
      },
    },
  };

  assert.equal(core.formatModelPriceSummary(row, 'sol'), 'Sol 每 1M：输入 $0.65 · 缓存输入 $0.065 · 输出 $3.90');
  assert.equal(core.formatModelPriceSummary(row, 'sol', true), 'Sol 入 $0.65 / 缓 $0.065 / 出 $3.90');
  assert.equal(core.formatModelPriceSummary(row, 'terra'), 'Terra 每 1M：输入 $0.70 · 输出 $4.20');
  assert.equal(core.formatModelPriceSummary(row, 'luna'), '');
  assert.equal(core.formatModelPriceSummary(row, 'none'), '');
});

test('normalizes the new provider series response for availability and user freshness', () => {
  const at = Date.parse('2026-08-05T19:59:00Z');
  const series = core.normalizeMonitorSeriesPayload({ data: {
    generated_at: '2026-08-05T20:00:00Z',
    items: [{ group_id: 34, probe: [[at, 1]], user_ttft: [{ at: '2026-08-05T19:58:00Z', avg_ttft_ms: 6000, sample_count: 3, has_data: true }] }],
  } });

  assert.deepEqual(series.seriesByApiId['34'], [[at, 1]]);
  assert.equal(series.userTtftByGroupId['34'][0].sample_count, 3);
  assert.equal(core.getLatestMonitorSampleAt(series), at);
});

test('deduplicates concurrent and short-lived provider summary requests', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  let requestCount = 0;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    fetch: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [{ group_id: 1, code: 'shared' }] } }),
      };
    },
  };
  core.clearMonitorSummaryCache();

  try {
    const [left, right] = await Promise.all([core.fetchMonitorSummary(), core.fetchMonitorSummary()]);
    const cached = await core.fetchMonitorSummary();
    assert.equal(requestCount, 1);
    assert.equal(left, right);
    assert.equal(cached, left);

    await core.fetchMonitorSummary({ force: true });
    assert.equal(requestCount, 2);
  } finally {
    core.clearMonitorSummaryCache();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('joins an in-flight forced provider refresh instead of returning stale cache', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  let requestCount = 0;
  let resolveRefresh;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    fetch: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return { ok: true, status: 200, json: async () => ({ data: { items: [{ group_id: 1, code: 'v1' }] } }) };
      }
      return new Promise((resolve) => { resolveRefresh = resolve; });
    },
  };
  core.clearMonitorSummaryCache();

  try {
    const cached = await core.fetchMonitorSummary();
    const forced = core.fetchMonitorSummary({ force: true });
    await Promise.resolve();
    const joined = core.fetchMonitorSummary();
    assert.equal(requestCount, 2);
    assert.equal(cached.apis[0].planType, 'v1');

    resolveRefresh({ ok: true, status: 200, json: async () => ({ data: { items: [{ group_id: 1, code: 'v2' }] } }) });
    const [fresh, shared] = await Promise.all([forced, joined]);
    assert.equal(fresh, shared);
    assert.equal(fresh.apis[0].planType, 'v2');
  } finally {
    core.clearMonitorSummaryCache();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('clears a timed-out shared provider request so a later call can retry', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  let requestCount = 0;
  let succeed = false;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    fetch: async (_url, options) => {
      requestCount += 1;
      if (succeed) return { ok: true, status: 200, json: async () => ({ data: { items: [{ group_id: 1, code: 'retry' }] } }) };
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  };
  core.clearMonitorSummaryCache();

  try {
    await assert.rejects(core.fetchMonitorSummary({ force: true, timeoutMs: 5 }), /请求超时/);
    assert.equal(requestCount, 2);
    succeed = true;
    const retried = await core.fetchMonitorSummary({ force: true, timeoutMs: 5 });
    assert.equal(requestCount, 3);
    assert.equal(retried.apis[0].planType, 'retry');
  } finally {
    core.clearMonitorSummaryCache();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('selects real-user TTFT when sampled and falls back to probe TTFT without samples', () => {
  const sampled = { firstTokenLatencyMs: 900, userAvgTtftMs: 1200, userSampleCount: 8, userHasData: true };
  const empty = { firstTokenLatencyMs: 900, userAvgTtftMs: 0, userSampleCount: 0, userHasData: false };

  assert.deepEqual(core.getLatencyMetric(sampled, 'user'), { value: 1200, source: 'user', fallback: false });
  assert.deepEqual(core.getLatencyMetric(empty, 'user'), { value: 900, source: 'probe', fallback: true });
  assert.equal(core.formatLatencyMetric(empty, 'user'), '用户平均 TTFT 900 ms（回退探测）');
});

test('normalizes the monitor freshness limit', () => {
  assert.equal(core.DEFAULT_CONFIG.maxMonitorAgeSeconds, 600);
  assert.equal(core.normalizeConfig({ maxMonitorAgeSeconds: '240' }).maxMonitorAgeSeconds, 600);
  assert.equal(core.normalizeConfig({ maxMonitorAgeSeconds: 1 }).maxMonitorAgeSeconds, 600);
  assert.equal(core.normalizeConfig({ maxMonitorAgeSeconds: 9999 }).maxMonitorAgeSeconds, 600);
});

test('uses the latest actual monitor sample as the freshness timestamp', () => {
  assert.equal(core.getLatestMonitorSampleAt({
    generatedAt: '2026-07-22T05:10:00Z',
    seriesByApiId: {
      one: [[Date.parse('2026-07-22T05:04:00Z'), 1], [Date.parse('2026-07-22T05:09:00Z'), 0]],
      two: [[Date.parse('2026-07-22T05:08:00Z'), 1]],
    },
  }), Date.parse('2026-07-22T05:09:00Z'));
  assert.equal(core.getLatestMonitorSampleAt({ generatedAt: '2026-07-22T05:10:00Z', seriesByApiId: {} }), null);
});

test('preserves decimal cooldowns and normalizes excluded group keywords', () => {
  const config = core.normalizeConfig({ cooldownMinutes: '0.1', excludedGroupKeywords: ' free | Test |free ' });

  assert.equal(config.cooldownMinutes, 0.1);
  assert.equal(config.excludedGroupKeywords, 'free|test');
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

test('excludes groups whose names contain configured keywords', () => {
  const rows = [
    { planType: 'free-fast', group_id: 1, priceMultiplier: 0.01, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 50, warningReasons: [] },
    { planType: 'Paid-Standard', group_id: 2, priceMultiplier: 0.02, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100, warningReasons: [] },
    { planType: 'premium', group_id: 3, priceMultiplier: 0.03, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 150, warningReasons: [] },
  ];

  const ranked = core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, excludedGroupKeywords: 'free|PREMIUM' });

  assert.deepEqual(ranked.map((row) => row.planType), ['Paid-Standard']);
});

test('previews excluded group keyword matches case-insensitively', () => {
  const info = core.getExcludedGroupInfo([
    { planType: 'Free-Fast' },
    { name: 'stable' },
    { planType: 'unstable-test' },
    { planType: 'paid' },
  ], ' free | unstable | free ');
  assert.deepEqual(info.keywords, ['free', 'unstable']);
  assert.deepEqual(info.matches.map((row) => row.name), ['Free-Fast', 'unstable-test']);
});

test('reports mutually exclusive candidate diagnostics', () => {
  const rows = [
    { planType: 'invalid', group_id: 'x', priceMultiplier: 0.01 },
    { planType: 'disabled', group_id: 1, priceMultiplier: 0.01, enabled: false, available: true, successRates: { '10m': 1 } },
    { planType: 'unavailable', group_id: 2, priceMultiplier: 0.01, available: false, successRates: { '10m': 1 } },
    { planType: 'low', group_id: 3, priceMultiplier: 0.01, available: true, successRates: { '10m': 0.01 } },
    { planType: 'warning', group_id: 4, priceMultiplier: 0.01, available: true, successRates: { '10m': 1 }, warningReasons: ['warning'] },
    { planType: 'free-fast', group_id: 5, priceMultiplier: 0.01, available: true, successRates: { '10m': 1 }, warningReasons: [] },
    { planType: 'eligible', group_id: 6, priceMultiplier: 0.02, available: true, successRates: { '10m': 1 }, warningReasons: [] },
  ];
  const result = core.analyzeCandidates(rows, { ...core.DEFAULT_CONFIG, excludedGroupKeywords: 'free' });
  assert.deepEqual(result.counts, { total: 7, invalid: 1, unavailable: 2, lowSuccess: 1, warnings: 1, keywords: 1, eligible: 1 });
  assert.deepEqual(result.candidates.map((row) => row.name), ['eligible']);
});

test('formats monitor freshness and treats invalid timestamps as stale', () => {
  const now = Date.parse('2026-07-22T05:10:00Z');
  assert.deepEqual(core.getMonitorFreshness(new Date(now - 42_000).toISOString(), now, 180), {
    generatedAt: now - 42_000, ageMs: 42_000, stale: false, label: '42 秒前',
  });
  assert.equal(core.getMonitorFreshness(new Date(now - 181_000).toISOString(), now, 180).stale, true);
  assert.equal(core.getMonitorFreshness('bad timestamp', now, 180).label, '时间未知');
  assert.equal(core.getMonitorFreshness('bad timestamp', now, 180).stale, true);
});

test('reports fractional cooldown remaining time', () => {
  assert.deepEqual(core.getCooldownInfo(1_000, 0.1, 4_000), { remainingMs: 3_000, active: true, label: '剩余 3 秒' });
  assert.equal(core.getCooldownInfo(1_000, 0.1, 7_000).active, false);
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
  assert.equal(enriched[0].recentSuccessCount, 1);
  assert.equal(enriched[0].recentConsecutiveSuccessCount, 0);
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

test('treats explicit insufficient model evidence as a monitor warning', () => {
  const rows = [{
    planType: 'evidence-gap', group_id: 8, priceMultiplier: 0.01, available: true,
    successRates: { '10m': 1 }, model_detection: { status: 'insufficient_evidence' },
  }];
  assert.deepEqual(core.rankCandidates(rows, core.DEFAULT_CONFIG), []);
  assert.deepEqual(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, requireNoWarnings: false }).map((row) => row.name), ['evidence-gap']);
});

test('normalizes and excludes all explicit non-passing model detection states', () => {
  const cases = [
    ['detection_failed', 'failed', '检测失败'],
    ['suspected', 'suspected', '疑似'],
    ['not_tested', 'not_tested', '未检测'],
    ['skipped', 'not_tested', '未检测'],
    ['future_review_state', 'future_review_state', '检测未知'],
  ];

  for (const [rawStatus, normalizedStatus, label] of cases) {
    const row = {
      planType: rawStatus,
      group_id: 8,
      priceMultiplier: 0.01,
      available: true,
      successRates: { '10m': 1 },
      model_detection: { status: rawStatus, applicable: true },
    };
    assert.equal(core.normalizeModelDetection(row.model_detection).status, normalizedStatus);
    assert.equal(core.getModelDetectionLabel(row), label);
    assert.equal(core.hasModelDetectionWarning(row), true);
    assert.deepEqual(core.rankCandidates([row], core.DEFAULT_CONFIG), []);
  }
});

test('fails closed for incomplete applicable detections while preserving missing-field compatibility', () => {
  const incomplete = {
    planType: 'incomplete', group_id: 1, priceMultiplier: 0.01, available: true,
    successRates: { '10m': 1 }, model_detection: { applicable: true },
  };

  assert.equal(core.getModelDetectionLabel(incomplete), '检测未知');
  assert.equal(core.hasModelDetectionWarning(incomplete), true);
  assert.equal(core.normalizeMonitorRow(incomplete).warningReasons.includes('model_detection_unknown'), true);
  assert.deepEqual(core.rankCandidates([incomplete], core.DEFAULT_CONFIG), []);

  const missing = { ...incomplete };
  delete missing.model_detection;
  assert.equal(core.getModelDetectionLabel(missing), '');
  assert.equal(core.hasModelDetectionWarning(missing), false);
  assert.equal(core.rankCandidates([missing], core.DEFAULT_CONFIG).length, 1);
});

test('preserves legacy candidate behavior when model detection is missing or not applicable', () => {
  const rows = [
    {
      planType: 'legacy', group_id: 1, priceMultiplier: 0.01, available: true,
      successRates: { '10m': 1 },
    },
    {
      planType: 'not-applicable', group_id: 2, priceMultiplier: 0.02, available: true,
      successRates: { '10m': 1 }, model_detection: { status: 'not_applicable', applicable: false },
    },
  ];

  assert.equal(core.hasModelDetectionWarning(rows[0]), false);
  assert.equal(core.hasModelDetectionWarning(rows[1]), false);
  assert.deepEqual(core.rankCandidates(rows, core.DEFAULT_CONFIG).map((row) => row.name), ['legacy', 'not-applicable']);
});

test('adds normalized warning reasons for new model detection states', () => {
  const failed = core.normalizeMonitorRow({ model_detection: { status: 'detection_failed' } });
  const suspected = core.normalizeMonitorRow({ model_detection: { status: 'suspected' } });
  const untested = core.normalizeMonitorRow({ model_detection: { status: 'not_tested' } });

  assert.equal(failed.warningReasons.includes('model_detection_failed'), true);
  assert.equal(suspected.warningReasons.includes('model_detection_suspected'), true);
  assert.equal(untested.warningReasons.includes('model_detection_not_tested'), true);
});

test('uses nested model detection instead of a provider row status', () => {
  const activeProvider = { status: 'active', model_detection: { status: 'passed' } };
  const failedProviderStatus = { status: 'failed', model_detection: { status: 'passed' } };

  assert.equal(core.getModelDetectionLabel(activeProvider), '检测通过');
  assert.equal(core.getModelDetectionLabel(failedProviderStatus), '检测通过');
  assert.equal(core.hasModelDetectionWarning(failedProviderStatus), false);
});

test('changes speed ranking when real-user TTFT collection is selected', () => {
  const rows = [
    { planType: 'probe-fast', group_id: 1, priceMultiplier: 0.05, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100, userAvgTtftMs: 2000, userSampleCount: 5, userHasData: true, warningReasons: [] },
    { planType: 'user-fast', group_id: 2, priceMultiplier: 0.05, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 500, userAvgTtftMs: 300, userSampleCount: 5, userHasData: true, warningReasons: [] },
  ];

  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'speed', latencySource: 'probe' })[0].planType, 'probe-fast');
  assert.equal(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, mode: 'speed', latencySource: 'user' })[0].planType, 'user-fast');
});

test('normalizes adjustable AIHub mode settings', () => {
  const config = core.normalizeConfig({ mode: 'balance', balanceMaxPrice: '0.1', balancePricePercent: 500 });
  assert.equal(config.mode, 'balance');
  assert.equal(config.balanceMaxPrice, 0.1);
  assert.equal(Object.hasOwn(config, 'balancePricePercent'), false);
  assert.equal(core.normalizeConfig({ mode: 'unknown', balanceMaxPrice: 9999 }).mode, 'price');
  assert.equal(core.normalizeConfig({ mode: 'unknown', balanceMaxPrice: 9999 }).balanceMaxPrice, 1000);
});

test('normalizes the side panel tab to settings or logs', () => {
  assert.equal(core.normalizePanelTab('settings'), 'settings');
  assert.equal(core.normalizePanelTab('logs'), 'logs');
  assert.equal(core.normalizePanelTab('unknown'), 'settings');
  assert.equal(core.normalizePanelTab(), 'settings');
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

test('applies fractional cooldowns without rounding to zero', () => {
  const config = { ...core.DEFAULT_CONFIG, cooldownMinutes: 0.1 };
  assert.equal(core.canAutoSwitch({ now: 6_499, lastSwitchAt: 500, currentGroupId: 1, targetGroupId: 2, stable: true, config }), false);
  assert.equal(core.canAutoSwitch({ now: 6_500, lastSwitchAt: 500, currentGroupId: 1, targetGroupId: 2, stable: true, config }), true);
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
  assert.equal(core.getAutoSwitchBlockReason({ ...ready, now: 1_000 }), '切换冷却中（剩余 10 分钟）');
  assert.equal(core.getAutoSwitchBlockReason({ ...ready, monitorStale: true, monitorFreshnessText: '4 分钟前' }), '监控数据已过期（4 分钟前）');
});

test('blocks manual switching when monitor data is stale', () => {
  const ready = { loading: false, error: '', authError: '', winner: { groupId: 2 }, key: { groupId: 1 }, stability: { stable: true, count: 2 }, requiredChecks: 2 };
  assert.equal(core.getSwitchBlockReason({ ...ready, monitorStale: true, monitorFreshnessText: '4 分钟前' }), '监控数据已过期（4 分钟前）');
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
  assert.deepEqual(core.buildApiHeaders('/auth/me?timezone=Asia%2FShanghai', 'token-value'), {
    Authorization: 'Bearer token-value',
    'X-User-UI-Request': '1',
  });
});

test('filters by successful monitor points or trailing consecutive points', () => {
  const rows = [
    { planType: 'two-successes', group_id: 1, priceMultiplier: 0.01, available: true, successRates: { '10m': 0.5 }, recentSampleCount: 4, recentSuccessCount: 2, recentConsecutiveSuccessCount: 1, warningReasons: [] },
    { planType: 'two-trailing', group_id: 2, priceMultiplier: 0.02, available: true, successRates: { '10m': 0.5 }, recentSampleCount: 4, recentSuccessCount: 2, recentConsecutiveSuccessCount: 2, warningReasons: [] },
  ];
  assert.deepEqual(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, availabilityMode: 'successes', minSuccessPoints10m: 2 }).map((row) => row.planType), ['two-successes', 'two-trailing']);
  assert.deepEqual(core.rankCandidates(rows, { ...core.DEFAULT_CONFIG, availabilityMode: 'consecutive', minConsecutiveSuccesses10m: 2 }).map((row) => row.planType), ['two-trailing']);
});

test('extracts and formats positive or negative balances without exposing unrelated account data', () => {
  assert.equal(core.getBalanceAmount({ data: { balance: '2.42650019', email: 'private@example.com' } }), 2.42650019);
  assert.equal(core.getBalanceAmount({ data: { balance: -1 } }), -1);
  assert.equal(core.getBalanceAmount({ data: { balance: 'unknown' } }), null);
  assert.equal(core.formatBalance(2.42650019), '2.4265');
  assert.equal(core.formatBalance(-0.0153996), '-0.0154');
  assert.equal(core.formatBalance(Number.NaN), '暂无数据');
});

test('merges paginated API key responses without duplicates', () => {
  const merged = core.mergeKeyPages([
    { items: [{ id: 1 }, { id: 2 }], pages: 2 },
    { items: [{ id: 2 }, { id: 3 }], pages: 2 },
  ]);
  assert.deepEqual(merged.map((key) => key.id), [1, 2, 3]);
});

test('refreshes keys when empty, forced, or older than five minutes', () => {
  const intervalMs = 5 * 60 * 1000;
  assert.equal(core.shouldRefreshKeys({ now: 1_000, lastFetchedAt: 0, keyCount: 0, intervalMs }), true);
  assert.equal(core.shouldRefreshKeys({ now: intervalMs + 1, lastFetchedAt: 1, keyCount: 2, intervalMs }), true);
  assert.equal(core.shouldRefreshKeys({ now: 10, lastFetchedAt: 1, keyCount: 2, intervalMs, force: true }), true);
  assert.equal(core.shouldRefreshKeys({ now: 10, lastFetchedAt: 1, keyCount: 2, intervalMs }), false);
});

test('uses the last completed refresh time to suppress adjacent foreground refreshes', () => {
  const completedAt = 10_000;
  const intervalMs = 30_000;

  assert.equal(core.isRefreshDue(completedAt + intervalMs - 1, completedAt, intervalMs), false);
  assert.equal(core.isRefreshDue(completedAt + intervalMs, completedAt, intervalMs), true);
  assert.equal(core.isRefreshDue(completedAt + intervalMs + 1, completedAt, intervalMs), true);
  assert.equal(core.isRefreshDue(completedAt, 0, intervalMs), true);
});

test('runs controller polling when expanded and due', () => {
  assert.equal(core.shouldRunControllerRefresh({
    active: true,
    visible: true,
    minimized: false,
    autoSwitch: false,
    loading: false,
    now: 40_000,
    lastCompletedAt: 10_000,
    intervalMs: 30_000,
  }), true);
});

test('pauses minimized controller polling unless automatic switching is enabled', () => {
  const dueState = {
    active: true,
    visible: true,
    minimized: true,
    loading: false,
    now: 40_000,
    lastCompletedAt: 10_000,
    intervalMs: 30_000,
  };

  assert.equal(core.shouldRunControllerRefresh({ ...dueState, autoSwitch: false }), false);
  assert.equal(core.shouldRunControllerRefresh({ ...dueState, autoSwitch: true }), true);
});

test('does not duplicate a foreground controller refresh before the completion interval elapses', () => {
  const recentlyCompleted = {
    active: true,
    visible: true,
    minimized: false,
    autoSwitch: false,
    loading: false,
    now: 39_999,
    lastCompletedAt: 10_000,
    intervalMs: 30_000,
  };

  assert.equal(core.shouldRunControllerRefresh(recentlyCompleted), false);
  assert.equal(core.shouldRunControllerRefresh({ ...recentlyCompleted, now: 40_000 }), true);
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
    { group_id: 21, priceMultiplier: null, firstTokenLatencyMs: null },
    { group_id: 'invalid', priceMultiplier: 0.01, firstTokenLatencyMs: 10 },
  ]);

  assert.deepEqual(metrics.get(14), { multiplier: 0.04, latencyMs: 1141 });
  assert.deepEqual(metrics.get(20), { multiplier: 0.08, latencyMs: 320 });
  assert.deepEqual(metrics.get(21), { multiplier: null, latencyMs: null });
  assert.equal(metrics.has('same-name'), false);
  assert.equal(metrics.size, 3);
});

test('indexes dropdown monitor rows by normalized name and multiplier', () => {
  const rows = [
    { planType: ' Same Group ', priceMultiplier: 0.04, available: true, firstTokenLatencyMs: 800 },
    { planType: 'same group', priceMultiplier: 0.08, available: false, firstTokenLatencyMs: 1600 },
    { planType: 'Unique', priceMultiplier: 0.1, available: true, firstTokenLatencyMs: 500 },
  ];
  const index = core.buildGroupDropdownMonitorIndex(rows);

  assert.equal(core.findGroupDropdownMonitor(index, 'Same Group', 0.08), rows[1]);
  assert.equal(core.findGroupDropdownMonitor(index, 'Unique', null), rows[2]);
  assert.equal(core.findGroupDropdownMonitor(index, 'same group', null), null);
});

test('uses the newest monitor row when a composite key is duplicated', () => {
  const oldRow = { planType: 'Duplicate', priceMultiplier: 0.1, checkedAt: '2026-07-23T00:00:00Z', available: false };
  const newRow = { planType: 'Duplicate', priceMultiplier: 0.1, checkedAt: '2026-07-23T01:00:00Z', available: true };
  const index = core.buildGroupDropdownMonitorIndex([oldRow, newRow, { planType: 'No Rate', priceMultiplier: null }]);

  assert.equal(core.findGroupDropdownMonitor(index, 'Duplicate', 0.1), newRow);
  assert.equal(index.byComposite.has('no rate|0.000000'), false);
});

test('parses the multiplier displayed by native group options', () => {
  assert.equal(core.parseGroupOptionMultiplier('0.06x 倍率'), 0.06);
  assert.equal(core.parseGroupOptionMultiplier('×0.012345'), 0.012345);
  assert.equal(core.parseGroupOptionMultiplier('暂无倍率'), null);
});

test('formats dropdown status and first token metrics', () => {
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, enabled: true, warningReasons: [], firstTokenLatencyMs: 1227 }), {
    statusText: '可用',
    statusTone: 'available',
    latencyText: '首 Token 1227 ms',
    latencyValueText: '1227 ms',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, enabled: true, warningReasons: ['warning'], firstTokenLatencyMs: 9.6 }), {
    statusText: '可用 · 有警告',
    statusTone: 'warning',
    latencyText: '首 Token 10 ms',
    latencyValueText: '10 ms',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: false, enabled: true, firstTokenLatencyMs: null }), {
    statusText: '不可用',
    statusTone: 'unavailable',
    latencyText: '首 Token 暂无数据',
    latencyValueText: '',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, enabled: false, firstTokenLatencyMs: 100 }), {
    statusText: '已停用',
    statusTone: 'disabled',
    latencyText: '首 Token 100 ms',
    latencyValueText: '100 ms',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor(null), {
    statusText: '暂无监控',
    statusTone: 'unknown',
    latencyText: '首 Token 暂无数据',
    latencyValueText: '',
  });
});

test('formats explicit model detection states in dropdown status', () => {
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, warningReasons: [], model_detection: { status: 'passed' } }), {
    statusText: '可用 · 检测通过', statusTone: 'available', latencyText: '首 Token 暂无数据', latencyValueText: '',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, warningReasons: [], model_detection: { status: 'insufficient_evidence' } }), {
    statusText: '可用 · 证据不足', statusTone: 'warning', latencyText: '首 Token 暂无数据', latencyValueText: '',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, warningReasons: [], model_detection: { status: 'suspected' } }), {
    statusText: '可用 · 疑似', statusTone: 'warning', latencyText: '首 Token 暂无数据', latencyValueText: '',
  });
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, warningReasons: [], model_detection: { status: 'not_tested' } }), {
    statusText: '可用 · 未检测', statusTone: 'warning', latencyText: '首 Token 暂无数据', latencyValueText: '',
  });
  assert.equal(core.getModelDetectionLabel({ applicable: false, status: 'not_applicable' }), '不适用');
  assert.equal(core.getModelDetectionLabel({ applicable: false, status: 'failed' }), '不适用');
  assert.deepEqual(core.formatGroupDropdownMonitor({ available: true, warningReasons: [], model_detection: { status: 'failed', applicable: false } }), {
    statusText: '可用 · 不适用', statusTone: 'available', latencyText: '首 Token 暂无数据', latencyValueText: '',
  });
  assert.equal(core.hasModelDetectionWarning({ model_detection: { applicable: false, status: 'failed' } }), false);
});

test('formats dropdown and key labels with the real-user TTFT source', () => {
  const row = { available: true, userAvgTtftMs: 1384.6, userSampleCount: 12, userHasData: true };
  assert.deepEqual(core.formatGroupDropdownMonitor(row, 'user'), {
    statusText: '可用',
    statusTone: 'available',
    latencyText: '用户平均 TTFT 1385 ms',
    latencyValueText: '1385 ms',
  });
  assert.equal(core.formatKeyOptionLabel({ name: 'main', groupName: 'A001' }, { multiplier: 0.05, latencyMs: 1384.6 }, 'user'), 'main · A001 · ×0.05 · 用户平均 TTFT 1385 ms');
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

test('parses exact and compact token counts', () => {
  assert.equal(core.parseCompactTokenCount('14,735'), 14735);
  assert.equal(core.parseCompactTokenCount('181.6K'), 181600);
  assert.equal(core.parseCompactTokenCount('2.6m'), 2600000);
  assert.equal(core.parseCompactTokenCount('1B'), 1000000000);
  assert.equal(core.parseCompactTokenCount('0'), 0);
  assert.equal(core.parseCompactTokenCount('-1'), null);
  assert.equal(core.parseCompactTokenCount('12 tokens'), null);
  assert.equal(core.parseCompactTokenCount(''), null);
  assert.equal(core.getCompactTokenRoundingUncertainty('14,735'), 0);
  assert.equal(core.getCompactTokenRoundingUncertainty('181.6K'), 50);
  assert.equal(core.getCompactTokenRoundingUncertainty('2.6M'), 50000);
  assert.equal(core.getCompactTokenRoundingUncertainty('1B'), 500000000);
});

test('parses two or three usage token values and rejects four-item rows', () => {
  assert.deepEqual(core.parseUsageTokenBreakdown(['14,735', '40']), {
    inputTokens: 14735,
    outputTokens: 40,
    cacheInputTokens: 0,
  });
  assert.deepEqual(core.parseUsageTokenBreakdown('8,280\n673\n181.6K'), {
    inputTokens: 8280,
    outputTokens: 673,
    cacheInputTokens: 181600,
  });
  assert.equal(core.parseUsageTokenBreakdown(['1', '2', '3', '4']), null);
  assert.equal(core.parseUsageTokenBreakdown(['1']), null);
});

test('recognizes exactly one supported usage model variant', () => {
  assert.equal(core.getUsageModelVariant('gpt-5.6-sol'), 'sol');
  assert.equal(core.getUsageModelVariant('GPT_5.6_TERRA'), 'terra');
  assert.equal(core.getUsageModelVariant('gpt/5.6/luna-preview'), 'luna');
  assert.equal(core.getUsageModelVariant('gpt-5.6'), null);
  assert.equal(core.getUsageModelVariant('gpt-sol-terra'), null);
  assert.equal(core.getUsageModelVariant('consolation'), null);
});

test('indexes usage prices by normalized group name and exact historical multiplier', () => {
  const index = core.buildUsageModelPriceIndex([
    {
      planType: ' A003-Plus ',
      priceMultiplier: 0.11,
      model_prices: {
        sol: { input_per_million: 0.65, cache_input_per_million: 0.065, output_per_million: 3.9 },
      },
    },
    {
      planType: 'A003-Plus',
      priceMultiplier: 0.12,
      model_prices: {
        sol: { input_per_million: 0.7, cache_input_per_million: 0.07, output_per_million: 4.2 },
      },
    },
  ]);

  assert.deepEqual(core.findUsageModelPrice(index, 'a003-plus', 0.11, 'sol'), {
    inputPerMillion: 0.65,
    cacheInputPerMillion: 0.065,
    outputPerMillion: 3.9,
  });
  assert.deepEqual(core.findUsageModelPrice(index, ' A003-PLUS ', 0.12, 'sol'), {
    inputPerMillion: 0.7,
    cacheInputPerMillion: 0.07,
    outputPerMillion: 4.2,
  });
  assert.equal(core.findUsageModelPrice(index, 'A003-Plus', 0.1, 'sol'), null);
  assert.equal(core.findUsageModelPrice(index, 'A003-Plus', null, 'sol'), null);
  assert.equal(core.findUsageModelPrice(index, 'A003-Plus', 0.11, 'unknown'), null);
});

test('calculates usage cost for Sol, Terra, and Luna prices', () => {
  const tokens = { inputTokens: 1000000, outputTokens: 1000000, cacheInputTokens: 1000000 };
  const cases = [
    [{ inputPerMillion: 0.65, cacheInputPerMillion: 0.065, outputPerMillion: 3.9 }, 4.615],
    [{ inputPerMillion: 0.7, cacheInputPerMillion: 0.07, outputPerMillion: 4.2 }, 4.97],
    [{ inputPerMillion: 0.8, cacheInputPerMillion: 0.08, outputPerMillion: 4.8 }, 5.68],
  ];

  for (const [price, expected] of cases) {
    assert.ok(Math.abs(core.calculateUsageCost(tokens, price) - expected) < 1e-12);
  }
  assert.equal(core.calculateUsageCost(tokens, { inputPerMillion: 1 }), null);
  assert.equal(core.parseUsageCost('$0.016765'), 0.016765);
  assert.equal(core.parseUsageCost('0.016765'), null);
  assert.equal(core.formatUsageCost(0.0167629), '$0.0167629');
  assert.ok(Math.abs(core.calculateUsageCostRoundingTolerance(
    ['2.6M', '1,000', '181.6K'],
    { inputPerMillion: 0.65, cacheInputPerMillion: 0.065, outputPerMillion: 3.9 },
  ) - 0.03250325) < 1e-12);
});

test('applies relative tolerance with a five-micro-dollar absolute floor', () => {
  const withinRelative = core.classifyUsageCostDeviation(0.01009, 0.01, 1);
  const outsideRelative = core.classifyUsageCostDeviation(0.01011, 0.01, 1);
  const withinAbsoluteFloor = core.classifyUsageCostDeviation(0.000104, 0.0001, 1);
  const outsideAbsoluteFloor = core.classifyUsageCostDeviation(0.000106, 0.0001, 1);
  const lower = core.classifyUsageCostDeviation(0.008, 0.01, 1);

  assert.equal(withinRelative.anomaly, false);
  assert.equal(outsideRelative.anomaly, true);
  assert.equal(outsideRelative.direction, 'high');
  assert.equal(withinAbsoluteFloor.tolerance, 0.000005);
  assert.equal(withinAbsoluteFloor.anomaly, false);
  assert.equal(outsideAbsoluteFloor.anomaly, true);
  assert.equal(lower.direction, 'low');
  assert.equal(core.classifyUsageCostDeviation(-1, 1), null);
});

test('audits metered usage against the matching model and multiplier', () => {
  const index = core.buildUsageModelPriceIndex([{
    planType: 'A003-Plus',
    priceMultiplier: 0.11,
    model_prices: {
      sol: { input_per_million: 0.65, cache_input_per_million: 0.065, output_per_million: 3.9 },
      terra: { input_per_million: 0.7, cache_input_per_million: 0.07, output_per_million: 4.2 },
      luna: { input_per_million: 0.8, cache_input_per_million: 0.08, output_per_million: 4.8 },
    },
  }]);
  const expectedByModel = { sol: 4.615, terra: 4.97, luna: 5.68 };

  for (const [model, expected] of Object.entries(expectedByModel)) {
    const result = core.auditUsageCostRecord({
      billingMode: '按量',
      model: `gpt-5.6-${model}`,
      groupName: ' a003-plus ',
      groupText: 'A003-Plus / 0.11x',
      tokenValues: ['1,000,000', '1,000,000', '1,000,000'],
      actualCost: `$${expected}`,
    }, index);

    assert.equal(result.status, 'ok');
    assert.equal(result.model, model);
    assert.equal(result.multiplier, 0.11);
    assert.ok(Math.abs(result.estimated - expected) < 1e-12);
  }

  const anomaly = core.auditUsageCostRecord({
    billingMode: '按量',
    model: 'gpt-5.6-sol',
    groupName: 'A003-Plus',
    groupMultiplier: '0.11x',
    tokenValues: ['1,000,000', '1,000,000', '1,000,000'],
    actualCost: '$4.70',
  }, index);
  assert.equal(anomaly.status, 'anomaly');
  assert.equal(anomaly.direction, 'high');

  const compactRounding = core.auditUsageCostRecord({
    billingMode: '按量',
    model: 'gpt-5.6-sol',
    groupName: 'A003-Plus',
    groupMultiplier: '0.11x',
    tokenValues: ['2.6M', '1,000', '0'],
    actualCost: '$1.72',
  }, index);
  assert.equal(compactRounding.status, 'ok');
  assert.ok(compactRounding.roundingTolerance > 0.03);
});

test('skips disabled, non-metered, incomplete, and historical-rate-mismatched usage', () => {
  const index = core.buildUsageModelPriceIndex([{
    planType: 'A003-Plus',
    priceMultiplier: 0.12,
    model_prices: {
      sol: { input_per_million: 0.7, cache_input_per_million: 0.07, output_per_million: 4.2 },
    },
  }]);
  const baseRecord = {
    billingMode: '按量',
    model: 'gpt-5.6-sol',
    groupName: 'A003-Plus',
    groupMultiplier: '0.12x',
    tokenValues: ['1M', '1M'],
    actualCost: '$4.90',
  };

  assert.deepEqual(core.auditUsageCostRecord(baseRecord, index, { usageCostAuditEnabled: false }), {
    status: 'skipped', reason: 'disabled',
  });
  assert.deepEqual(core.auditUsageCostRecord({ ...baseRecord, billingMode: '包月' }, index), {
    status: 'skipped', reason: 'billing_mode',
  });
  assert.deepEqual(core.auditUsageCostRecord({ ...baseRecord, groupMultiplier: '0.11x' }, index), {
    status: 'skipped', reason: 'missing_data',
  });
  assert.deepEqual(core.auditUsageCostRecord({ ...baseRecord, tokenValues: ['1', '2', '3', '4'] }, index), {
    status: 'skipped', reason: 'missing_data',
  });
  assert.deepEqual(core.auditUsageCostRecord({ ...baseRecord, model: 'gpt-5.6' }, index), {
    status: 'skipped', reason: 'missing_data',
  });
});

test('enables the panel on every AIHub page only while logged in', () => {
  assert.deepEqual(core.getPageFeatures('/providers', true), { panel: true, usage: false, keyGroups: false, providerSort: true });
  assert.deepEqual(core.getPageFeatures('/keys?page=1', true), { panel: true, usage: false, keyGroups: true, providerSort: false });
  assert.deepEqual(core.getPageFeatures('/usage', true), { panel: true, usage: true, keyGroups: false, providerSort: false });
  assert.deepEqual(core.getPageFeatures('/dashboard', true), { panel: true, usage: false, keyGroups: false, providerSort: false });
  assert.deepEqual(core.getPageFeatures('/usage', false), { panel: false, usage: false, keyGroups: false, providerSort: false });
});
