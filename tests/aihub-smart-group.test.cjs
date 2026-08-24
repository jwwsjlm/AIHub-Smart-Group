const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../aihub-smart-group.user.js');
const userscriptSource = fs.readFileSync(path.join(__dirname, '..', 'aihub-smart-group.user.js'), 'utf8');

test('hides inactive availability settings despite the shared label display rule', () => {
  assert.match(userscriptSource, /\[data-availability-setting\]\[hidden\]\{display:none !important\}/);
  assert.match(userscriptSource, /\[data-latency-setting\]\[hidden\]\{display:none !important\}/);
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

test('supports the portaled role=listbox group picker used by the current keys page', () => {
  assert.match(userscriptSource, /this\.observer\.observe\(document\.body, \{ childList: true, subtree: true \}\);/);
  assert.match(userscriptSource, /const portal = input\.closest\?\.\('\[role="listbox"\]'\);/);
  assert.match(userscriptSource, /portal\.querySelector\('\.select-options'\) \|\| portal/);
  assert.match(userscriptSource, /const searchArea = input\.parentElement\?\.parentElement;/);
  assert.match(userscriptSource, /const optionList = searchArea\?\.nextElementSibling;/);
  assert.match(userscriptSource, /optionList\.querySelectorAll\('button,\[role="option"\]'\)/);
});

test('filters native group picker mutations before scheduling another render', () => {
  assert.match(userscriptSource, /menuMutationsNeedRender\(records\)/);
  assert.match(userscriptSource, /if \(this\.menuMutationsNeedRender\(records\)\) this\.queueRender\(\);/);
  assert.match(userscriptSource, /observer\.observe\(optionList, \{ childList: true, subtree: true \}\);/);
  assert.doesNotMatch(userscriptSource, /observer\.observe\(optionList, \{ childList: true, subtree: true, characterData: true \}\);/);
});

test('reduces idle router polling while syncing browser history navigation immediately', () => {
  assert.match(userscriptSource, /const ROUTER_SYNC_INTERVAL_MS = 2_000;/);
  assert.match(userscriptSource, /\}, ROUTER_SYNC_INTERVAL_MS\);/);
  assert.match(userscriptSource, /window\.addEventListener\('popstate', this\.onRouteChange\);/);
  assert.match(userscriptSource, /window\.addEventListener\('hashchange', this\.onRouteChange\);/);
});

test('replaces duplicate router instances and releases their global resources', () => {
  const routerStart = userscriptSource.indexOf('class AppRouter');
  const routerSource = userscriptSource.slice(routerStart, userscriptSource.indexOf('\n  return {', routerStart));
  assert.match(userscriptSource, /\/\/ @grant\s+GM_unregisterMenuCommand/);
  assert.match(routerSource, /if \(this\.active\) return;\s*this\.active = true;/);
  assert.match(routerSource, /this\.menuCommandId = GM_registerMenuCommand/);
  assert.match(routerSource, /GM_unregisterMenuCommand\(this\.menuCommandId\)/);
  assert.match(routerSource, /window\.clearInterval\(this\.timer\)/);
  assert.match(routerSource, /document\.removeEventListener\(ROUTER_REPLACE_EVENT, this\.onRouterReplace\)/);
  assert.match(routerSource, /this\.panel\?\.stop\(\);[\s\S]*this\.providerSort\?\.stop\(\);/);
  assert.match(routerSource, /sync\(\) \{\s*if \(!this\.active\) return;/);
  assert.match(userscriptSource, /activeRouter\?\.stop\(\);\s*document\.dispatchEvent\(new window\.Event\(ROUTER_REPLACE_EVENT\)\);\s*activeRouter = new AppRouter\(\);/);
});

test('rebinds the usage observer when the SPA replaces its main element', () => {
  const usageSource = userscriptSource.slice(userscriptSource.indexOf('class UsageMultiplierEnhancer'), userscriptSource.indexOf('class ProviderSortEnhancer'));
  assert.match(usageSource, /this\.observedRoot = null;/);
  assert.match(usageSource, /if \(nextRoot === this\.observedRoot && nextRoot\.isConnected\) return false;/);
  assert.match(usageSource, /this\.observer\.disconnect\(\);\s*this\.observer\.takeRecords\?\.\(\);\s*this\.observedRoot = null;\s*this\.observer\.observe\(nextRoot/);
  assert.match(usageSource, /attributes: true,\s*attributeFilter: \['data-row-id'\]/);
  assert.match(usageSource, /record\.type === 'attributes' && target\?\.matches\?\.\('tr\[data-row-id\]'\)/);
  assert.match(usageSource, /record\.target === currentRoot \|\| currentRoot\.contains\(record\.target\)/);
  assert.match(userscriptSource, /else if \(features\.usage && this\.usage\) \{\s*this\.usage\.syncObserverRoot\(\);\s*this\.usage\.syncUsageQueryPath\(\);/);
});

test('re-arms provider sorting only when the provider sort root is replaced', () => {
  const providerSource = userscriptSource.slice(
    userscriptSource.indexOf('class ProviderSortEnhancer'),
    userscriptSource.indexOf('class AppRouter'),
  );
  const routerSource = userscriptSource.slice(userscriptSource.indexOf('class AppRouter'), userscriptSource.indexOf('\n  return {'));
  assert.match(providerSource, /this\.sortRoot = null;/);
  assert.match(providerSource, /getSortRoot\(\) \{[\s\S]*monitor-sort-controls/);
  assert.match(providerSource, /syncSortRoot\(\) \{[\s\S]*nextRoot !== currentRoot/);
  assert.match(providerSource, /this\.sortRoot = nextRoot;[\s\S]*this\.applied = false;/);
  assert.match(routerSource, /else if \(features\.providerSort && this\.providerSort\) \{\s*this\.providerSort\.syncSortRoot\(\);/);
});

test('does not re-arm applied provider sorting while the same sort root remains mounted', () => {
  const originalDocument = globalThis.document;
  const firstRoot = { isConnected: true };
  const replacementRoot = { isConnected: true };
  let currentRoot = firstRoot;
  globalThis.document = {
    querySelector: (selector) => (selector === '.monitor-sort-controls' ? currentRoot : null),
  };

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.active = true;
    enhancer.sortRoot = firstRoot;
    enhancer.applied = true;
    let observerStarts = 0;
    let applyQueues = 0;
    enhancer.observeUntilApplied = () => { observerStarts += 1; };
    enhancer.queueApply = () => { applyQueues += 1; };

    assert.equal(enhancer.syncSortRoot(), false);
    assert.equal(enhancer.applied, true);
    assert.equal(observerStarts, 0);
    assert.equal(applyQueues, 0);

    currentRoot = replacementRoot;
    assert.equal(enhancer.syncSortRoot(), true);
    assert.equal(enhancer.sortRoot, replacementRoot);
    assert.equal(enhancer.applied, false);
    assert.equal(observerStarts, 1);
    assert.equal(applyQueues, 1);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('refreshes usage prices without repeatedly reloading exact usage rows', () => {
  const usageSource = userscriptSource.slice(userscriptSource.indexOf('class UsageMultiplierEnhancer'), userscriptSource.indexOf('class ProviderSortEnhancer'));
  const refreshSource = usageSource.slice(usageSource.indexOf('async refresh(force = false)'), usageSource.indexOf('handleVisibilityChange()'));

  assert.match(refreshSource, /fetchMonitorSummary\(\{ maxAgeMs: PASSIVE_MONITOR_SUMMARY_CACHE_TTL_MS \}\)/);
  assert.doesNotMatch(refreshSource, /fetchCurrentUsageAuditItems\(/);
  assert.match(usageSource, /this\.syncUsageAuditView\(detailTables\);/);
});

test('lets passive provider displays share the longer monitor summary cache', () => {
  const dropdownSource = userscriptSource.slice(userscriptSource.indexOf('class KeyGroupDropdownEnhancer'), userscriptSource.indexOf('class UsageMultiplierEnhancer'));
  const usageSource = userscriptSource.slice(userscriptSource.indexOf('class UsageMultiplierEnhancer'), userscriptSource.indexOf('class ProviderSortEnhancer'));

  assert.match(userscriptSource, /const PASSIVE_MONITOR_SUMMARY_CACHE_TTL_MS = 60_000;/);
  assert.match(dropdownSource, /fetchMonitorSummary\(\{ maxAgeMs: PASSIVE_MONITOR_SUMMARY_CACHE_TTL_MS \}\)/);
  assert.match(usageSource, /fetchMonitorSummary\(\{ maxAgeMs: PASSIVE_MONITOR_SUMMARY_CACHE_TTL_MS \}\)/);
});

test('forces a fresh balance only for manual controller checks', () => {
  const controllerSource = userscriptSource.slice(userscriptSource.indexOf('class Controller'), userscriptSource.indexOf('class KeyGroupDropdownEnhancer'));

  assert.match(controllerSource, /fetchCurrentBalance\(\{ force: forceLog \}\)/);
  assert.match(controllerSource, /余额最多每 60 秒自动更新；手动检测强制刷新/);
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
  assert.equal(core.DEFAULT_CONFIG.minUserTtftSamples, 1);
  assert.equal(core.LATENCY_SOURCE_LABELS.user, '运行时 P50 TTFT');
  assert.equal(core.normalizeConfig({}).latencySource, 'probe');
  assert.equal(core.normalizeConfig({ latencySource: 'user' }).latencySource, 'user');
  assert.equal(core.normalizeConfig({ minUserTtftSamples: '12' }).minUserTtftSamples, 12);
  assert.equal(core.normalizeConfig({ minUserTtftSamples: 0 }).minUserTtftSamples, 1);
  assert.equal(core.normalizeConfig({ minUserTtftSamples: 9_999_999 }).minUserTtftSamples, 1_000_000);
  assert.equal(core.normalizeConfig({ latencySource: 'unexpected' }).latencySource, 'probe');
});

test('normalizes recommendation price bases while preserving the nominal default', () => {
  assert.equal(core.DEFAULT_CONFIG.recommendationPriceBasis, 'nominal');
  assert.equal(core.normalizeConfig({}).recommendationPriceBasis, 'nominal');
  assert.equal(core.normalizeConfig({ recommendationPriceBasis: 'effectiveInput1h' }).recommendationPriceBasis, 'effectiveInput1h');
  assert.equal(core.normalizeConfig({ recommendationPriceBasis: 'effectiveMultiplier1h' }).recommendationPriceBasis, 'effectiveMultiplier1h');
  assert.equal(core.normalizeConfig({ recommendationPriceBasis: 'unexpected' }).recommendationPriceBasis, 'nominal');
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
  assert.equal(core.normalizeProviderSortPreference('realPrice'), 'realPrice');
  assert.equal(core.normalizeProviderSortPreference('user'), 'user');
  assert.equal(core.normalizeProviderSortPreference('cacheHit'), 'cacheHit');
  assert.equal(core.normalizeProviderSortPreference('successRate'), 'successRate');
  assert.equal(core.normalizeProviderSortPreference('custom'), 'custom');
  assert.equal(core.normalizeProviderSortPreference('unexpected'), 'rate');
  assert.equal(core.normalizeConfig({ providerAutoRefresh: false }).providerAutoRefresh, false);
  assert.equal(core.normalizeConfig({ providerRefreshIntervalSeconds: 2 }).providerRefreshIntervalSeconds, 15);
  assert.equal(core.normalizeConfig({ providerRefreshIntervalSeconds: 9999 }).providerRefreshIntervalSeconds, 3600);
});

test('updates only settings previews affected by the edited field', () => {
  assert.deepEqual(core.getSettingsPreviewTargets(), {
    recommendation: true,
    balance: true,
    excluded: true,
    cooldown: true,
  });
  assert.deepEqual(core.getSettingsPreviewTargets('providerRefreshIntervalSeconds'), {
    recommendation: false,
    balance: false,
    excluded: false,
    cooldown: false,
  });
  assert.deepEqual(core.getSettingsPreviewTargets('recommendationPriceBasis'), {
    recommendation: true,
    balance: false,
    excluded: false,
    cooldown: false,
  });
  assert.deepEqual(core.getSettingsPreviewTargets('latencySource'), {
    recommendation: false,
    balance: true,
    excluded: false,
    cooldown: false,
  });
  assert.deepEqual(core.getSettingsPreviewTargets('minUserTtftSamples'), {
    recommendation: false,
    balance: true,
    excluded: false,
    cooldown: false,
  });
  assert.deepEqual(core.getSettingsPreviewTargets('excludedGroupKeywords'), {
    recommendation: true,
    balance: true,
    excluded: true,
    cooldown: false,
  });
  assert.deepEqual(core.getSettingsPreviewTargets('cooldownMinutes'), {
    recommendation: false,
    balance: false,
    excluded: false,
    cooldown: true,
  });

  const controllerSource = userscriptSource.slice(
    userscriptSource.indexOf('class Controller'),
    userscriptSource.indexOf('class UsageMultiplierEnhancer'),
  );
  assert.match(controllerSource, /renderSettingsPreviews\(event\.target\.dataset\.setting\)/);
  assert.match(controllerSource, /targets\.recommendation \|\| targets\.balance \? this\.readDraftConfig\(\) : null/);
});

test('marks the price preview pending for unsaved candidate filters only', () => {
  const signature = core.getRecommendationPricePreviewSignature(core.DEFAULT_CONFIG);
  assert.notEqual(signature, core.getRecommendationPricePreviewSignature({
    ...core.DEFAULT_CONFIG,
    recommendationPriceBasis: 'effectiveInput1h',
  }));
  assert.notEqual(signature, core.getRecommendationPricePreviewSignature({
    ...core.DEFAULT_CONFIG,
    requireNoWarnings: false,
  }));
  assert.notEqual(signature, core.getRecommendationPricePreviewSignature({
    ...core.DEFAULT_CONFIG,
    excludedGroupKeywords: 'free',
  }));
  assert.equal(signature, core.getRecommendationPricePreviewSignature({
    ...core.DEFAULT_CONFIG,
    providerAutoRefresh: false,
    latencySource: 'user',
  }));
});

test('finds the requested provider hall sort button without matching table headers', () => {
  const buttons = [
    { textContent: '默认 ↓' },
    { textContent: '倍率' },
    { textContent: '真实价格' },
    { textContent: '用户速度 ↑' },
    { textContent: '缓存命中' },
    { textContent: '成功率 ↓' },
    { textContent: '自定义' },
  ];
  assert.equal(core.findProviderSortButton(buttons, 'rate'), buttons[1]);
  assert.equal(core.findProviderSortButton(buttons, 'default'), buttons[0]);
  assert.equal(core.findProviderSortButton(buttons, 'realPrice'), buttons[2]);
  assert.equal(core.findProviderSortButton(buttons, 'user'), buttons[3]);
  assert.equal(core.findProviderSortButton(buttons, 'cacheHit'), buttons[4]);
  assert.equal(core.findProviderSortButton(buttons, 'successRate'), buttons[5]);
  assert.equal(core.findProviderSortButton(buttons, 'custom'), buttons[6]);
  assert.equal(core.findProviderSortButton([{ textContent: '可用率 ↓' }], 'successRate')?.textContent, '可用率 ↓');
  assert.deepEqual(core.getProviderSortButtonTexts('successRate'), ['成功率', '可用率', 'Success rate']);
});

test('matches the English provider sort controls while rejecting duplicate table headers', () => {
  const sortButton = (textContent) => ({
    textContent,
    className: 'monitor-sort-head',
    closest: (selector) => (selector === '.monitor-sort-controls' ? {} : null),
  });
  const headerButton = (textContent) => ({ textContent, className: 'header-sort' });
  const controls = {
    default: sortButton('Default ↓'),
    rate: sortButton('Multiplier'),
    realPrice: sortButton('Effective price'),
    user: sortButton('User speed ↑'),
    cacheHit: sortButton('Cache hit'),
    successRate: sortButton('Success rate'),
    custom: sortButton('Custom'),
  };
  const buttons = [
    headerButton('Multiplier'),
    headerButton('Effective price / predicted multiplier'),
    headerButton('User speed'),
    headerButton('Cache hit'),
    headerButton('Success rate'),
    ...Object.values(controls),
  ];

  for (const [preference, button] of Object.entries(controls)) {
    assert.equal(core.findProviderSortButton(buttons, preference), button);
  }
  assert.equal(core.findProviderSortButton([headerButton('真实价格/预测倍率')], 'realPrice'), null);
  assert.equal(core.findProviderSortButton([headerButton('Effective price / predicted multiplier')], 'realPrice'), null);
});

test('keeps the legacy provider sort control fallback outside the new sort container', () => {
  const legacyButton = {
    textContent: '可用率 ↓',
    className: 'monitor-sort-head',
    closest: () => null,
  };
  assert.equal(core.findProviderSortButton([legacyButton], 'successRate'), legacyButton);
});

test('uses the native low-to-high or high-to-low direction for every provider sort mode', () => {
  for (const preference of ['rate', 'realPrice', 'user']) {
    assert.equal(core.getProviderSortDirection(preference), '↑');
  }
  for (const preference of ['default', 'cacheHit', 'successRate', 'custom']) {
    assert.equal(core.getProviderSortDirection(preference), '↓');
  }
  assert.equal(core.getProviderSortButtonDirection({ textContent: '倍率 ↑' }), '↑');
  assert.equal(core.getProviderSortButtonDirection({ textContent: '成功率 ↓ ' }), '↓');
  assert.equal(core.getProviderSortButtonDirection({ textContent: '用户速度' }), '');
  assert.equal(core.getProviderSortButtonDirection({ textContent: 'Multiplier', getAttribute: () => 'ascending' }), '↑');

  const correctRate = { textContent: '倍率 ↑' };
  const reversedRate = { textContent: '倍率 ↓' };
  assert.equal(core.shouldActivateProviderSort(correctRate, correctRate, 'rate'), false);
  assert.equal(core.shouldActivateProviderSort(reversedRate, reversedRate, 'rate'), true);
  assert.equal(core.shouldActivateProviderSort(correctRate, null, 'rate'), true);
  assert.equal(core.shouldActivateProviderSort(null, null, 'rate'), false);

  const ariaOnly = { textContent: 'Multiplier', getAttribute: (name) => (name === 'aria-sort' ? 'ascending' : null) };
  assert.equal(core.findActiveProviderSortButton([{ textContent: 'Default' }, ariaOnly]), ariaOnly);
  assert.equal(core.shouldActivateProviderSort(ariaOnly, core.findActiveProviderSortButton([ariaOnly]), 'rate'), false);
});

test('finds only the native provider hall refresh button', () => {
  const timeRange = { textContent: '6h', className: 'active' };
  const otherIcon = {
    textContent: '',
    className: 'monitor-icon-button',
    getAttribute: (name) => (name === 'title' ? '切换主题' : null),
  };
  const currentIcon = {
    textContent: '',
    className: 'monitor-icon-button',
    getAttribute: (name) => (name === 'title' ? '刷新监测数据' : null),
  };
  const englishIcon = {
    textContent: '',
    className: 'monitor-icon-button',
    getAttribute: (name) => (name === 'title' ? 'Refresh monitoring data' : null),
  };
  const buttons = [
    timeRange,
    otherIcon,
    currentIcon,
    { textContent: '刷新' },
    { textContent: ' 刷新中 ' },
  ];
  assert.equal(core.findProviderRefreshButton(buttons), currentIcon);
  assert.equal(core.findProviderRefreshButton([timeRange, englishIcon]), englishIcon);
  assert.equal(core.findProviderRefreshButton([{ textContent: 'Refresh' }]).textContent, 'Refresh');
  assert.equal(core.findProviderRefreshButton([{ textContent: '刷新' }]).textContent, '刷新');
  assert.equal(core.findProviderRefreshButton([{ textContent: '检测' }]), null);
  assert.equal(core.findProviderRefreshButton([timeRange, otherIcon]), null);
  assert.equal(core.findProviderRefreshButton([{ textContent: '刷新' }, { textContent: '刷新' }]), null);
});

test('uses the new provider refresh semantic selector before scanning every button', () => {
  const icon = { textContent: '', className: 'monitor-icon-button' };
  let fallbackScans = 0;
  const root = {
    querySelector: (selector) => {
      assert.match(selector, /monitor-icon-button\[title="刷新监测数据"\]/);
      assert.match(selector, /monitor-icon-button\[title="Refresh monitoring data"\]/);
      return icon;
    },
    querySelectorAll: () => {
      fallbackScans += 1;
      return [];
    },
  };

  assert.equal(core.findProviderRefreshButtonInRoot(root), icon);
  assert.equal(fallbackScans, 0);
});

test('treats native and ARIA-disabled provider refresh buttons as unavailable', () => {
  assert.equal(core.isProviderRefreshButtonDisabled({ disabled: true }), true);
  assert.equal(core.isProviderRefreshButtonDisabled({
    disabled: false,
    getAttribute: (name) => (name === 'aria-disabled' ? 'TRUE' : null),
  }), true);
  assert.equal(core.isProviderRefreshButtonDisabled({
    disabled: false,
    getAttribute: () => null,
  }), false);
});

test('recognizes native provider refresh loading signals', () => {
  assert.equal(core.isProviderRefreshButtonBusy({ disabled: true }), true);
  assert.equal(core.isProviderRefreshButtonBusy({ getAttribute: (name) => (name === 'aria-busy' ? 'true' : null) }), true);
  assert.equal(core.isProviderRefreshButtonBusy({ className: 'monitor-icon-button animate-spin' }), true);
  assert.equal(core.isProviderRefreshButtonBusy({ className: 'monitor-icon-button', getAttribute: () => null }), false);
});

test('uses the provider update marker before falling back to visible data rows', () => {
  const markerRoot = {
    querySelector: () => ({ textContent: '更新于 2026/08/24 18:00:01' }),
    querySelectorAll: () => assert.fail('the update marker should avoid scanning provider rows'),
  };
  assert.equal(core.getProviderRefreshDataSignature(markerRoot), 'generated:更新于 2026/08/24 18:00:01');

  const rowRoot = {
    querySelector: () => null,
    querySelectorAll: () => [
      { textContent: 'A001 0.1x 可用', getAttribute: (name) => (name === 'data-testid' ? 'provider-a001' : null) },
      { textContent: 'A002 0.2x 异常', getAttribute: () => null },
    ],
  };
  assert.equal(core.getProviderRefreshDataSignature(rowRoot), 'provider-a001:A001 0.1x 可用|1:A002 0.2x 异常');
});

test('normalizes provider notices and only accepts HTTP report links', () => {
  assert.equal(core.normalizeProviderPublicDetail('  倍率可能调整，请设置上限  '), '倍率可能调整，请设置上限');
  assert.equal(core.normalizeProviderPublicDetail('   '), null);
  assert.equal(core.normalizeProviderPublicDetail({ text: 'invalid' }), null);
  assert.equal(core.normalizeProviderReportUrl(' https://hvoy.ai/report/example '), 'https://hvoy.ai/report/example');
  assert.equal(core.normalizeProviderReportUrl('http://example.test/report'), 'http://example.test/report');
  assert.equal(core.normalizeProviderReportUrl('javascript:alert(1)'), null);
  assert.equal(core.normalizeProviderReportUrl('/relative/report'), null);
  assert.deepEqual(core.getProviderContext({
    public_detail: ' 公告 ',
    hewei_check_url: 'https://hvoy.ai/report/abc',
  }), {
    publicDetail: '公告',
    heweiCheckUrl: 'https://hvoy.ai/report/abc',
  });
});

test('surfaces provider notices and safe report links in recommendation and key details', () => {
  const controllerSource = userscriptSource.slice(
    userscriptSource.indexOf('class Controller'),
    userscriptSource.indexOf('class KeyGroupDropdownEnhancer'),
  );
  assert.match(controllerSource, /data-key-detail-row="provider-detail"/);
  assert.match(controllerSource, /data-key-detail-row="hewei-report"/);
  assert.match(controllerSource, /report\.rel = 'noopener noreferrer'/);
  assert.match(controllerSource, /供应商公告：\$\{providerContext\.publicDetail\}/);
  assert.match(controllerSource, /providerContext\.heweiCheckUrl \? ' · 有禾维报告'/);
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
    e2e: row.probeE2eLatencyMs,
    user: row.userAvgTtftMs,
    samples: row.userSampleCount,
  })), [{ id: 34, planType: 'A001-Plus', priceMultiplier: 0.06, probe: 4373, e2e: 4500, user: 6085.5, samples: 16 }]);
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

test('normalizes and deduplicates model detection reason code aliases', () => {
  const detection = core.normalizeModelDetection({
    status: 'suspected',
    reason_codes: ['MIXED_VARIANT_SIGNAL', ' ', 'future_reason_code'],
    reasonCodes: ['mixed_variant_signal', 'FINAL_REQUEST_ERRORS', null],
  });

  assert.deepEqual(detection.reasonCodes, ['MIXED_VARIANT_SIGNAL', 'future_reason_code', 'FINAL_REQUEST_ERRORS']);
  assert.deepEqual(detection.reason_codes, detection.reasonCodes);
  assert.deepEqual(core.normalizeModelDetectionReasonCodes(['A', 'a', '', null], ['B', 'A']), ['A', 'B']);
});

test('normalizes effective pricing, runtime cache, throughput, and provider capability fields', () => {
  const summary = core.normalizeMonitorSummaryPayload({ data: {
    items: [{
      group_id: 34,
      code: 'A001-Plus',
      rate_multiplier: 0.06,
      cache_hit_rate: null,
      runtime_cache_1h: {
        usage_records: 12,
        input_tokens: 1_000,
        cache_read_tokens: 250,
        cache_creation_tokens: 10,
        input_cost: 0.5,
        cache_read_cost: 0.05,
        cache_creation_cost: 0.01,
        cache_hit_rate: 0.25,
        refreshed_at: '2026-08-24T02:20:00Z',
        ready: true,
        stale: false,
      },
      effective_input_price_per_million_1h: '0.42',
      effective_multiplier: 0.07,
      effective_multiplier_ready: true,
      output_tps: 87.25,
      support_ws: true,
      subscription_type: 'standard',
      public_detail: '  该渠道倍率可能调整  ',
      hewei_check_url: 'https://hvoy.ai/report/example',
    }],
  } });
  const row = summary.apis[0];

  assert.deepEqual(row.runtimeCache1h, {
    usageRecords: 12,
    inputTokens: 1_000,
    cacheReadTokens: 250,
    cacheCreationTokens: 10,
    inputCost: 0.5,
    cacheReadCost: 0.05,
    cacheCreationCost: 0.01,
    cacheHitRate: 0.25,
    refreshedAt: '2026-08-24T02:20:00Z',
    ready: true,
    stale: false,
  });
  assert.equal(row.cacheHitRate, 0.25);
  assert.equal(row.effectiveInputPricePerMillion1h, 0.42);
  assert.equal(row.effectiveMultiplier, 0.07);
  assert.equal(row.effectiveMultiplierReady, true);
  assert.equal(row.outputTokensPerSecond, 87.25);
  assert.equal(row.supportWs, true);
  assert.equal(row.subscriptionType, 'standard');
  assert.equal(row.publicDetail, '该渠道倍率可能调整');
  assert.equal(row.heweiCheckUrl, 'https://hvoy.ai/report/example');
  assert.deepEqual(core.getEffectivePricing(row), {
    inputPricePerMillion: 0.42,
    multiplier: 0.07,
    ready: true,
    reason: null,
    runtimeCache1h: row.runtimeCache1h,
    hasData: true,
  });
  assert.equal(core.formatEffectivePricingSummary(row), '真实输入 $0.42 / 1M · 预测倍率 ×0.07');
  assert.equal(core.formatOutputThroughput(row), '输出速度 87.3 tok/s');
});

test('keeps nominal multiplier separate and rejects stale or incomplete effective pricing', () => {
  const summary = core.normalizeMonitorSummaryPayload({ data: { items: [{
    groupId: 9,
    planType: 'Camel',
    rateMultiplier: 0.04,
    cacheHitRate: '80%',
    runtimeCache1h: { ready: true, stale: true, cacheHitRate: 0.5 },
    effectiveInputPricePerMillion1h: 0.2,
    effectiveMultiplier: 0.09,
    effectiveMultiplierReady: true,
    effectiveMultiplierReason: '',
    outputTokensPerSecond: 120,
  }] } });
  const row = summary.apis[0];

  assert.equal(row.priceMultiplier, 0.04);
  assert.equal(row.cacheHitRate, 0.8);
  assert.equal(core.getEffectivePricing(row).ready, false);
  assert.equal(core.getEffectivePricing(row).reason, 'runtime_metrics_stale');
  assert.equal(core.formatEffectivePricingSummary(row, true), '');
  assert.equal(core.formatEffectivePricingSummary(row, true, true), '暂不可用（数据已过期）');
  assert.equal(core.formatOutputThroughput(row, true), '输出 120 tok/s');

  const incomplete = core.getEffectivePricing({
    effectiveMultiplier: 0.08,
    effectiveMultiplierReady: true,
    effectiveMultiplierReason: 'insufficient_samples',
  });
  assert.equal(incomplete.ready, false);
  assert.equal(core.formatEffectivePricingSummary(incomplete, false, true), '暂不可用（样本不足）');
  assert.equal(core.getEffectivePricing({ runtimeCache1h: { ready: true, stale: false } }).hasData, false);

  const ranked = core.rankCandidates([
    {
      group_id: 1,
      planType: 'lower-nominal',
      priceMultiplier: 0.04,
      effectiveInputPricePerMillion1h: 1.2,
      effectiveMultiplier: 0.2,
      effectiveMultiplierReady: true,
      available: true,
      visibleInHall: true,
      successRates: { '10m': 1 },
    },
    {
      group_id: 2,
      planType: 'lower-effective',
      priceMultiplier: 0.05,
      effectiveInputPricePerMillion1h: 0.2,
      effectiveMultiplier: 0.03,
      effectiveMultiplierReady: true,
      available: true,
      visibleInHall: true,
      successRates: { '10m': 1 },
    },
  ], { mode: 'price', requireNoWarnings: false });
  assert.equal(ranked[0].groupId, 1);
});

test('selects different price-mode winners for nominal, real-input, and predicted-multiplier bases', () => {
  const runtimeReady = { ready: true, stale: false };
  const rows = [
    {
      group_id: 1,
      planType: 'nominal-winner',
      priceMultiplier: 0.01,
      effectiveInputPricePerMillion1h: 0.9,
      effectiveMultiplier: 0.5,
      effectiveMultiplierReady: true,
      runtimeCache1h: runtimeReady,
      available: true,
      successRates: { '10m': 1 },
    },
    {
      group_id: 2,
      planType: 'real-input-winner',
      priceMultiplier: 0.02,
      effectiveInputPricePerMillion1h: 0.1,
      effectiveMultiplier: 0.4,
      effectiveMultiplierReady: true,
      runtimeCache1h: runtimeReady,
      available: true,
      successRates: { '10m': 1 },
    },
    {
      group_id: 3,
      planType: 'predicted-winner',
      priceMultiplier: 0.03,
      effectiveInputPricePerMillion1h: 0.2,
      effectiveMultiplier: 0.005,
      effectiveMultiplierReady: true,
      runtimeCache1h: runtimeReady,
      available: true,
      successRates: { '10m': 1 },
    },
  ];

  const winnerFor = (recommendationPriceBasis) => core.rankCandidates(rows, {
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis,
  })[0];

  assert.deepEqual([
    winnerFor('nominal')?.planType,
    winnerFor('nominal')?.rankingPriceBasis,
    winnerFor('nominal')?.rankingPriceValue,
  ], ['nominal-winner', 'nominal', 0.01]);
  assert.deepEqual([
    winnerFor('effectiveInput1h')?.planType,
    winnerFor('effectiveInput1h')?.rankingPriceBasis,
    winnerFor('effectiveInput1h')?.rankingPriceValue,
  ], ['real-input-winner', 'effectiveInput1h', 0.1]);
  assert.deepEqual([
    winnerFor('effectiveMultiplier1h')?.planType,
    winnerFor('effectiveMultiplier1h')?.rankingPriceBasis,
    winnerFor('effectiveMultiplier1h')?.rankingPriceValue,
  ], ['predicted-winner', 'effectiveMultiplier1h', 0.005]);
});

test('excludes unavailable effective price metrics without falling back to nominal multipliers', () => {
  const common = { available: true, successRates: { '10m': 1 } };
  const missing = { ...common, group_id: 1, planType: 'missing', priceMultiplier: 0.001 };
  const stale = {
    ...common,
    group_id: 2,
    planType: 'stale',
    priceMultiplier: 0.002,
    effectiveInputPricePerMillion1h: 0.01,
    effectiveMultiplier: 0.01,
    effectiveMultiplierReady: true,
    runtimeCache1h: { ready: true, stale: true },
  };
  const realInputReadyWithoutReference = {
    ...common,
    group_id: 3,
    planType: 'real-input-ready',
    priceMultiplier: 0.03,
    effectiveInputPricePerMillion1h: 0.2,
    effectiveMultiplierReady: false,
    effectiveMultiplierReason: 'openrouter_reference_unavailable',
    runtimeCache1h: { ready: true, stale: false },
  };
  const realInputNotReady = {
    ...common,
    group_id: 6,
    planType: 'real-input-not-ready',
    priceMultiplier: 0.006,
    effectiveInputPricePerMillion1h: 0.05,
    runtimeCache1h: { ready: false, stale: false },
  };
  const predictedNotReady = {
    ...common,
    group_id: 4,
    planType: 'predicted-not-ready',
    priceMultiplier: 0.004,
    effectiveInputPricePerMillion1h: 0.1,
    effectiveMultiplier: 0.001,
    effectiveMultiplierReady: false,
    runtimeCache1h: { ready: true, stale: false },
  };
  const predictedReady = {
    ...common,
    group_id: 5,
    planType: 'predicted-ready',
    priceMultiplier: 0.05,
    effectiveInputPricePerMillion1h: 0.5,
    effectiveMultiplier: 0.04,
    effectiveMultiplierReady: true,
    runtimeCache1h: { ready: true, stale: false },
  };
  const predictedReferenceStale = {
    ...predictedReady,
    group_id: 7,
    planType: 'predicted-reference-stale',
    effectiveMultiplier: 0.0001,
    effectiveMultiplierReason: 'openrouter_reference_stale',
  };

  const realInputAnalysis = core.analyzeCandidates([missing, stale, realInputNotReady, realInputReadyWithoutReference], {
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis: 'effectiveInput1h',
  });
  assert.deepEqual(realInputAnalysis.candidates.map((row) => row.planType), ['real-input-ready']);
  assert.equal(realInputAnalysis.counts.priceMetricUnavailable, 3);
  assert.deepEqual(realInputAnalysis.counts.priceMetricUnavailableReasons, { notReady: 1, stale: 1, missing: 1 });

  const predictedAnalysis = core.analyzeCandidates([missing, stale, predictedNotReady, predictedReferenceStale, predictedReady], {
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis: 'effectiveMultiplier1h',
  });
  assert.deepEqual(predictedAnalysis.candidates.map((row) => row.planType), ['predicted-ready']);
  assert.equal(predictedAnalysis.counts.priceMetricUnavailable, 4);
  assert.deepEqual(predictedAnalysis.counts.priceMetricUnavailableReasons, { notReady: 1, stale: 2, missing: 1 });
  assert.deepEqual(core.rankCandidates([missing, stale, predictedNotReady], {
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis: 'effectiveMultiplier1h',
  }), []);
  assert.equal(core.getRecommendationPriceMetric({ price: 9, priceMultiplier: 0.05 }, 'nominal').value, 0.05);
});

test('rejects missing nominal multipliers even when an effective price metric is ready', () => {
  const common = {
    available: true,
    successRates: { '10m': 1 },
    effectiveInputPricePerMillion1h: 0.1,
    effectiveMultiplier: 0.02,
    effectiveMultiplierReady: true,
    runtimeCache1h: { ready: true, stale: false },
  };
  const rows = [
    { ...common, group_id: 1, planType: 'null-nominal', priceMultiplier: null },
    { ...common, group_id: 2, planType: 'empty-nominal', priceMultiplier: '' },
    { ...common, group_id: 3, planType: 'valid', priceMultiplier: 0.05 },
  ];

  for (const recommendationPriceBasis of ['effectiveInput1h', 'effectiveMultiplier1h']) {
    const analysis = core.analyzeCandidates(rows, {
      ...core.DEFAULT_CONFIG,
      mode: 'price',
      recommendationPriceBasis,
    });
    assert.equal(analysis.counts.invalid, 2);
    assert.deepEqual(analysis.candidates.map((row) => row.planType), ['valid']);
  }
});

test('keeps balance and speed ranking independent from the price-mode recommendation basis', () => {
  const runtimeReady = { ready: true, stale: false };
  const rows = [
    {
      group_id: 1,
      planType: 'cheap-slow',
      priceMultiplier: 0.03,
      firstTokenLatencyMs: 500,
      effectiveInputPricePerMillion1h: 0.01,
      effectiveMultiplier: 0.01,
      effectiveMultiplierReady: true,
      runtimeCache1h: runtimeReady,
      available: true,
      successRates: { '10m': 1 },
    },
    {
      group_id: 2,
      planType: 'balanced-fast',
      priceMultiplier: 0.04,
      firstTokenLatencyMs: 100,
      effectiveInputPricePerMillion1h: 0.9,
      effectiveMultiplier: 0.9,
      effectiveMultiplierReady: true,
      runtimeCache1h: runtimeReady,
      available: true,
      successRates: { '10m': 1 },
    },
    {
      group_id: 3,
      planType: 'fast-over-limit',
      priceMultiplier: 0.08,
      firstTokenLatencyMs: 10,
      effectiveInputPricePerMillion1h: 0.001,
      effectiveMultiplier: 0.001,
      effectiveMultiplierReady: true,
      runtimeCache1h: runtimeReady,
      available: true,
      successRates: { '10m': 1 },
    },
  ];

  for (const recommendationPriceBasis of ['nominal', 'effectiveInput1h', 'effectiveMultiplier1h']) {
    assert.equal(core.rankCandidates(rows, {
      ...core.DEFAULT_CONFIG,
      mode: 'balance',
      balanceMaxPrice: 0.05,
      recommendationPriceBasis,
    })[0]?.planType, 'balanced-fast');
    assert.equal(core.rankCandidates(rows, {
      ...core.DEFAULT_CONFIG,
      mode: 'speed',
      recommendationPriceBasis,
    })[0]?.planType, 'fast-over-limit');
  }
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

test('normalizes provider series aliases and fills empty direct maps from items', () => {
  const series = core.normalizeMonitorSeriesPayload({ data: {
    generatedAt: '2026-08-24T02:20:00Z',
    series_by_api_id: { 3: [], 4: [[10, 1]] },
    userTTFTByApiId: { 4: [{ at: '2026-08-24T02:19:00Z', avgTtftMs: 500 }] },
    items: [
      { groupId: 3, probeSeries: [[20, 0]], userTtft: [{ probedAt: '2026-08-24T02:18:00Z' }] },
      { groupId: 4, probeSeries: [[30, 0]], userTtft: [{ at: '2026-08-24T02:17:00Z' }] },
    ],
  } });

  assert.deepEqual(series.seriesByApiId['3'], [[20, 0]]);
  assert.deepEqual(series.seriesByApiId['4'], [[10, 1]]);
  assert.equal(series.userTtftByGroupId['3'][0].probedAt, '2026-08-24T02:18:00Z');
  assert.equal(series.userTtftByGroupId['4'][0].at, '2026-08-24T02:19:00Z');
  assert.equal(core.getLatestMonitorSampleAt(series), Date.parse('2026-08-24T02:19:00Z'));
});

test('builds a weighted conservative provider series fallback from summary history', () => {
  const summary = core.normalizeMonitorSummaryPayload({ data: {
    generated_at: '2026-08-24T02:20:00Z',
    items: [{
      group_id: 7,
      history: [
        { probed_at: '2026-08-24T02:10:00Z', status: 'operational', sample_count: 3 },
        { probed_at: '2026-08-24T02:11:00Z', status: 'degraded', sample_count: 2 },
        { probed_at: '2026-08-24T02:12:00Z', status: 'unknown', sample_count: 0 },
        { probed_at: '2026-08-24T02:13:00Z', status: 'operational', sample_count: 1 },
        { probed_at: '2026-08-24T02:13:00Z', status: 'failed', sample_count: 1 },
        { probed_at: '2026-08-24T02:14:00Z', status: 'operational', sample_count: 0 },
        { probed_at: 'invalid', status: 'operational', sample_count: 1 },
      ],
    }],
  } });
  const fallback = core.buildMonitorSeriesFromSummary(summary);
  const operationalAt = Date.parse('2026-08-24T02:10:00Z');
  const degradedAt = Date.parse('2026-08-24T02:11:00Z');
  const failedAt = Date.parse('2026-08-24T02:13:00Z');

  assert.deepEqual(fallback.seriesByApiId['7'], [
    [operationalAt, 1, 3],
    [degradedAt, 0, 2],
    [failedAt, 0, 1],
  ]);
  assert.equal(fallback.range, 'summary-history');
  assert.equal(core.hasMonitorSeriesData(fallback), true);
  assert.equal(core.monitorHistoryStatusToAvailability('degraded'), 0);
  assert.equal(core.monitorHistoryStatusToAvailability('unknown'), null);
});

test('keeps large summary histories compact and caps aggregate sample weights', () => {
  const history = Array.from({ length: 2_000 }, (_, index) => ({
    timestamp: index + 1,
    status: 'operational',
    sampleCount: 1_000_000,
  }));
  const fallback = core.buildMonitorSeriesFromSummary({
    generatedAt: '2026-08-24T02:20:00Z',
    apis: [{ id: 'bulk', history }],
  });

  assert.equal(fallback.seriesByApiId.bulk.length, history.length);
  assert.deepEqual(fallback.seriesByApiId.bulk[0], [1, 1, 60]);
  assert.deepEqual(fallback.seriesByApiId.bulk.at(-1), [2_000, 1, 60]);
});

test('keeps slightly newer summary history samples inside the availability window', () => {
  const generatedAt = '2026-08-24T03:30:51.265Z';
  const latestAt = Date.parse('2026-08-24T03:31:02Z');
  const summary = core.normalizeMonitorSummaryPayload({ data: {
    generated_at: generatedAt,
    items: [{
      group_id: 8,
      history: [{ probed_at: '2026-08-24T03:31:02Z', status: 'failed', sample_count: 2 }],
    }],
  } });
  const fallback = core.buildMonitorSeriesFromSummary(summary);
  const rows = core.attachRecentAvailability([{ id: 8, successRates: {} }], fallback);

  assert.equal(core.getMonitorSeriesWindowAnchor(fallback), latestAt);
  assert.equal(rows[0].recentSampleCount, 2);
  assert.equal(rows[0].recentSuccessCount, 0);
  assert.equal(rows[0].successRates['10m'], 0);

  const farFuture = {
    generatedAt,
    seriesByApiId: { 8: [
      [latestAt, 0],
      [Date.parse('2026-08-24T04:00:00Z'), 1],
    ] },
    userTtftByGroupId: {},
  };
  assert.equal(core.getMonitorSeriesWindowAnchor(farFuture), latestAt);
  assert.equal(core.getMonitorSeriesWindowAnchor({ seriesByApiId: {}, userTtftByGroupId: {} }), null);
});

test('merges, sorts, and deduplicates primary and fallback provider samples by timestamp', () => {
  const primaryTenFieldSample = [300, 0, 9_999, 4, 5, 6, 7, 8, 9, 10];
  const primary = core.normalizeMonitorSeriesPayload({ data: {
    generated_at: '2026-08-24T02:20:00Z',
    range: '6h',
    items: [
      { group_id: 1, probe: [primaryTenFieldSample, [100, 1]], user_ttft: [{ at: '2026-08-24T02:19:00Z' }] },
      { group_id: 2, probe: [] },
    ],
  } });
  const fallback = {
    generatedAt: '2026-08-24T02:21:00Z',
    range: 'summary-history',
    seriesByApiId: {
      1: [[200, 1, 3], [50, 0, 2], [100, 0, 4], [300, 1, 5]],
      2: [[60, 1, 2]],
      3: [[70, 0, 1]],
    },
    userTtftByGroupId: { 2: [{ at: '2026-08-24T02:17:00Z' }] },
  };
  const merged = core.mergeMonitorSeries(primary, fallback);

  assert.deepEqual(merged.seriesByApiId['1'], [
    [50, 0, 2],
    [100, 1],
    [200, 1, 3],
    primaryTenFieldSample,
  ]);
  assert.deepEqual(merged.seriesByApiId['2'], [[60, 1, 2]]);
  assert.deepEqual(merged.seriesByApiId['3'], [[70, 0, 1]]);
  assert.equal(merged.userTtftByGroupId['1'][0].at, '2026-08-24T02:19:00Z');
  assert.equal(merged.userTtftByGroupId['2'][0].at, '2026-08-24T02:17:00Z');
  assert.equal(merged.range, '6h');
  assert.equal(merged.generatedAt, '2026-08-24T02:21:00Z');
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

test('lets passive consumers extend summary cache age without weakening the default TTL', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalDateNow = Date.now;
  let requestCount = 0;
  let now = 10_000;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    fetch: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [{ group_id: 1, code: `summary-${requestCount}` }] } }),
      };
    },
  };
  Date.now = () => now;
  core.clearMonitorSummaryCache();

  try {
    const first = await core.fetchMonitorSummary();
    now += 2_001;
    const passive = await core.fetchMonitorSummary({ maxAgeMs: 60_000 });
    assert.equal(requestCount, 1);
    assert.equal(passive, first);

    const defaultFresh = await core.fetchMonitorSummary();
    assert.equal(requestCount, 2);
    assert.notEqual(defaultFresh, first);

    const forced = await core.fetchMonitorSummary({ force: true, maxAgeMs: 60_000 });
    assert.equal(requestCount, 3);
    assert.notEqual(forced, defaultFresh);
  } finally {
    Date.now = originalDateNow;
    core.clearMonitorSummaryCache();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('deduplicates, expires, and force-refreshes current balance requests', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalDateNow = Date.now;
  let requestCount = 0;
  let now = 10_000;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    fetch: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { balance: requestCount } }),
      };
    },
  };
  Date.now = () => now;
  core.clearCurrentBalanceCache();

  try {
    const pending = core.fetchCurrentBalance();
    const joined = core.fetchCurrentBalance({ force: true });
    const [first, shared] = await Promise.all([pending, joined]);
    assert.equal(requestCount, 1);
    assert.equal(shared, first);

    const cached = await core.fetchCurrentBalance();
    assert.equal(requestCount, 1);
    assert.equal(cached, first);

    now += 60_001;
    const expired = await core.fetchCurrentBalance();
    assert.equal(requestCount, 2);
    assert.notEqual(expired, first);

    const forced = await core.fetchCurrentBalance({ force: true });
    assert.equal(requestCount, 3);
    assert.notEqual(forced, expired);
  } finally {
    Date.now = originalDateNow;
    core.clearCurrentBalanceCache();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('deduplicates and caches provider series requests independently', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalDateNow = Date.now;
  let requestCount = 0;
  let now = 10_000;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    fetch: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [{ group_id: 1, probe: [[requestCount, 1]], user_ttft: [] }] } }),
      };
    },
  };
  Date.now = () => now;
  core.clearMonitorSeriesCache();

  try {
    const [left, right] = await Promise.all([core.fetchMonitorSeries(), core.fetchMonitorSeries()]);
    const cached = await core.fetchMonitorSeries();
    assert.equal(requestCount, 1);
    assert.equal(left, right);
    assert.equal(cached, left);

    const forced = await core.fetchMonitorSeries({ force: true });
    assert.equal(requestCount, 2);
    assert.notEqual(forced, left);

    now += 60_001;
    const fresh = await core.fetchMonitorSeries();
    assert.equal(requestCount, 3);
    assert.notEqual(fresh, forced);
  } finally {
    Date.now = originalDateNow;
    core.clearMonitorSeriesCache();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('clears a failed provider series request so a later call can retry', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  let requestCount = 0;
  const storage = { getItem: () => '' };
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    fetch: async () => {
      requestCount += 1;
      if (requestCount === 1) return { ok: false, status: 500, json: async () => ({ message: 'temporary' }) };
      return { ok: true, status: 200, json: async () => ({ data: { items: [{ group_id: 1, probe: [[1, 1]] }] } }) };
    },
  };
  core.clearMonitorSeriesCache();

  try {
    await assert.rejects(core.fetchMonitorSeries(), /temporary/);
    const recovered = await core.fetchMonitorSeries();
    assert.equal(requestCount, 2);
    assert.deepEqual(recovered.seriesByApiId['1'], [[1, 1]]);
  } finally {
    core.clearMonitorSeriesCache();
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
  assert.equal(core.getUserLatencySampleCount(sampled), 8);
  assert.equal(core.getUserLatencySampleCount(empty), null);
  assert.equal(core.formatLatencyMetric(sampled, 'user'), '运行时 P50 TTFT 1200 ms（8 条）');
  assert.equal(core.formatLatencyMetric(empty, 'user'), '运行时 P50 TTFT 900 ms（回退探测）');
});

test('falls back from low-sample real-user TTFT with an explicit confidence reason', () => {
  const lowSample = { firstTokenLatencyMs: 900, userAvgTtftMs: 250, userSampleCount: 3, userHasData: true };
  const lowSampleWithoutProbe = { userAvgTtftMs: 250, userSampleCount: 3, userHasData: true };

  assert.deepEqual(core.getLatencyMetric(lowSample, 'user', 3), { value: 250, source: 'user', fallback: false });
  assert.deepEqual(core.getLatencyMetric(lowSample, 'user', 5), {
    value: 900,
    source: 'probe',
    fallback: true,
    userSampleInsufficient: true,
    userSampleCount: 3,
    minUserTtftSamples: 5,
  });
  assert.equal(core.formatLatencyMetric(lowSample, 'user', 5), '运行时 P50 TTFT 900 ms（样本不足 3/5，回退探测）');
  assert.equal(core.formatLatencyMetric(lowSampleWithoutProbe, 'user', 5), '运行时 P50 TTFT 暂无数据（样本不足 3/5，回退探测）');
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
  assert.deepEqual(result.counts, {
    total: 7,
    invalid: 1,
    unavailable: 2,
    lowSuccess: 1,
    warnings: 1,
    modelDetectionWarnings: 0,
    keywords: 1,
    priceMetricUnavailable: 0,
    priceMetricUnavailableReasons: { notReady: 0, stale: 0, missing: 0 },
    userLatencySampleFallbacks: 0,
    eligible: 1,
  });
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

test('weights compact fallback samples without treating live 10-field samples as weighted', () => {
  const now = Date.parse('2026-08-24T05:10:00Z');
  const liveTenFieldFailure = [now - 6 * 60_000, 0, 9_999, 4, 5, 6, 7, 8, 9, 10];
  const series = {
    generatedAt: new Date(now).toISOString(),
    seriesByApiId: {
      weighted: [
        [now - 8 * 60_000, 1, 1_000_000],
        [now - 7 * 60_000, 0, 2],
        liveTenFieldFailure,
        [now - 5 * 60_000, 1],
        [now - 4 * 60_000, 1, 4.9],
        [now - 3 * 60_000, 0, 0],
        [now - 2 * 60_000, 1, -2],
        [now - 1 * 60_000, 1, Number.NaN],
      ],
    },
  };

  const [enriched] = core.attachRecentAvailability([{ id: 'weighted', successRates: {} }], series);
  assert.equal(enriched.recentSampleCount, 68);
  assert.equal(enriched.recentSuccessCount, 65);
  assert.equal(enriched.recentConsecutiveSuccessCount, 5);
  assert.equal(enriched.successRates['10m'], 65 / 68);
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

test('binds reusable candidate analyses to the current rows and relevant normalized settings', () => {
  const rows = [
    { planType: 'cached', group_id: 1, priceMultiplier: 0.04, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100 },
  ];
  const config = { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.1 };
  const analysis = core.analyzeCandidates(rows, config);

  assert.equal(analysis.sourceRows, rows);
  assert.equal(analysis.signature, core.getCandidateAnalysisSignature(config));
  assert.equal(
    core.getCandidateAnalysisSignature(config),
    core.getCandidateAnalysisSignature({ ...config, balanceMaxPrice: 0.05 }),
  );
  analysis.candidates[0].cachedOnly = true;
  assert.equal(core.rankCandidates(rows, { ...config, balanceMaxPrice: 0.05 }, analysis)[0].cachedOnly, true);

  const replacementRows = [
    { planType: 'replacement', group_id: 2, priceMultiplier: 0.03, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 50 },
  ];
  assert.equal(core.rankCandidates(replacementRows, config, analysis)[0].planType, 'replacement');
  assert.equal(core.rankCandidates(rows, { ...config, latencySource: 'user' }, analysis)[0].cachedOnly, undefined);

  const signatureVariants = [
    { ...config, mode: 'price', recommendationPriceBasis: 'effectiveInput1h' },
    { ...config, availabilityMode: 'successes', minSuccessPoints10m: 2 },
    { ...config, minSuccess10m: 0.5 },
    { ...config, requireNoWarnings: false },
    { ...config, excludedGroupKeywords: 'cached' },
    { ...config, latencySource: 'user' },
  ];
  for (const variant of signatureVariants) {
    assert.notEqual(core.getCandidateAnalysisSignature(config), core.getCandidateAnalysisSignature(variant));
  }
});

test('reanalyzes cached candidates when the price basis changes', () => {
  const runtimeCache1h = { ready: true, stale: false };
  const rows = [
    {
      planType: 'nominal-winner', group_id: 1, priceMultiplier: 0.01, available: true,
      successRates: { '10m': 1 }, effectiveInputPricePerMillion1h: 0.9, runtimeCache1h,
    },
    {
      planType: 'effective-winner', group_id: 2, priceMultiplier: 0.02, available: true,
      successRates: { '10m': 1 }, effectiveInputPricePerMillion1h: 0.1, runtimeCache1h,
    },
  ];
  const nominalConfig = { ...core.DEFAULT_CONFIG, mode: 'price', recommendationPriceBasis: 'nominal' };
  const effectiveConfig = { ...nominalConfig, recommendationPriceBasis: 'effectiveInput1h' };
  const nominalAnalysis = core.analyzeCandidates(rows, nominalConfig);

  assert.equal(core.rankCandidates(rows, nominalConfig, nominalAnalysis)[0].planType, 'nominal-winner');
  assert.equal(core.rankCandidates(rows, effectiveConfig, nominalAnalysis)[0].planType, 'effective-winner');
});

test('does not treat a missing availability value as zero when the threshold is zero', () => {
  const rows = [
    { planType: 'missing-sample', group_id: 1, priceMultiplier: 0.01, available: true, successRates: { '10m': null } },
  ];
  const config = { ...core.DEFAULT_CONFIG, minSuccess10m: 0 };
  const analysis = core.analyzeCandidates(rows, config);

  assert.equal(analysis.counts.lowSuccess, 1);
  assert.deepEqual(core.rankCandidates(rows, config, analysis), []);
});

test('revalidates current price, balance, and speed winners before switching', () => {
  const cases = [
    {
      mode: 'price',
      config: { ...core.DEFAULT_CONFIG, mode: 'price' },
      rows: [
        { planType: 'price-target', group_id: 1, priceMultiplier: 0.01, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 500 },
        { planType: 'price-other', group_id: 2, priceMultiplier: 0.02, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100 },
      ],
      targetGroupId: 1,
    },
    {
      mode: 'balance',
      config: { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.05 },
      rows: [
        { planType: 'balance-target', group_id: 2, priceMultiplier: 0.04, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100 },
        { planType: 'balance-other', group_id: 1, priceMultiplier: 0.03, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 500 },
        { planType: 'over-limit', group_id: 3, priceMultiplier: 0.08, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 10 },
      ],
      targetGroupId: 2,
    },
    {
      mode: 'speed',
      config: { ...core.DEFAULT_CONFIG, mode: 'speed' },
      rows: [
        { planType: 'speed-target', group_id: 3, priceMultiplier: 0.08, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 50 },
        { planType: 'speed-other', group_id: 1, priceMultiplier: 0.01, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 500 },
      ],
      targetGroupId: 3,
    },
  ];

  for (const entry of cases) {
    const result = core.reanalyzeRecommendationForSwitch(
      entry.rows,
      entry.config,
      { groupId: entry.targetGroupId, stable: true },
      entry.targetGroupId,
    );
    assert.equal(result.reason, '', entry.mode);
    assert.equal(result.winner.groupId, entry.targetGroupId, entry.mode);
    assert.equal(result.target.groupId, entry.targetGroupId, entry.mode);
    assert.equal(result.analysis.sourceRows, entry.rows, entry.mode);
  }
});

test('blocks a switch when the previous target is no longer eligible', () => {
  const rows = [
    { planType: 'unavailable-target', group_id: 1, priceMultiplier: 0.01, available: false, successRates: { '10m': 1 }, firstTokenLatencyMs: 100 },
    { planType: 'available-other', group_id: 2, priceMultiplier: 0.02, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 200 },
  ];
  const result = core.reanalyzeRecommendationForSwitch(rows, { ...core.DEFAULT_CONFIG, mode: 'price' }, { groupId: 1, stable: true }, 1);

  assert.equal(result.reason, '推荐目标已不再符合当前筛选条件，请重新检测');
  assert.equal(result.target, null);
  assert.equal(result.winner.groupId, 2);
});

test('blocks a switch when a newly ranked group overtakes the stable target', () => {
  const rows = [
    { planType: 'old-target', group_id: 1, priceMultiplier: 0.04, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 200 },
    { planType: 'new-winner', group_id: 2, priceMultiplier: 0.04, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100 },
  ];
  const config = { ...core.DEFAULT_CONFIG, mode: 'balance', balanceMaxPrice: 0.05 };
  const result = core.reanalyzeRecommendationForSwitch(rows, config, { groupId: 1, stable: true }, 1);

  assert.equal(result.reason, '推荐第一名已变化，请重新检测');
  assert.equal(result.target.groupId, 1);
  assert.equal(result.winner.groupId, 2);
});

test('blocks a switch when the stable group and target group disagree', () => {
  const rows = [
    { planType: 'speed-target', group_id: 1, priceMultiplier: 0.04, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 100 },
    { planType: 'stable-other', group_id: 2, priceMultiplier: 0.03, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 200 },
  ];
  const result = core.reanalyzeRecommendationForSwitch(rows, { ...core.DEFAULT_CONFIG, mode: 'speed' }, { groupId: 2, stable: true }, 1);

  assert.equal(result.reason, '稳定推荐与切换目标不一致，请重新检测');
  assert.equal(result.target.groupId, 1);
  assert.equal(result.winner.groupId, 1);
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

test('formats readable model detection reasons without changing warning semantics', () => {
  const suspected = {
    status: 'suspected',
    applicable: true,
    reason_codes: [
      'COT_NOT_RUN',
      'MIXED_VARIANT_SIGNAL',
      'JUICE_PASSED',
      'VARIANT_MISMATCH',
      'future_reason_code',
    ],
  };

  assert.equal(core.getModelDetectionReasonLabel('create_failed'), '检测任务创建失败');
  assert.equal(core.getModelDetectionReasonLabel('future_reason_code'), 'Future reason code');
  assert.deepEqual(core.getModelDetectionReasonLabels(suspected, false), [
    '检测到不同模型特征',
    '检测模型与声明模型不一致',
    'Future reason code',
  ]);
  assert.equal(core.formatModelDetectionReasonSummary(suspected), '检测到不同模型特征；检测模型与声明模型不一致');
  assert.equal(core.formatModelDetectionSummary(suspected), '疑似（检测到不同模型特征；检测模型与声明模型不一致）');
  assert.equal(
    core.formatModelDetectionTitle(suspected),
    '疑似：本次仅运行 Juice 指纹检测，未运行 COT 检测；检测到不同模型特征；Juice 指纹检测通过；检测模型与声明模型不一致；Future reason code',
  );
  assert.equal(core.hasModelDetectionWarning({ model_detection: suspected }), true);

  const informationalOnly = { status: 'not_tested', reasonCodes: ['COT_NOT_RUN', 'JUICE_PASSED'] };
  assert.equal(core.formatModelDetectionSummary(informationalOnly), '未检测');
  assert.equal(core.formatModelDetectionTitle(informationalOnly), '未检测：本次仅运行 Juice 指纹检测，未运行 COT 检测；Juice 指纹检测通过');
  assert.equal(core.formatModelDetectionReasonSummary({
    status: 'suspected',
    reason_codes: ['V4_PASSED', 'FINAL_REQUEST_ERRORS'],
  }), '部分最终请求失败');

  const passed = { status: 'passed', reason_codes: ['JUICE_PASSED', 'COT_NOT_RUN'] };
  assert.equal(core.formatModelDetectionSummary(passed), '检测通过');
  assert.deepEqual(core.getModelDetectionReasonLabels(passed), []);
  assert.equal(core.formatModelDetectionTitle(passed), '');
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

test('requires the configured real-user TTFT sample floor before ranking by user latency', () => {
  const rows = [
    { planType: 'low-sample-fast', group_id: 1, priceMultiplier: 0.05, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 2000, userAvgTtftMs: 100, userSampleCount: 3, userHasData: true, warningReasons: [] },
    { planType: 'well-sampled', group_id: 2, priceMultiplier: 0.05, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 500, userAvgTtftMs: 400, userSampleCount: 30, userHasData: true, warningReasons: [] },
  ];
  const relaxed = { ...core.DEFAULT_CONFIG, mode: 'speed', latencySource: 'user', minUserTtftSamples: 1 };
  const strict = { ...relaxed, minUserTtftSamples: 10 };
  const strictAnalysis = core.analyzeCandidates(rows, strict);

  assert.equal(core.rankCandidates(rows, relaxed)[0].planType, 'low-sample-fast');
  assert.equal(core.rankCandidates(rows, strict, strictAnalysis)[0].planType, 'well-sampled');
  assert.equal(strictAnalysis.counts.userLatencySampleFallbacks, 1);
  assert.notEqual(core.getCandidateAnalysisSignature(relaxed), core.getCandidateAnalysisSignature(strict));
  assert.notEqual(core.getRecommendationStrategySignature(relaxed), core.getRecommendationStrategySignature(strict));
  assert.equal(
    core.getRecommendationStrategySignature({ ...core.DEFAULT_CONFIG, latencySource: 'probe', minUserTtftSamples: 1 }),
    core.getRecommendationStrategySignature({ ...core.DEFAULT_CONFIG, latencySource: 'probe', minUserTtftSamples: 10 }),
  );
});

test('counts only eligible-stage model warnings and real-user sample fallbacks in diagnostics', () => {
  const rows = [
    { planType: 'hidden-detection', group_id: 1, priceMultiplier: 0.05, visibleInHall: false, available: true, successRates: { '10m': 1 }, modelDetection: { status: 'suspected' }, warningReasons: [] },
    { planType: 'unavailable-detection', group_id: 2, priceMultiplier: 0.05, available: false, successRates: { '10m': 1 }, modelDetection: { status: 'suspected' }, warningReasons: [] },
    { planType: 'candidate-detection', group_id: 3, priceMultiplier: 0.05, available: true, successRates: { '10m': 1 }, modelDetection: { status: 'suspected' }, warningReasons: [] },
    { planType: 'low-sample-candidate', group_id: 4, priceMultiplier: 0.05, available: true, successRates: { '10m': 1 }, firstTokenLatencyMs: 900, userAvgTtftMs: 100, userSampleCount: 3, userHasData: true, warningReasons: [] },
  ];
  const analysis = core.analyzeCandidates(rows, { ...core.DEFAULT_CONFIG, latencySource: 'user', minUserTtftSamples: 10 });

  assert.equal(analysis.counts.unavailable, 2);
  assert.equal(analysis.counts.warnings, 1);
  assert.equal(analysis.counts.modelDetectionWarnings, 1);
  assert.equal(analysis.counts.userLatencySampleFallbacks, 1);
  assert.deepEqual(analysis.candidates.map((candidate) => candidate.name), ['low-sample-candidate']);
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

test('resets winner stability when the recommendation strategy changes', () => {
  const nominalSignature = core.getRecommendationStrategySignature({
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis: 'nominal',
  });
  const effectiveSignature = core.getRecommendationStrategySignature({
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis: 'effectiveInput1h',
  });
  let state = core.advanceStability(core.createStabilityState(), 14, 2, nominalSignature);
  state = core.advanceStability(state, 14, 2, nominalSignature);
  assert.equal(state.stable, true);

  state = core.advanceStability(state, 14, 2, effectiveSignature);
  assert.equal(state.count, 1);
  assert.equal(state.stable, false);
  assert.equal(state.strategySignature, effectiveSignature);
});

test('blocks switching when the cached recommendation price snapshot is no longer current', () => {
  const config = {
    ...core.DEFAULT_CONFIG,
    mode: 'price',
    recommendationPriceBasis: 'effectiveInput1h',
  };
  const strategySignature = core.getRecommendationStrategySignature(config);
  const stability = { groupId: 14, count: 2, stable: true, strategySignature };
  const winner = {
    groupId: 14,
    price: 0.02,
    priceMultiplier: 0.02,
    rankingPriceBasis: 'effectiveInput1h',
    rankingPriceValue: 0.1,
    effectiveInputPricePerMillion1h: 0.1,
    runtimeCache1h: { ready: true, stale: false },
  };

  assert.equal(core.getRecommendationSnapshotBlockReason(winner, config, stability), '');
  assert.equal(core.getRecommendationSnapshotBlockReason(winner, {
    ...config,
    recommendationPriceBasis: 'effectiveMultiplier1h',
  }, stability), '推荐策略已变化，请重新检测');
  assert.equal(core.getRecommendationSnapshotBlockReason({
    ...winner,
    rankingPriceBasis: 'nominal',
  }, config, stability), '推荐价格口径已变化，请重新检测');
  assert.equal(core.getRecommendationSnapshotBlockReason({
    ...winner,
    runtimeCache1h: { ready: true, stale: true },
  }, config, stability), '1 小时真实输入价当前不可用，请重新检测');
  assert.equal(core.getRecommendationSnapshotBlockReason({
    ...winner,
    rankingPriceValue: 0.2,
  }, config, stability), '推荐价格数据已变化，请重新检测');

  const switchState = {
    loading: false,
    authError: '',
    winner,
    key: { groupId: 20 },
    stability,
    requiredChecks: 2,
    config,
  };
  assert.equal(core.getSwitchBlockReason(switchState), '');
  assert.equal(core.getSwitchBlockReason({
    ...switchState,
    winner: { ...winner, runtimeCache1h: { ready: true, stale: true } },
  }), '1 小时真实输入价当前不可用，请重新检测');
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

test('keeps provider auto refresh anchored to the last refresh time', () => {
  const providerEnhancerSource = userscriptSource.slice(
    userscriptSource.indexOf('class ProviderSortEnhancer'),
    userscriptSource.indexOf('class AppRouter'),
  );
  assert.equal(core.getProviderRefreshDelay(59_000, 0, 60_000), 1_000);
  assert.equal(core.getProviderRefreshDelay(60_000, 0, 60_000), 0);
  assert.equal(core.getProviderRefreshDelay(90_000, 0, 60_000), 0);
  assert.equal(core.getProviderRefreshDelay(10_000, 20_000, 60_000), 60_000);
  assert.equal(core.getProviderRefreshDelay(Number.NaN, 0, 60_000), 0);
  assert.equal(core.getProviderRefreshTimerDelay(59_000, 0, 60_000), 1_000);
  assert.equal(core.getProviderRefreshTimerDelay(59_999, 0, 60_000), 1_000);
  assert.equal(core.getProviderRefreshTimerDelay(60_000, 0, 60_000), 1_000);
  assert.equal(core.getProviderRefreshTimerDelay(60_000, 0, 60_000, true), 5_000);
  assert.equal(core.getProviderRefreshTimerDelay(90_000, 0, 60_000, true), 5_000);
  assert.equal(core.getProviderRefreshTimerDelay(10_000, 20_000, 60_000), 60_000);
  assert.equal(core.getProviderRefreshTimerDelay(Number.NaN, 0, 60_000), 1_000);
  assert.equal(core.getProviderRefreshTimerDelay(Number.NaN, 0, 60_000, true), 5_000);
  assert.match(providerEnhancerSource, /this\.refreshTimer = window\.setTimeout\(\(\) => \{/);
  assert.match(providerEnhancerSource, /const refreshStarted = refreshDue && this\.refresh\(config, now\);/);
  assert.match(providerEnhancerSource, /if \(refreshStarted && this\.refreshing\) return;/);
  assert.match(providerEnhancerSource, /if \(this\.refreshing\) return;\s*if \(!this\.beginRefreshTracking\(button, root\)\)/);
  assert.match(providerEnhancerSource, /const refreshUnavailable = forceBackoff \|\| \(refreshDue && !refreshStarted\);/);
  assert.match(providerEnhancerSource, /getProviderRefreshTimerDelay\(Date\.now\(\), this\.lastRefreshAt, intervalMs, refreshUnavailable\)/);
  assert.match(providerEnhancerSource, /this\.refreshCompletionTimer = window\.setTimeout\(\(\) => this\.completeRefreshTracking\(false\), PROVIDER_REFRESH_COMPLETION_TIMEOUT_MS\);/);
  assert.match(providerEnhancerSource, /this\.refreshDataSignature = getProviderRefreshDataSignature\(observedRoot\);/);
  assert.match(providerEnhancerSource, /if \(dataSignature && dataSignature !== this\.refreshDataSignature\) this\.refreshSawDataChange = true;/);
  assert.match(providerEnhancerSource, /if \(this\.refreshSawDataChange && !busy\) this\.completeRefreshTracking\(true\);/);
  assert.match(providerEnhancerSource, /this\.syncRefreshTimer\(false, !succeeded\);/);
  assert.match(providerEnhancerSource, /if \(!isPageVisible\(\)\) \{\s*if \(this\.refreshTimer\) window\.clearTimeout\(this\.refreshTimer\);/);
  assert.doesNotMatch(providerEnhancerSource, /this\.refreshTimer = window\.setInterval/);
});

test('backs off provider DOM scans only while the native refresh button is unavailable', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalDateNow = Date.now;
  const config = JSON.stringify({ providerAutoRefresh: true, providerRefreshIntervalSeconds: 60 });
  let now = 60_000;
  let buttons = [];
  let semanticButton = null;
  let scheduledDelay = null;
  let storageReads = 0;
  let mainLookups = 0;
  let semanticScans = 0;
  let fallbackScans = 0;
  let clicks = 0;
  const main = {
    querySelector: (selector) => {
      assert.match(selector, /monitor-icon-button\[title="刷新监测数据"\]/);
      semanticScans += 1;
      return semanticButton;
    },
    querySelectorAll: (selector) => {
      assert.equal(selector, 'button');
      fallbackScans += 1;
      return buttons;
    },
  };
  globalThis.localStorage = {
    getItem: () => {
      storageReads += 1;
      return config;
    },
  };
  globalThis.document = {
    hidden: false,
    querySelector: (selector) => {
      assert.equal(selector, 'main');
      mainLookups += 1;
      return main;
    },
  };
  globalThis.window = {
    setTimeout: (callback, delay) => {
      scheduledDelay = delay;
      return 1;
    },
    clearTimeout: () => {},
  };
  Date.now = () => now;

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.active = true;
    enhancer.lastRefreshAt = 0;
    enhancer.syncRefreshTimer(true);
    assert.equal(scheduledDelay, 5_000);
    assert.equal(storageReads, 1);
    assert.equal(mainLookups, 1);
    assert.equal(semanticScans, 1);
    assert.equal(fallbackScans, 1);

    semanticButton = {
      textContent: '',
      className: 'monitor-icon-button',
      disabled: true,
    };
    scheduledDelay = null;
    storageReads = 0;
    mainLookups = 0;
    semanticScans = 0;
    fallbackScans = 0;
    enhancer.lastRefreshAt = 0;
    enhancer.syncRefreshTimer(true);
    assert.equal(scheduledDelay, 5_000);
    assert.equal(storageReads, 0);
    assert.equal(mainLookups, 1);
    assert.equal(semanticScans, 1);
    assert.equal(fallbackScans, 0);

    semanticButton = {
      textContent: '',
      className: 'monitor-icon-button',
      disabled: false,
      getAttribute: (name) => (name === 'aria-disabled' ? 'true' : null),
      click: () => { clicks += 1; },
    };
    scheduledDelay = null;
    storageReads = 0;
    mainLookups = 0;
    semanticScans = 0;
    fallbackScans = 0;
    enhancer.lastRefreshAt = 0;
    enhancer.syncRefreshTimer(true);
    assert.equal(clicks, 0);
    assert.equal(scheduledDelay, 5_000);
    assert.equal(storageReads, 0);
    assert.equal(mainLookups, 1);
    assert.equal(semanticScans, 1);
    assert.equal(fallbackScans, 0);

    semanticButton = {
      textContent: '',
      className: 'monitor-icon-button',
      disabled: false,
      click: () => { clicks += 1; },
    };
    scheduledDelay = null;
    storageReads = 0;
    mainLookups = 0;
    semanticScans = 0;
    fallbackScans = 0;
    enhancer.lastRefreshAt = 0;
    enhancer.syncRefreshTimer(true);
    assert.equal(clicks, 1);
    assert.equal(enhancer.lastRefreshAt, 60_000);
    assert.equal(scheduledDelay, 60_000);
    assert.equal(storageReads, 0);
    assert.equal(mainLookups, 1);
    assert.equal(semanticScans, 1);
    assert.equal(fallbackScans, 0);

    scheduledDelay = null;
    storageReads = 0;
    mainLookups = 0;
    semanticScans = 0;
    fallbackScans = 0;
    enhancer.lastRefreshAt = 1_000;
    enhancer.syncRefreshTimer(true);
    assert.equal(scheduledDelay, 1_000);
    assert.equal(storageReads, 0);
    assert.equal(mainLookups, 0);
    assert.equal(semanticScans, 0);
    assert.equal(fallbackScans, 0);
  } finally {
    Date.now = originalDateNow;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('confirms provider auto refresh only after data changes, then backs off when loading ends without data', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalDateNow = Date.now;
  let now = 60_000;
  let observer = null;
  let generatedText = '更新于 2026/08/24 17:00:00';
  const timers = [];
  const generatedNode = {
    get textContent() { return generatedText; },
  };
  const root = {
    contains: () => true,
    querySelector: (selector) => (selector.includes('monitor-generated-at') ? generatedNode : button),
    querySelectorAll: () => [],
  };
  const button = {
    disabled: false,
    className: 'monitor-icon-button',
    click: () => { button.disabled = true; },
  };
  globalThis.document = { hidden: false, querySelector: () => root };
  globalThis.window = {
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout: () => {},
  };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  };
  Date.now = () => now;

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.active = true;
    enhancer.providerConfigLoaded = true;
    enhancer.providerAutoRefresh = true;
    enhancer.providerRefreshIntervalSeconds = 60;
    const schedules = [];
    enhancer.syncRefreshTimer = (...args) => { schedules.push(args); };

    assert.equal(enhancer.refresh(undefined, now), true);
    assert.equal(button.disabled, true);
    assert.equal(enhancer.lastRefreshAt, 0);
    assert.equal(enhancer.refreshing, true);
    assert.equal(timers[0].delay, 15_000);

    observer.callback([{ target: button }]);
    assert.equal(enhancer.refreshing, true);
    button.disabled = false;
    now = 61_000;
    observer.callback([{ target: button }]);
    assert.equal(enhancer.refreshing, true);
    assert.equal(enhancer.lastRefreshAt, 0);
    generatedText = '更新于 2026/08/24 17:00:01';
    observer.callback([{ target: generatedNode }]);
    assert.equal(enhancer.refreshing, false);
    assert.equal(enhancer.lastRefreshAt, 61_000);
    assert.deepEqual(schedules, [[false, false]]);

    now = 121_000;
    schedules.length = 0;
    timers.length = 0;
    button.disabled = false;
    assert.equal(enhancer.refresh(undefined, now), true);
    observer.callback([{ target: button }]);
    button.disabled = false;
    observer.callback([{ target: button }]);
    assert.equal(enhancer.refreshing, true);
    assert.equal(enhancer.lastRefreshAt, 61_000);
    const timeout = timers.find((timer) => timer.delay === 15_000);
    timeout.callback();
    assert.equal(enhancer.lastRefreshAt, 61_000);
    assert.equal(enhancer.refreshing, false);
    assert.deepEqual(schedules, [[false, true]]);
  } finally {
    Date.now = originalDateNow;
    if (originalMutationObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = originalMutationObserver;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('invalidates provider sorting and refresh scheduling only for their own settings', () => {
  const originalLocalStorage = globalThis.localStorage;
  let storedConfig = {
    providerSortPreference: 'rate',
    providerAutoRefresh: true,
    providerRefreshIntervalSeconds: 60,
  };
  let storageReads = 0;
  globalThis.localStorage = {
    getItem: () => {
      storageReads += 1;
      return JSON.stringify(storedConfig);
    },
  };

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.loadProviderConfig();
    enhancer.active = true;
    enhancer.applied = true;
    let observerStarts = 0;
    let applyQueues = 0;
    let refreshSchedules = 0;
    enhancer.observeUntilApplied = () => { observerStarts += 1; };
    enhancer.queueApply = () => { applyQueues += 1; };
    enhancer.syncRefreshTimer = () => { refreshSchedules += 1; };

    storedConfig = { ...storedConfig, latencySource: 'user' };
    enhancer.onConfigChanged();
    assert.equal(enhancer.applied, true);
    assert.equal(observerStarts, 0);
    assert.equal(applyQueues, 0);
    assert.equal(refreshSchedules, 0);

    storedConfig = { ...storedConfig, providerSortPreference: 'user' };
    enhancer.onConfigChanged();
    assert.equal(enhancer.providerSortPreference, 'user');
    assert.equal(enhancer.applied, false);
    assert.equal(observerStarts, 1);
    assert.equal(applyQueues, 1);
    assert.equal(refreshSchedules, 0);

    enhancer.applied = true;
    storedConfig = { ...storedConfig, providerAutoRefresh: false };
    enhancer.onConfigChanged();
    assert.equal(enhancer.providerAutoRefresh, false);
    assert.equal(enhancer.applied, true);
    assert.equal(observerStarts, 1);
    assert.equal(applyQueues, 1);
    assert.equal(refreshSchedules, 1);

    storedConfig = { ...storedConfig, providerRefreshIntervalSeconds: 90 };
    enhancer.onConfigChanged();
    assert.equal(enhancer.providerRefreshIntervalSeconds, 90);
    assert.equal(observerStarts, 1);
    assert.equal(applyQueues, 1);
    assert.equal(refreshSchedules, 2);
    assert.equal(storageReads, 5);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('converges a reversed provider sort through the native default state before applying', () => {
  const originalDocument = globalThis.document;
  let state = 'worst';
  let clicks = 0;
  let queuedVerifications = 0;
  const controls = {};
  const createButtons = () => {
    const rate = {
      textContent: state === 'best' ? '倍率 ↑' : state === 'worst' ? '倍率 ↓' : '倍率',
      className: state === 'best' || state === 'worst' ? 'monitor-sort-head active' : 'monitor-sort-head',
      closest: (selector) => (selector === '.monitor-sort-controls' ? controls : null),
      click: () => { clicks += 1; },
    };
    const fallback = {
      textContent: state === 'default' ? '默认 ↓' : '默认',
      className: state === 'default' ? 'monitor-sort-head active' : 'monitor-sort-head',
      closest: (selector) => (selector === '.monitor-sort-controls' ? controls : null),
    };
    return [fallback, rate];
  };
  globalThis.document = {
    querySelectorAll: () => createButtons(),
  };

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.active = true;
    enhancer.providerConfigLoaded = true;
    enhancer.providerSortPreference = 'rate';
    enhancer.queueSortVerification = () => { queuedVerifications += 1; };

    assert.equal(enhancer.apply(), false);
    assert.equal(clicks, 1);
    assert.equal(enhancer.applied, false);

    assert.equal(enhancer.apply(), false);
    assert.equal(enhancer.apply(), false);
    assert.equal(clicks, 1);
    assert.equal(enhancer.sortConvergenceExhausted, false);

    state = 'default';
    assert.equal(enhancer.apply(), false);
    assert.equal(clicks, 2);
    assert.equal(enhancer.applied, false);

    state = 'best';
    assert.equal(enhancer.apply(), true);
    assert.equal(clicks, 2);
    assert.equal(queuedVerifications, 2);
    assert.equal(enhancer.applied, true);
    assert.equal(enhancer.sortConvergenceExhausted, false);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('bounds provider sort clicks without treating a non-target state as applied', () => {
  const originalDocument = globalThis.document;
  let state = 'worst';
  let clicks = 0;
  const controls = {};
  const createButtons = () => [{
    textContent: state === 'worst' ? '倍率 ↓' : '倍率',
    className: state === 'worst' ? 'monitor-sort-head active' : 'monitor-sort-head',
    closest: (selector) => (selector === '.monitor-sort-controls' ? controls : null),
    click: () => { clicks += 1; },
  }, {
    textContent: state === 'default' ? '默认 ↓' : '默认',
    className: state === 'default' ? 'monitor-sort-head active' : 'monitor-sort-head',
    closest: (selector) => (selector === '.monitor-sort-controls' ? controls : null),
  }, {
    textContent: state === 'other' ? '用户速度 ↑' : '用户速度',
    className: state === 'other' ? 'monitor-sort-head active' : 'monitor-sort-head',
    closest: (selector) => (selector === '.monitor-sort-controls' ? controls : null),
  }];
  globalThis.document = { querySelectorAll: () => createButtons() };

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.active = true;
    enhancer.providerConfigLoaded = true;
    enhancer.providerSortPreference = 'rate';
    enhancer.queueSortVerification = () => {};

    assert.equal(enhancer.apply(), false);
    state = 'default';
    assert.equal(enhancer.apply(), false);
    state = 'other';
    assert.equal(enhancer.apply(), false);
    assert.equal(clicks, 2);
    assert.equal(enhancer.applied, false);
    assert.equal(enhancer.sortConvergenceExhausted, true);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('recognizes a manual click from inside the new provider refresh icon', () => {
  const originalDateNow = Date.now;
  let button;
  const root = {
    querySelector: () => button,
    querySelectorAll: () => [button],
  };
  button = {
    textContent: '',
    className: 'monitor-icon-button',
    getAttribute: (name) => (name === 'title' ? '刷新监测数据' : null),
    closest: (selector) => (selector === '[data-testid="llm-monitor-panel"]' || selector === 'main' ? root : null),
  };
  const nestedIcon = { closest: (selector) => (selector === 'button' ? button : null) };
  let refreshIfDue = null;
  Date.now = () => 42_000;

  try {
    const enhancer = new core.ProviderSortEnhancer();
    enhancer.syncRefreshTimer = (value) => { refreshIfDue = value; };
    enhancer.onPageClick({ target: nestedIcon });

    assert.equal(enhancer.lastRefreshAt, 42_000);
    assert.equal(refreshIfDue, false);
  } finally {
    Date.now = originalDateNow;
  }
});

test('ignores a manual click inside an ARIA-disabled provider refresh icon', () => {
  let button;
  const root = {
    querySelector: () => button,
    querySelectorAll: () => [button],
  };
  button = {
    textContent: '',
    className: 'monitor-icon-button',
    disabled: false,
    getAttribute: (name) => {
      if (name === 'title') return '刷新监测数据';
      if (name === 'aria-disabled') return 'true';
      return null;
    },
    closest: (selector) => (selector === '[data-testid="llm-monitor-panel"]' || selector === 'main' ? root : null),
  };
  const nestedIcon = { closest: (selector) => (selector === 'button' ? button : null) };
  const enhancer = new core.ProviderSortEnhancer();
  enhancer.lastRefreshAt = 7_000;
  enhancer.syncRefreshTimer = () => assert.fail('disabled refresh must not reschedule the provider timer');

  enhancer.onPageClick({ target: nestedIcon });

  assert.equal(enhancer.lastRefreshAt, 7_000);
});

test('does not reset provider timing for an unrelated local refresh button', () => {
  const semanticButton = { textContent: '', className: 'monitor-icon-button' };
  const localRefresh = { textContent: '刷新' };
  const root = {
    querySelector: () => semanticButton,
    querySelectorAll: () => [localRefresh, semanticButton],
  };
  localRefresh.closest = (selector) => (selector === '[data-testid="llm-monitor-panel"]' || selector === 'main' ? root : null);
  const nested = { closest: (selector) => (selector === 'button' ? localRefresh : null) };
  const enhancer = new core.ProviderSortEnhancer();
  enhancer.lastRefreshAt = 7_000;
  enhancer.syncRefreshTimer = () => assert.fail('unrelated refresh must not reschedule the provider timer');

  enhancer.onPageClick({ target: nested });

  assert.equal(enhancer.lastRefreshAt, 7_000);
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
    {
      group_id: 20,
      planType: 'same-name',
      priceMultiplier: 0.08,
      firstTokenLatencyMs: 320,
      available: true,
      effectiveInputPricePerMillion1h: 0.3,
      effectiveMultiplier: 0.05,
      effectiveMultiplierReady: true,
      outputTps: 55,
      public_detail: '倍率变更提示',
      hewei_check_url: 'https://hvoy.ai/report/group-20',
      model_detection: { status: 'suspected', reason_codes: ['MIXED_VARIANT_SIGNAL'] },
    },
    { group_id: 21, priceMultiplier: null, firstTokenLatencyMs: null },
    { group_id: 'invalid', priceMultiplier: 0.01, firstTokenLatencyMs: 10 },
  ]);

  assert.deepEqual(metrics.get(14), { multiplier: 0.04, latencyMs: 1141 });
  assert.deepEqual(metrics.get(20), {
    multiplier: 0.08,
    latencyMs: 320,
    modelDetection: {
      status: 'suspected',
      reason_codes: ['MIXED_VARIANT_SIGNAL'],
      reasonCodes: ['MIXED_VARIANT_SIGNAL'],
    },
    detectionStatus: 'suspected',
    effectivePricing: {
      inputPricePerMillion: 0.3,
      multiplier: 0.05,
      ready: true,
      reason: null,
      runtimeCache1h: null,
      hasData: true,
    },
    outputTokensPerSecond: 55,
    publicDetail: '倍率变更提示',
    heweiCheckUrl: 'https://hvoy.ai/report/group-20',
  });
  assert.deepEqual(metrics.get(21), { multiplier: null, latencyMs: null });
  assert.equal(metrics.has('same-name'), false);
  assert.equal(metrics.size, 3);

  const userMetrics = core.buildGroupMetricMap([{
    group_id: 22,
    priceMultiplier: 0.1,
    firstTokenLatencyMs: 900,
    userAvgTtftMs: 1200,
    userSampleCount: 3,
    userHasData: true,
  }], { ...core.DEFAULT_CONFIG, latencySource: 'user' });
  assert.deepEqual(userMetrics.get(22), { multiplier: 0.1, latencyMs: 1200, latencySampleCount: 3 });

  const lowSampleMetrics = core.buildGroupMetricMap([{
    group_id: 23,
    priceMultiplier: 0.1,
    firstTokenLatencyMs: 900,
    userAvgTtftMs: 300,
    userSampleCount: 3,
    userHasData: true,
  }], { ...core.DEFAULT_CONFIG, latencySource: 'user', minUserTtftSamples: 10 });
  assert.deepEqual(lowSampleMetrics.get(23), {
    multiplier: 0.1,
    latencyMs: 900,
    latencyMetricSource: 'probe',
    latencyFallback: true,
    userSampleInsufficient: true,
    userSampleCount: 3,
    minUserTtftSamples: 10,
  });
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
  assert.deepEqual(core.formatGroupDropdownMonitor({
    available: true,
    warningReasons: [],
    model_detection: { status: 'suspected', reason_codes: ['MIXED_VARIANT_SIGNAL', 'COT_NOT_RUN'] },
  }), {
    statusText: '可用 · 疑似',
    statusTone: 'warning',
    latencyText: '首 Token 暂无数据',
    latencyValueText: '',
    detectionTitle: '疑似：检测到不同模型特征；本次仅运行 Juice 指纹检测，未运行 COT 检测',
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
    latencyText: '运行时 P50 TTFT 1385 ms（12 条）',
    latencyValueText: '1385 ms（12 条）',
  });
  assert.equal(core.formatKeyOptionLabel(
    { name: 'main', groupName: 'A001' },
    { multiplier: 0.05, latencyMs: 1384.6, latencySampleCount: 12 },
    'user',
  ), 'main · A001 · ×0.05 · 运行时 P50 TTFT 1385 ms（12 条）');

  const lowSample = { available: true, firstTokenLatencyMs: 900, userAvgTtftMs: 300, userSampleCount: 3, userHasData: true };
  assert.deepEqual(core.formatGroupDropdownMonitor(lowSample, 'user', 10), {
    statusText: '可用',
    statusTone: 'available',
    latencyText: '运行时 P50 TTFT（样本不足 3/10，回退探测） 900 ms',
    latencyValueText: '900 ms',
  });
  assert.equal(core.formatKeyOptionLabel(
    { name: 'main', groupName: 'A001' },
    {
      multiplier: 0.05,
      latencyMs: 900,
      latencyMetricSource: 'probe',
      latencyFallback: true,
      userSampleInsufficient: true,
      userSampleCount: 3,
      minUserTtftSamples: 10,
    },
    'user',
  ), 'main · A001 · ×0.05 · 运行时 P50 TTFT（样本不足 3/10，回退探测） 900 ms');
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

test('uses exact usage API tokens and accepts the API token billing mode', () => {
  const index = core.buildUsageModelPriceIndex([{
    planType: 'A003-Plus',
    priceMultiplier: 0.11,
    model_prices: {
      sol: { input_per_million: 0.65, cache_input_per_million: 0.065, output_per_million: 3.9 },
    },
  }]);
  const item = core.projectUsageAuditItems([{
    id: 42,
    model: 'gpt-5.6-sol',
    group: { name: 'A003-Plus' },
    rate_multiplier: 0.11,
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_tokens: 1_000_000,
    actual_cost: 4.615,
    billing_mode: 'token',
    api_key: { key: 'sk-must-not-appear' },
    ip_address: '192.0.2.1',
    user_agent: 'must-not-appear',
  }])[0];
  const result = core.auditUsageCostRecord(core.buildUsageAuditRecordFromApiItem(item), index);

  assert.equal(result.status, 'ok');
  assert.equal(result.exactTokens, true);
  assert.equal(result.roundingTolerance, 0);
  assert.equal(core.isMeteredUsageBillingMode('token'), true);
  assert.equal(core.isMeteredUsageBillingMode('包月'), false);
  assert.deepEqual(item, {
    id: '42',
    model: 'gpt-5.6-sol',
    groupName: 'a003-plus',
    rateMultiplier: 0.11,
    tokens: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheInputTokens: 1_000_000 },
    actualCost: 4.615,
    billingMode: 'token',
  });
  assert.equal(JSON.stringify(item).includes('sk-must-not-appear'), false);
  assert.equal(JSON.stringify(item).includes('192.0.2.1'), false);
  assert.equal(JSON.stringify(item).includes('must-not-appear'), false);
});

test('selects only the current exact usage resource request', () => {
  const pageWindow = { URL: globalThis.URL, location: { origin: 'https://aihub.top', href: 'https://aihub.top/usage' } };
  const path = core.getCurrentUsageRequestPath([
    { name: 'https://aihub.top/api/v1/usage?page=1&page_size=20' },
    { name: 'https://aihub.top/api/v1/usage/stats?start_date=2026-08-01' },
    { name: 'https://example.test/api/v1/usage?page=2' },
    { name: '/api/v1/usage?page=3&page_size=50&sort_by=created_at&sort_order=desc' },
    { name: 'not a valid url%' },
  ], pageWindow);

  assert.equal(path, '/usage?page=3&page_size=50&sort_by=created_at&sort_order=desc');
});

test('degrades safely when usage resource timing is unavailable', () => {
  const pageWindow = {
    URL: globalThis.URL,
    location: { origin: 'https://aihub.top', href: 'https://aihub.top/usage' },
    performance: { getEntriesByType: () => { throw new Error('unavailable'); } },
  };

  assert.equal(core.getCurrentUsageRequestPath(undefined, pageWindow), null);
});

test('builds stable usage audit view keys from the query and visible row ids', () => {
  const key = core.buildUsageAuditViewKey('/usage?page=2', ['3', '1', '2', '2', '', null]);

  assert.equal(key, '/usage?page=2#1,2,3');
  assert.equal(core.buildUsageAuditViewKey('/usage?page=2', ['2', '3', '1']), key);
  assert.notEqual(core.buildUsageAuditViewKey('/usage?page=3', ['1', '2', '3']), key);
  assert.notEqual(core.buildUsageAuditViewKey('/usage?page=2', ['1', '2', '4']), key);
  assert.equal(core.buildUsageAuditViewKey('', ['1']), '');
  assert.equal(core.buildUsageAuditViewKey('/usage?page=2', []), '');
});

test('deduplicates loaded and pending usage views while backing off failed views', () => {
  assert.equal(core.shouldLoadUsageAuditView({ key: '' }), false);
  assert.equal(core.shouldLoadUsageAuditView({ key: 'view', loadedKey: 'view' }), false);
  assert.equal(core.shouldLoadUsageAuditView({ key: 'view', pendingKey: 'view' }), false);
  assert.equal(core.shouldLoadUsageAuditView({
    key: 'view', failedKey: 'view', lastAttemptAt: 1_000, now: 15_999, retryMs: 15_000,
  }), false);
  assert.equal(core.shouldLoadUsageAuditView({
    key: 'view', failedKey: 'view', lastAttemptAt: 1_000, now: 16_000, retryMs: 15_000,
  }), true);
  assert.equal(core.shouldLoadUsageAuditView({
    key: 'next-view', failedKey: 'view', lastAttemptAt: 15_999, now: 16_000, retryMs: 15_000,
  }), true);
});

test('reuses the visible usage query when loading exact audit records', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const storage = { getItem: () => '' };
  let requestedUrl = '';
  globalThis.localStorage = storage;
  globalThis.window = {
    URL: globalThis.URL,
    localStorage: storage,
    location: { origin: 'https://aihub.top', href: 'https://aihub.top/usage?page=2' },
    performance: { getEntriesByType: () => [{ name: 'https://aihub.top/api/v1/usage?page=2&page_size=20&sort_by=created_at&sort_order=desc' }] },
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [{
          id: 9,
          model: 'gpt-5.6-sol',
          group: { name: 'A003-Plus' },
          rate_multiplier: 0.11,
          input_tokens: 1,
          output_tokens: 2,
          cache_read_tokens: 3,
          actual_cost: 0.00001,
          billing_mode: 'token',
          api_key: { key: 'sk-must-not-appear' },
        }] } }),
      };
    },
  };

  try {
    const items = await core.fetchCurrentUsageAuditItems();
    assert.equal(requestedUrl, '/api/v1/usage?page=2&page_size=20&sort_by=created_at&sort_order=desc');
    assert.deepEqual(items, [{
      id: '9',
      model: 'gpt-5.6-sol',
      groupName: 'a003-plus',
      rateMultiplier: 0.11,
      tokens: { inputTokens: 1, outputTokens: 2, cacheInputTokens: 3 },
      actualCost: 0.00001,
      billingMode: 'token',
    }]);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('uses an explicitly captured usage path even when the latest resource entry changes', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const storage = { getItem: () => '' };
  let requestedUrl = '';
  globalThis.localStorage = storage;
  globalThis.window = {
    URL: globalThis.URL,
    localStorage: storage,
    location: { origin: 'https://aihub.top', href: 'https://aihub.top/usage?page=9' },
    performance: { getEntriesByType: () => [{ name: 'https://aihub.top/api/v1/usage?page=9&page_size=20' }] },
    fetch: async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => ({ data: { items: [] } }) };
    },
  };

  try {
    await core.fetchCurrentUsageAuditItems({ path: '/usage?page=4&page_size=20' });
    assert.equal(requestedUrl, '/api/v1/usage?page=4&page_size=20');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('keeps only eight recent usage audit views and refreshes cache recency on a hit', () => {
  const enhancer = new core.UsageMultiplierEnhancer();
  for (let index = 1; index <= 8; index += 1) {
    enhancer.cacheUsageAuditItems(`view-${index}`, [{ id: String(index) }]);
  }
  enhancer.getUsageAuditView = () => ({ path: '/usage?page=1', rowIds: ['1'], key: 'view-1' });
  enhancer.syncUsageAuditView([]);
  enhancer.cacheUsageAuditItems('view-9', [{ id: '9' }]);

  assert.equal(enhancer.usageAuditCache.size, 8);
  assert.equal(enhancer.usageAuditCache.has('view-1'), true);
  assert.equal(enhancer.usageAuditCache.has('view-2'), false);
  assert.equal(enhancer.usageItemsById.has('1'), true);
});

test('rechecks the live usage table before applying an exact response', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => [{}] };

  try {
    const enhancer = new core.UsageMultiplierEnhancer();
    enhancer.usageViewKey = 'captured-view';
    enhancer.isUsageDetailTable = () => true;
    enhancer.getUsageAuditView = () => ({ key: 'new-live-view' });

    assert.equal(enhancer.isUsageAuditViewCurrent({ key: 'captured-view' }), false);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('wakes the current usage view when its failure backoff expires', () => {
  const originalWindow = globalThis.window;
  const originalDateNow = Date.now;
  const timers = [];
  let now = 1_000;
  let renderCount = 0;
  globalThis.window = {
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout: () => {},
  };
  Date.now = () => now;

  try {
    const enhancer = new core.UsageMultiplierEnhancer();
    enhancer.active = true;
    enhancer.usageViewKey = 'view';
    enhancer.queueRender = () => { renderCount += 1; };

    enhancer.markUsageAuditFailure('view');
    assert.equal(enhancer.lastUsageFailureAt, 1_000);
    assert.equal(timers[0].delay, 15_000);

    now = 15_999;
    timers.shift().callback();
    assert.equal(renderCount, 0);
    assert.equal(timers[0].delay, 1);

    now = 16_000;
    timers.shift().callback();
    assert.equal(renderCount, 1);
  } finally {
    Date.now = originalDateNow;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('starts usage backoff when a failed request settles instead of when it starts', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalDateNow = Date.now;
  const storage = { getItem: () => '' };
  const timers = [];
  let rejectRequest;
  let now = 1_000;
  globalThis.localStorage = storage;
  globalThis.window = {
    URL: globalThis.URL,
    AbortController: globalThis.AbortController,
    localStorage: storage,
    location: { origin: 'https://aihub.top', href: 'https://aihub.top/usage' },
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
    fetch: () => new Promise((resolve, reject) => { rejectRequest = reject; }),
  };
  Date.now = () => now;

  try {
    const enhancer = new core.UsageMultiplierEnhancer();
    enhancer.active = true;
    enhancer.queueRender = () => {};
    const view = { path: '/usage?page=1', rowIds: ['1'], key: '/usage?page=1#1' };
    enhancer.usageViewKey = view.key;

    const load = enhancer.loadUsageAuditView(view);
    now = 16_000;
    rejectRequest(new Error('request failed after 15 seconds'));
    await load;

    assert.equal(enhancer.lastUsageFailureAt, 16_000);
    assert.equal(core.shouldLoadUsageAuditView({
      key: view.key,
      failedKey: enhancer.failedUsageViewKey,
      lastAttemptAt: enhancer.lastUsageFailureAt,
      now,
      retryMs: 15_000,
    }), false);
    assert.equal(timers.at(-1).delay, 15_000);
    enhancer.clearUsageAuditRetry();
  } finally {
    Date.now = originalDateNow;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('does not let a stale usage response overwrite the active page', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const storage = { getItem: () => '' };
  const pending = new Map();
  globalThis.localStorage = storage;
  globalThis.window = {
    URL: globalThis.URL,
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    localStorage: storage,
    location: { origin: 'https://aihub.top', href: 'https://aihub.top/usage' },
    fetch: (url) => new Promise((resolve) => pending.set(url, resolve)),
  };
  const makeResponse = (id) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { items: [{
      id,
      model: 'gpt-5.6-sol',
      group: { name: 'A003-Plus' },
      rate_multiplier: 0.11,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 3,
      actual_cost: 0.00001,
      billing_mode: 'token',
    }] } }),
  });

  try {
    const enhancer = new core.UsageMultiplierEnhancer();
    enhancer.active = true;
    enhancer.queueRender = () => {};
    const page1 = { path: '/usage?page=1', rowIds: ['1'], key: '/usage?page=1#1' };
    const page2 = { path: '/usage?page=2', rowIds: ['2'], key: '/usage?page=2#2' };

    enhancer.usageViewKey = page1.key;
    const firstLoad = enhancer.loadUsageAuditView(page1);
    enhancer.usageViewKey = page2.key;
    const secondLoad = enhancer.loadUsageAuditView(page2);

    pending.get('/api/v1/usage?page=2')(makeResponse(2));
    await secondLoad;
    pending.get('/api/v1/usage?page=1')(makeResponse(1));
    await firstLoad;

    assert.equal(enhancer.loadedUsageViewKey, page2.key);
    assert.equal(enhancer.usageItemsById.has('2'), true);
    assert.equal(enhancer.usageItemsById.has('1'), false);
    assert.equal(enhancer.usageAuditCache.has(page1.key), true);
    assert.equal(enhancer.usageAuditCache.has(page2.key), true);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
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

test('recognizes the usage detail table after optional columns are hidden or reordered', () => {
  const required = ['API 密钥', '模型', '分组', '计费模式', 'Token', '费用', '时间'];
  assert.equal(core.hasUsageDetailColumns(required), true);
  assert.equal(core.hasUsageDetailColumns(['时间', '费用', 'Token', '计费模式', '分组', '模型', 'API 密钥']), true);
  assert.equal(core.hasUsageDetailColumns([...required, '推理强度', '端点', 'IP', '类型', '延迟']), true);
  assert.equal(core.hasUsageDetailColumns(['模型', '分组', 'Token', '费用', '时间']), false);
  assert.equal(core.hasUsageDetailColumns(['分组', '请求', 'Token', '实际', '标准']), false);
});

test('keeps the public provider controls active while gating account features by login', () => {
  assert.deepEqual(core.getPageFeatures('/providers', true), { panel: true, usage: false, keyGroups: false, providerSort: true });
  assert.deepEqual(core.getPageFeatures('/keys?page=1', true), { panel: true, usage: false, keyGroups: true, providerSort: false });
  assert.deepEqual(core.getPageFeatures('/usage', true), { panel: true, usage: true, keyGroups: false, providerSort: false });
  assert.deepEqual(core.getPageFeatures('/dashboard', true), { panel: true, usage: false, keyGroups: false, providerSort: false });
  assert.deepEqual(core.getPageFeatures('/providers', false), { panel: false, usage: false, keyGroups: false, providerSort: true });
  assert.deepEqual(core.getPageFeatures('/usage', false), { panel: false, usage: false, keyGroups: false, providerSort: false });
});
