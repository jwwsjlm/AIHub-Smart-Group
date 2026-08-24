// ==UserScript==
// @name         AIHub Smart Group
// @name:zh-CN   AIHub 智能分组
// @namespace    local.aihub.smart-group
// @version      0.14.3
// @description  Recommend reliable low-cost groups on AIHub.
// @description:zh-CN 按价格、速度和可用性推荐 AIHub 分组
// @license      MIT
// @homepageURL   https://github.com/jwwsjlm/AIHub-Smart-Group
// @supportURL    https://github.com/jwwsjlm/AIHub-Smart-Group/issues
// @match        https://aihub.top/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

/* global module, GM_unregisterMenuCommand */

(function (factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') exported.start();
})(function () {
  'use strict';

  const ROOT_ID = 'aihub-smart-group-panel';
  const TOGGLE_ID = 'aihub-smart-group-toggle';
  const SCRIPT_VERSION = '0.14.3';
  const STORAGE_PREFIX = 'aihub-smart-group:';
  const CONFIG_CHANGE_EVENT = 'aihub-smart-group:config-changed';
  const ROUTER_REPLACE_EVENT = 'aihub-smart-group:router-replace';
  const API_REQUEST_TIMEOUT_MS = 15_000;
  const MONITOR_SUMMARY_CACHE_TTL_MS = 2_000;
  const MONITOR_SERIES_CACHE_TTL_MS = 60_000;
  const MONITOR_SAMPLE_CLOCK_SKEW_MS = 60_000;
  const MONITOR_HISTORY_SAMPLE_COUNT_CAP = 60;
  const USER_TTFT_SAMPLE_COUNT_MAX = 1_000_000;
  const ENHANCER_RENDER_DEBOUNCE_MS = 50;
  const ROUTER_SYNC_INTERVAL_MS = 2_000;
  const USAGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const USAGE_AUDIT_RETRY_MS = 15_000;
  const USAGE_AUDIT_CACHE_LIMIT = 8;
  const PROVIDER_SORT_MAX_CLICKS = 2;
  const PROVIDER_SORT_VERIFY_DELAY_MS = 250;
  const PROVIDER_REFRESH_RETRY_MS = 1_000;
  const PROVIDER_REFRESH_UNAVAILABLE_RETRY_MS = 5_000;
  const PROVIDER_REFRESH_COMPLETION_TIMEOUT_MS = 15_000;
  const PROVIDER_REFRESH_BUTTON_SELECTOR = [
    'button.monitor-icon-button[title="刷新监测数据"]',
    'button.monitor-icon-button[title="Refresh monitoring data"]',
  ].join(',');
  const USAGE_DETAIL_REQUIRED_HEADERS = Object.freeze([
    'API 密钥',
    '模型',
    '分组',
    '计费模式',
    'Token',
    '费用',
    '时间',
  ]);
  const GROUP_MODE_LABELS = Object.freeze({
    price: '价格',
    balance: '平衡',
    speed: '速度',
  });
  const LATENCY_SOURCE_LABELS = Object.freeze({
    probe: '主动探测首 Token',
    user: '运行时 P50 TTFT',
  });
  const MODEL_PRICE_MODEL_LABELS = Object.freeze({
    none: '不显示',
    sol: 'Sol',
    terra: 'Terra',
    luna: 'Luna',
  });
  const EFFECTIVE_MULTIPLIER_REASON_LABELS = Object.freeze({
    insufficient_samples: '样本不足',
    runtime_window_not_ready: '数据未就绪',
    runtime_metrics_stale: '数据已过期',
    openrouter_reference_unavailable: '参考价格不可用',
    openrouter_reference_stale: '参考价格已过期',
  });
  const MODEL_DETECTION_REASON_LABELS = Object.freeze({
    MIXED_VARIANT_SIGNAL: '检测到不同模型特征',
    VARIANT_MISMATCH: '检测模型与声明模型不一致',
    OUTPUT_REWRITE_SUSPECTED: '输出可能被上游改写',
    NEGATIVE_CONTROL_UNEXPECTED_MATCH: '阴性对照出现异常匹配',
    JUICE_SAMPLES_INCOMPLETE: 'Juice 样本不完整',
    OUTPUT_INTEGRITY_INCOMPLETE: '输出完整性对照不完整',
    COT_CONTROLS_INCOMPLETE: 'COT 对照测试不完整',
    COT_NOT_COMPATIBLE: 'COT 兼容证据不足',
    COT_NOT_RUN: '本次仅运行 Juice 指纹检测，未运行 COT 检测',
    JUICE_PASSED: 'Juice 指纹检测通过',
    V4_PASSED: 'Juice 指纹检测通过',
    V4_PROBABILITY_EVIDENCE_INSUFFICIENT: 'Juice 概率证据不足',
    V4_EXECUTION_FAILED: 'Juice 检测执行失败',
    FINAL_REQUEST_ERRORS: '部分最终请求失败',
    TRANSIENT_RETRIES: '检测期间发生临时重试',
    JOB_TIMEOUT: '检测任务超时',
    SERVICE_RESTARTED_CREDENTIALS_DISCARDED: '检测服务重启，任务凭据已清除',
    CREDENTIALS_UNAVAILABLE: '检测凭据不可用',
    CANCELLED: '检测任务已取消',
    CREATE_REJECTED: '检测器拒绝了任务参数',
    CREATE_FAILED: '检测任务创建失败',
    POLL_FAILED: '读取检测结果失败',
    DETECTOR_TARGET_CYCLE_MISMATCH: '检测器结果不属于同一次检测',
    DETECTOR_TARGET_ACCOUNT_MISMATCH: '检测器结果使用了不同账号',
  });
  const MODEL_DETECTION_INFORMATIONAL_REASON_CODES = Object.freeze(['COT_NOT_RUN', 'JUICE_PASSED', 'V4_PASSED']);
  const MODEL_PRICE_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const USAGE_COST_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
  const PROVIDER_SORT_LABELS = Object.freeze({
    rate: '倍率优先',
    default: '默认排序',
    realPrice: '真实价格优先',
    user: '用户速度排序',
    cacheHit: '缓存命中优先',
    successRate: '成功率优先',
    custom: '自定义排序',
  });
  const PROVIDER_SORT_BUTTON_TEXTS = Object.freeze({
    rate: Object.freeze(['倍率', 'Multiplier']),
    default: Object.freeze(['默认', 'Default']),
    realPrice: Object.freeze(['真实价格', 'Effective price']),
    user: Object.freeze(['用户速度', 'User speed']),
    cacheHit: Object.freeze(['缓存命中', 'Cache hit']),
    successRate: Object.freeze(['成功率', '可用率', 'Success rate']),
    custom: Object.freeze(['自定义', 'Custom']),
  });
  const PROVIDER_SORT_DIRECTIONS = Object.freeze({
    rate: '↑',
    default: '↓',
    realPrice: '↑',
    user: '↑',
    cacheHit: '↓',
    successRate: '↓',
    custom: '↓',
  });
  const RECOMMENDATION_PRICE_BASIS_LABELS = Object.freeze({
    nominal: '标称倍率',
    effectiveInput1h: '1 小时真实输入价',
    effectiveMultiplier1h: '1 小时预测倍率',
  });
  const RECOMMENDATION_PRICE_UNAVAILABLE_REASON_LABELS = Object.freeze({
    notReady: '未就绪',
    stale: '已过期',
    missing: '缺失',
  });
  const CANDIDATE_FILTER_SETTING_KEYS = Object.freeze([
    'minSuccess10m',
    'availabilityMode',
    'minSuccessPoints10m',
    'minConsecutiveSuccesses10m',
    'requireNoWarnings',
    'excludedGroupKeywords',
  ]);
  const DEFAULT_CONFIG = Object.freeze({
    minSuccess10m: 0.10,
    requireNoWarnings: true,
    consecutiveChecks: 2,
    pollIntervalSeconds: 30,
    cooldownMinutes: 10,
    autoSwitch: false,
    mode: 'price',
    balanceMaxPrice: 0.1,
    excludedGroupKeywords: '',
    maxMonitorAgeSeconds: 600,
    availabilityMode: 'percent',
    minSuccessPoints10m: 1,
    minConsecutiveSuccesses10m: 2,
    latencySource: 'probe',
    minUserTtftSamples: 1,
    modelPriceModel: 'sol',
    usageCostAuditEnabled: true,
    usageCostAuditDisplay: 'anomalies',
    usageCostAuditTolerancePercent: 1,
    recommendationPriceBasis: 'nominal',
    providerSortPreference: 'rate',
    providerAutoRefresh: true,
    providerRefreshIntervalSeconds: 60,
  });
  let activeRouter = null;

  function numberOr(value, fallback) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hasUsageDetailColumns(headers) {
    const labels = new Set((headers || []).map((header) => String(header || '').trim()));
    return USAGE_DETAIL_REQUIRED_HEADERS.every((header) => labels.has(header));
  }

  function isRefreshDue(now, lastCompletedAt, intervalMs) {
    const current = Number(now);
    const completedAt = Number(lastCompletedAt);
    const interval = Math.max(0, Number(intervalMs) || 0);
    return !Number.isFinite(completedAt)
      || completedAt <= 0
      || (Number.isFinite(current) ? current : Date.now()) - completedAt >= interval;
  }

  function getProviderRefreshDelay(now, lastRefreshAt, intervalMs) {
    const current = Number(now);
    const refreshedAt = Number(lastRefreshAt);
    const interval = Number(intervalMs);
    if (!Number.isFinite(current) || !Number.isFinite(refreshedAt) || !Number.isFinite(interval) || interval <= 0) return 0;
    return Math.max(0, interval - Math.max(0, current - refreshedAt));
  }

  function getProviderRefreshTimerDelay(now, lastRefreshAt, intervalMs, refreshUnavailable = false) {
    const minimumDelay = refreshUnavailable
      ? PROVIDER_REFRESH_UNAVAILABLE_RETRY_MS
      : PROVIDER_REFRESH_RETRY_MS;
    return Math.max(minimumDelay, getProviderRefreshDelay(now, lastRefreshAt, intervalMs));
  }

  function shouldRunControllerRefresh({
    active = true,
    visible = true,
    minimized = false,
    autoSwitch = false,
    loading = false,
    now = Date.now(),
    lastCompletedAt = 0,
    intervalMs = DEFAULT_CONFIG.pollIntervalSeconds * 1000,
  } = {}) {
    return active === true
      && visible === true
      && loading !== true
      && (minimized !== true || autoSwitch === true)
      && isRefreshDue(now, lastCompletedAt, intervalMs);
  }

  function normalizeExcludedGroupKeywords(value) {
    const source = Array.isArray(value) ? value.join('|') : String(value ?? '');
    const seen = new Set();
    return source.split('|')
      .map((keyword) => keyword.trim().toLocaleLowerCase())
      .filter((keyword) => {
        if (!keyword || seen.has(keyword)) return false;
        seen.add(keyword);
        return true;
      })
      .join('|');
  }

  function normalizeConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      minSuccess10m: clamp(numberOr(source.minSuccess10m, DEFAULT_CONFIG.minSuccess10m), 0, 1),
      requireNoWarnings: source.requireNoWarnings !== false,
      consecutiveChecks: Math.round(clamp(numberOr(source.consecutiveChecks, DEFAULT_CONFIG.consecutiveChecks), 1, 5)),
      pollIntervalSeconds: Math.round(clamp(numberOr(source.pollIntervalSeconds, DEFAULT_CONFIG.pollIntervalSeconds), 10, 3600)),
      cooldownMinutes: clamp(numberOr(source.cooldownMinutes, DEFAULT_CONFIG.cooldownMinutes), 0, 1440),
      autoSwitch: source.autoSwitch === true,
      mode: normalizeGroupMode(source.mode),
      balanceMaxPrice: clamp(numberOr(source.balanceMaxPrice, DEFAULT_CONFIG.balanceMaxPrice), 0, 1000),
      excludedGroupKeywords: normalizeExcludedGroupKeywords(source.excludedGroupKeywords),
      maxMonitorAgeSeconds: DEFAULT_CONFIG.maxMonitorAgeSeconds,
      availabilityMode: normalizeAvailabilityMode(source.availabilityMode),
      minSuccessPoints10m: Math.round(clamp(numberOr(source.minSuccessPoints10m, DEFAULT_CONFIG.minSuccessPoints10m), 1, 60)),
      minConsecutiveSuccesses10m: Math.round(clamp(numberOr(source.minConsecutiveSuccesses10m, DEFAULT_CONFIG.minConsecutiveSuccesses10m), 1, 60)),
      latencySource: normalizeLatencySource(source.latencySource),
      minUserTtftSamples: normalizeUserTtftSampleCount(source.minUserTtftSamples),
      modelPriceModel: normalizeModelPriceModel(source.modelPriceModel),
      usageCostAuditEnabled: source.usageCostAuditEnabled !== false,
      usageCostAuditDisplay: source.usageCostAuditDisplay === 'all' ? 'all' : 'anomalies',
      usageCostAuditTolerancePercent: clamp(numberOr(source.usageCostAuditTolerancePercent, DEFAULT_CONFIG.usageCostAuditTolerancePercent), 0.1, 100),
      recommendationPriceBasis: normalizeRecommendationPriceBasis(source.recommendationPriceBasis),
      providerSortPreference: normalizeProviderSortPreference(source.providerSortPreference),
      providerAutoRefresh: source.providerAutoRefresh !== false,
      providerRefreshIntervalSeconds: Math.round(clamp(numberOr(source.providerRefreshIntervalSeconds, DEFAULT_CONFIG.providerRefreshIntervalSeconds), 15, 3600)),
    };
  }

  function getSettingsPreviewTargets(changedKey) {
    const key = String(changedKey || '');
    const renderAll = !key;
    const candidateFilterChanged = CANDIDATE_FILTER_SETTING_KEYS.includes(key);
    return {
      recommendation: renderAll || candidateFilterChanged || key === 'recommendationPriceBasis',
      balance: renderAll || candidateFilterChanged || key === 'balanceMaxPrice' || key === 'latencySource' || key === 'minUserTtftSamples',
      excluded: renderAll || key === 'excludedGroupKeywords',
      cooldown: renderAll || key === 'cooldownMinutes',
    };
  }

  function getRecommendationPricePreviewSignature(config = DEFAULT_CONFIG) {
    const normalized = normalizeConfig(config);
    return JSON.stringify({
      recommendationPriceBasis: normalized.recommendationPriceBasis,
      availabilityMode: normalized.availabilityMode,
      minSuccess10m: normalized.minSuccess10m,
      minSuccessPoints10m: normalized.minSuccessPoints10m,
      minConsecutiveSuccesses10m: normalized.minConsecutiveSuccesses10m,
      requireNoWarnings: normalized.requireNoWarnings,
      excludedGroupKeywords: normalized.excludedGroupKeywords,
    });
  }

  function normalizeGroupMode(value) {
    return Object.prototype.hasOwnProperty.call(GROUP_MODE_LABELS, value) ? value : 'price';
  }

  function normalizePanelTab(value) {
    return value === 'logs' ? 'logs' : 'settings';
  }

  function normalizeAvailabilityMode(value) {
    return value === 'successes' || value === 'consecutive' ? value : 'percent';
  }

  function normalizeLatencySource(value) {
    return value === 'user' ? 'user' : 'probe';
  }

  function normalizeUserTtftSampleCount(value) {
    return Math.round(clamp(numberOr(value, DEFAULT_CONFIG.minUserTtftSamples), 1, USER_TTFT_SAMPLE_COUNT_MAX));
  }

  function normalizeModelPriceModel(value) {
    return Object.prototype.hasOwnProperty.call(MODEL_PRICE_MODEL_LABELS, value) ? value : 'sol';
  }

  function normalizeProviderSortPreference(value) {
    return Object.prototype.hasOwnProperty.call(PROVIDER_SORT_LABELS, value) ? value : 'rate';
  }

  function normalizeRecommendationPriceBasis(value) {
    return Object.prototype.hasOwnProperty.call(RECOMMENDATION_PRICE_BASIS_LABELS, value) ? value : 'nominal';
  }

  function getProviderSortButtonText(preference) {
    const value = PROVIDER_SORT_BUTTON_TEXTS[normalizeProviderSortPreference(preference)];
    return Array.isArray(value) ? value[0] : value;
  }

  function getProviderSortButtonTexts(preference) {
    const value = PROVIDER_SORT_BUTTON_TEXTS[normalizeProviderSortPreference(preference)];
    return Array.isArray(value) ? value : [value];
  }

  function getProviderSortDirection(preference) {
    return PROVIDER_SORT_DIRECTIONS[normalizeProviderSortPreference(preference)];
  }

  function getProviderSortButtonDirection(button) {
    const textDirection = String(button?.textContent || '').trim().match(/([↑↓])$/)?.[1];
    if (textDirection) return textDirection;
    const ariaSort = String(button?.getAttribute?.('aria-sort') || '').trim().toLocaleLowerCase();
    if (ariaSort === 'ascending') return '↑';
    if (ariaSort === 'descending') return '↓';
    return '';
  }

  function shouldActivateProviderSort(target, activeButton, preference) {
    if (!target) return false;
    if (activeButton !== target) return true;
    const currentDirection = getProviderSortButtonDirection(target);
    return Boolean(currentDirection && currentDirection !== getProviderSortDirection(preference));
  }

  function findActiveProviderSortButton(buttons) {
    const candidates = [...(buttons || [])];
    return candidates.find((button) => button?.classList?.contains?.('active') === true
      || String(button?.className || '').split(/\s+/).includes('active'))
      || candidates.find((button) => Boolean(getProviderSortButtonDirection(button)))
      || null;
  }

  function getProviderSortStateSignature(buttons) {
    const activeButton = findActiveProviderSortButton(buttons);
    if (!activeButton) return '';
    const label = String(activeButton.textContent || '')
      .trim()
      .replace(/\s*[↑↓]$/, '')
      .toLocaleLowerCase();
    return `${label}|${getProviderSortButtonDirection(activeButton)}`;
  }

  function findProviderSortButton(buttons, preference) {
    const candidates = [...(buttons || [])];
    const scopedCandidates = candidates.filter((button) => {
      const className = String(button?.className || '').split(/\s+/);
      const isSortHead = button?.classList?.contains?.('monitor-sort-head') === true || className.includes('monitor-sort-head');
      if (!isSortHead) return false;
      const closest = button?.closest?.('.monitor-sort-controls');
      return typeof button?.closest !== 'function' || Boolean(closest);
    });
    const searchPool = scopedCandidates.length > 0 ? scopedCandidates : candidates.filter((button) => {
      const className = String(button?.className || '').split(/\s+/);
      return !button?.classList?.contains?.('header-sort') && !className.includes('header-sort');
    });
    const targetTexts = getProviderSortButtonTexts(preference).map((text) => text.toLocaleLowerCase());
    return searchPool.find((button) => {
      const text = String(button?.textContent || '').trim().replace(/\s*[↑↓]$/, '').toLocaleLowerCase();
      return targetTexts.includes(text);
    }) || null;
  }

  function findProviderRefreshButton(buttons) {
    const candidates = [...(buttons || [])];
    const semanticButton = candidates.find((button) => {
      const title = String(button?.getAttribute?.('title') ?? button?.title ?? '').trim().toLocaleLowerCase();
      const className = String(button?.className || '').split(/\s+/);
      const isMonitorIconButton = button?.classList?.contains?.('monitor-icon-button') === true
        || className.includes('monitor-icon-button');
      return isMonitorIconButton && (title === '刷新监测数据' || title === 'refresh monitoring data');
    });
    if (semanticButton) return semanticButton;
    const textButtons = candidates.filter((button) => {
      const text = String(button?.textContent || '').trim().toLocaleLowerCase();
      return text === '刷新' || text === 'refresh';
    });
    return textButtons.length === 1 ? textButtons[0] : null;
  }

  function findProviderRefreshButtonInRoot(root) {
    const semanticButton = root?.querySelector?.(PROVIDER_REFRESH_BUTTON_SELECTOR);
    if (semanticButton) return semanticButton;
    return findProviderRefreshButton(root?.querySelectorAll?.('button'));
  }

  function isProviderRefreshButtonDisabled(button) {
    return button?.disabled === true
      || String(button?.getAttribute?.('aria-disabled') || '').trim().toLocaleLowerCase() === 'true';
  }

  function isProviderRefreshButtonBusy(button) {
    if (isProviderRefreshButtonDisabled(button)) return true;
    if (String(button?.getAttribute?.('aria-busy') || '').trim().toLocaleLowerCase() === 'true') return true;
    return /(?:^|[\s_-])(?:loading|is-loading|animate-spin|spinning)(?:$|[\s_-])/.test(String(button?.className || ''));
  }

  function getProviderRefreshDataSignature(root) {
    const generatedNode = root?.querySelector?.('.monitor-generated-at,[data-testid="monitor-generated-at"]');
    const generatedText = String(generatedNode?.textContent || '').replace(/\s+/g, ' ').trim();
    if (generatedText) return `generated:${generatedText}`;
    const entries = [...(root?.querySelectorAll?.('.decision-entry,[data-testid^="monitor-provider-"],table tbody tr') || [])];
    if (!entries.length) return '';
    return entries.slice(0, 100).map((entry, index) => {
      const identity = String(entry?.getAttribute?.('data-testid') || entry?.getAttribute?.('data-provider-id') || index);
      const text = String(entry?.textContent || '').replace(/\s+/g, ' ').trim();
      return `${identity}:${text}`;
    }).join('|');
  }

  function normalizeCacheHitRate(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    const percent = text.endsWith('%') ? Number(text.slice(0, -1).trim()) : Number(text);
    if (!Number.isFinite(percent) || percent < 0) return null;
    const normalized = text.endsWith('%') || percent > 1 ? percent / 100 : percent;
    return normalized >= 0 && normalized <= 1 ? normalized : null;
  }

  function formatCacheHitRate(value) {
    const normalized = normalizeCacheHitRate(value);
    return normalized === null ? '缓存命中率暂无数据' : `缓存命中率 ${(normalized * 100).toFixed(1)}%`;
  }

  function booleanOrNull(value) {
    if (value === true || value === false) return value;
    const normalized = String(value ?? '').trim().toLocaleLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return null;
  }

  function normalizeRuntimeCache1h(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const normalized = {
      usageRecords: nonNegativeNumberOrNull(value.usageRecords ?? value.usage_records),
      inputTokens: nonNegativeNumberOrNull(value.inputTokens ?? value.input_tokens),
      cacheReadTokens: nonNegativeNumberOrNull(value.cacheReadTokens ?? value.cache_read_tokens),
      cacheCreationTokens: nonNegativeNumberOrNull(value.cacheCreationTokens ?? value.cache_creation_tokens),
      inputCost: nonNegativeNumberOrNull(value.inputCost ?? value.input_cost),
      cacheReadCost: nonNegativeNumberOrNull(value.cacheReadCost ?? value.cache_read_cost),
      cacheCreationCost: nonNegativeNumberOrNull(value.cacheCreationCost ?? value.cache_creation_cost),
      cacheHitRate: normalizeCacheHitRate(value.cacheHitRate ?? value.cache_hit_rate),
      refreshedAt: String(value.refreshedAt ?? value.refreshed_at ?? '').trim() || null,
      ready: booleanOrNull(value.ready),
      stale: booleanOrNull(value.stale),
    };
    return Object.values(normalized).some((item) => item !== null) ? normalized : null;
  }

  function getEffectivePricing(rowOrPricing) {
    const nested = rowOrPricing?.effectivePricing;
    const source = nested && typeof nested === 'object' ? nested : (rowOrPricing || {});
    const runtimeCache1h = normalizeRuntimeCache1h(
      source.runtimeCache1h
      ?? source.runtime_cache_1h
      ?? rowOrPricing?.runtimeCache1h
      ?? rowOrPricing?.runtime_cache_1h,
    );
    const inputPricePerMillion = nonNegativeNumberOrNull(
      source.inputPricePerMillion
      ?? source.effectiveInputPricePerMillion1h
      ?? source.effective_input_price_per_million_1h,
    );
    const multiplier = nonNegativeNumberOrNull(source.multiplier ?? source.effectiveMultiplier ?? source.effective_multiplier);
    const readyFlag = booleanOrNull(source.ready ?? source.effectiveMultiplierReady ?? source.effective_multiplier_ready);
    const reason = String(source.reason ?? source.effectiveMultiplierReason ?? source.effective_multiplier_reason ?? '').trim() || null;
    const stale = runtimeCache1h?.stale === true;
    const hasData = inputPricePerMillion !== null || multiplier !== null || readyFlag !== null || Boolean(reason);
    return {
      inputPricePerMillion,
      multiplier,
      ready: readyFlag === true && !stale && inputPricePerMillion !== null && multiplier !== null,
      reason: stale ? 'runtime_metrics_stale' : reason,
      runtimeCache1h,
      hasData,
    };
  }

  function getEffectiveMultiplierReasonLabel(reason) {
    const normalized = String(reason || '').trim().toLocaleLowerCase();
    return EFFECTIVE_MULTIPLIER_REASON_LABELS[normalized] || (normalized ? '暂不可用' : '暂无数据');
  }

  function formatEffectivePricingSummary(rowOrPricing, compact = false, includeUnavailable = false) {
    const pricing = getEffectivePricing(rowOrPricing);
    if (!pricing.ready) {
      if (!includeUnavailable || !pricing.hasData) return '';
      return `暂不可用（${getEffectiveMultiplierReasonLabel(pricing.reason)}）`;
    }
    const price = formatModelPriceAmount(pricing.inputPricePerMillion);
    const multiplier = formatMultiplier(pricing.multiplier);
    return compact
      ? `真实 ${price}/1M · 预测 ${multiplier}`
      : `真实输入 ${price} / 1M · 预测倍率 ${multiplier}`;
  }

  function getRecommendationPriceMetric(row, basis = 'nominal') {
    const normalizedBasis = normalizeRecommendationPriceBasis(basis);
    const nominalValue = nonNegativeNumberOrNull(row?.priceMultiplier ?? row?.rate_multiplier ?? row?.rateMultiplier ?? row?.price);
    if (normalizedBasis === 'nominal') {
      return {
        basis: normalizedBasis,
        value: nominalValue,
        available: nominalValue !== null,
        reason: nominalValue === null ? 'missing' : '',
      };
    }

    const pricing = getEffectivePricing(row);
    if (pricing.runtimeCache1h?.stale === true || pricing.reason === 'runtime_metrics_stale') {
      return { basis: normalizedBasis, value: null, available: false, reason: 'stale' };
    }
    if (normalizedBasis === 'effectiveInput1h') {
      if (pricing.inputPricePerMillion === null) return { basis: normalizedBasis, value: null, available: false, reason: 'missing' };
      if (pricing.runtimeCache1h?.ready !== true) return { basis: normalizedBasis, value: null, available: false, reason: 'notReady' };
      return { basis: normalizedBasis, value: pricing.inputPricePerMillion, available: true, reason: '' };
    }
    if (pricing.multiplier === null) return { basis: normalizedBasis, value: null, available: false, reason: 'missing' };
    if (pricing.reason === 'openrouter_reference_stale') {
      return { basis: normalizedBasis, value: null, available: false, reason: 'stale' };
    }
    const readyFlag = booleanOrNull(
      row?.effectivePricing?.ready
      ?? row?.effectiveMultiplierReady
      ?? row?.effective_multiplier_ready,
    );
    if (readyFlag !== true) return { basis: normalizedBasis, value: null, available: false, reason: 'notReady' };
    return { basis: normalizedBasis, value: pricing.multiplier, available: true, reason: '' };
  }

  function formatRecommendationPriceCriterion(candidate) {
    const basis = normalizeRecommendationPriceBasis(candidate?.rankingPriceBasis);
    const value = nonNegativeNumberOrNull(candidate?.rankingPriceValue);
    const nominal = nonNegativeNumberOrNull(candidate?.price ?? candidate?.priceMultiplier);
    if (basis === 'effectiveInput1h' && value !== null) {
      return `1h 真实输入价 ${formatModelPriceAmount(value)} / 1M${nominal === null ? '' : ` · 标称 ${formatMultiplier(nominal)}`}`;
    }
    if (basis === 'effectiveMultiplier1h' && value !== null) {
      return `1h 预测倍率 ${formatMultiplier(value)}${nominal === null ? '' : ` · 标称 ${formatMultiplier(nominal)}`}`;
    }
    return nominal === null ? '标称倍率暂无数据' : `标称倍率 ${formatMultiplier(nominal)}`;
  }

  function formatRecommendationPriceUnavailableReasons(reasons) {
    return Object.entries(RECOMMENDATION_PRICE_UNAVAILABLE_REASON_LABELS)
      .map(([key, label]) => [label, Number(reasons?.[key]) || 0])
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `${label} ${count}`)
      .join('、');
  }

  function formatOutputThroughput(row, compact = false) {
    const value = nonNegativeNumberOrNull(row?.outputTokensPerSecond ?? row?.outputTps ?? row?.output_tps);
    if (value === null || value <= 0) return '';
    const formatted = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
    return `${compact ? '输出' : '输出速度'} ${formatted} tok/s`;
  }

  function normalizeModelPrices(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = {};
    for (const model of ['sol', 'terra', 'luna']) {
      const raw = value[model] ?? value[model.toUpperCase()] ?? value[model[0].toUpperCase() + model.slice(1)];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const price = {
        inputPerMillion: nonNegativeNumberOrNull(raw.inputPerMillion ?? raw.input_per_million),
        cacheInputPerMillion: nonNegativeNumberOrNull(raw.cacheInputPerMillion ?? raw.cache_input_per_million),
        outputPerMillion: nonNegativeNumberOrNull(raw.outputPerMillion ?? raw.output_per_million),
      };
      if (Object.values(price).some((item) => item !== null)) result[model] = price;
    }
    return Object.keys(result).length ? result : null;
  }

  function getModelPrices(rowOrPrices) {
    if (!rowOrPrices || typeof rowOrPrices !== 'object') return null;
    const hasNestedPrices = Object.prototype.hasOwnProperty.call(rowOrPrices, 'modelPrices')
      || Object.prototype.hasOwnProperty.call(rowOrPrices, 'model_prices');
    return normalizeModelPrices(hasNestedPrices
      ? (rowOrPrices.modelPrices ?? rowOrPrices.model_prices)
      : rowOrPrices);
  }

  function getSelectedModelPrice(rowOrPrices, model = DEFAULT_CONFIG.modelPriceModel) {
    const normalizedModel = normalizeModelPriceModel(model);
    if (normalizedModel === 'none') return null;
    return getModelPrices(rowOrPrices)?.[normalizedModel] || null;
  }

  function formatModelPriceAmount(value) {
    const amount = nonNegativeNumberOrNull(value);
    return amount === null ? '' : MODEL_PRICE_CURRENCY_FORMATTER.format(amount);
  }

  function formatModelPriceSummary(rowOrPrices, model = DEFAULT_CONFIG.modelPriceModel, compact = false) {
    const normalizedModel = normalizeModelPriceModel(model);
    if (normalizedModel === 'none') return '';
    const price = getSelectedModelPrice(rowOrPrices, normalizedModel);
    if (!price) return '';
    const parts = [
      ['输入', '入', price.inputPerMillion],
      ['缓存输入', '缓', price.cacheInputPerMillion],
      ['输出', '出', price.outputPerMillion],
    ].filter(([, , amount]) => nonNegativeNumberOrNull(amount) !== null);
    if (!parts.length) return '';
    const label = MODEL_PRICE_MODEL_LABELS[normalizedModel];
    if (compact) return `${label} ${parts.map(([, shortLabel, amount]) => `${shortLabel} ${formatModelPriceAmount(amount)}`).join(' / ')}`;
    return `${label} 每 1M：${parts.map(([longLabel, , amount]) => `${longLabel} ${formatModelPriceAmount(amount)}`).join(' · ')}`;
  }

  function normalizeModelHealth(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = {};
    for (const model of ['sol', 'terra', 'luna']) {
      const raw = value[model] ?? value[model.toUpperCase()] ?? value[model[0].toUpperCase() + model.slice(1)];
      if (raw == null) continue;
      const status = String(raw).trim().toLocaleLowerCase();
      result[model] = ['healthy', 'ok', 'passed', 'available', 'success'].includes(status)
        ? 'healthy'
        : ['failed', 'error', 'unavailable', 'down'].includes(status)
          ? 'failed'
          : ['insufficient', 'insufficient_evidence', 'insufficient-evidence'].includes(status)
            ? 'insufficient'
            : 'unknown';
    }
    return Object.keys(result).length ? result : null;
  }

  function summarizeModelHealth(value) {
    const health = normalizeModelHealth(value) || {};
    const healthy = Object.values(health).filter((status) => status === 'healthy').length;
    const failed = Object.values(health).filter((status) => status === 'failed').length;
    const insufficient = Object.values(health).filter((status) => status === 'insufficient').length;
    const unknown = Object.values(health).filter((status) => status === 'unknown').length;
    const total = Object.keys(health).length;
    return { health, healthy, failed, insufficient, unknown, total };
  }

  function formatModelHealthSummary(value) {
    const summary = summarizeModelHealth(value);
    if (!summary.total) return '';
    const parts = [];
    if (summary.healthy) parts.push(`健康 ${summary.healthy}/${summary.total}`);
    if (summary.insufficient) parts.push(`证据不足 ${summary.insufficient}/${summary.total}`);
    if (summary.failed) parts.push(`失败 ${summary.failed}/${summary.total}`);
    if (summary.unknown) parts.push(`未知 ${summary.unknown}/${summary.total}`);
    return `模型健康：${parts.join('、')}`;
  }

  function normalizeModelDetectionReasonCodes(...values) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
      for (const rawCode of Array.isArray(value) ? value : []) {
        const code = String(rawCode ?? '').trim();
        const identity = code.toLocaleUpperCase();
        if (!code || seen.has(identity)) continue;
        seen.add(identity);
        result.push(code);
      }
    }
    return result;
  }

  function normalizeModelDetection(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const rawStatus = String(value.status ?? '').trim().toLocaleLowerCase();
    const status = ['passed', 'pass', 'ok', 'success'].includes(rawStatus)
      ? 'passed'
      : ['insufficient_evidence', 'insufficient-evidence', 'insufficient'].includes(rawStatus)
        ? 'insufficient_evidence'
        : ['failed', 'detection_failed', 'detection-failed', 'error', 'rejected'].includes(rawStatus)
          ? 'failed'
          : ['suspected', 'suspicious'].includes(rawStatus)
            ? 'suspected'
            : ['not_tested', 'not-tested', 'untested'].includes(rawStatus)
              ? 'not_tested'
              : ['not_applicable', 'not-applicable'].includes(rawStatus)
                ? 'not_applicable'
                : rawStatus === 'skipped'
                  ? (value.applicable === false ? 'not_applicable' : 'not_tested')
                  : rawStatus || null;
    const reasonCodes = normalizeModelDetectionReasonCodes(value.reason_codes, value.reasonCodes);
    return { ...value, status, reasonCodes, reason_codes: reasonCodes };
  }

  function getModelDetection(row) {
    return normalizeModelDetection(row?.modelDetection ?? row?.model_detection);
  }

  function resolveModelDetection(rowOrDetection) {
    const hasNestedDetection = Boolean(rowOrDetection && typeof rowOrDetection === 'object'
      && (Object.prototype.hasOwnProperty.call(rowOrDetection, 'modelDetection')
        || Object.prototype.hasOwnProperty.call(rowOrDetection, 'model_detection')));
    const nestedDetection = rowOrDetection?.modelDetection ?? rowOrDetection?.model_detection;
    const looksLikeDetection = !hasNestedDetection && rowOrDetection && typeof rowOrDetection === 'object'
      && ('status' in rowOrDetection
        || 'applicable' in rowOrDetection
        || 'reason_codes' in rowOrDetection
        || 'reasonCodes' in rowOrDetection);
    return hasNestedDetection
      ? normalizeModelDetection(nestedDetection)
      : (looksLikeDetection ? normalizeModelDetection(rowOrDetection) : getModelDetection(rowOrDetection));
  }

  function getModelDetectionLabel(rowOrDetection) {
    const detection = resolveModelDetection(rowOrDetection);
    if (!detection) return '';
    if (detection.applicable === false) return '不适用';
    if (detection.status === 'passed') return '检测通过';
    if (detection.status === 'insufficient_evidence') return '证据不足';
    if (detection.status === 'failed') return '检测失败';
    if (detection.status === 'suspected') return '疑似';
    if (detection.status === 'not_tested') return '未检测';
    if (detection.status === 'not_applicable') return '不适用';
    return '检测未知';
  }

  function getModelDetectionReasonLabel(code) {
    const normalized = String(code ?? '').trim();
    if (!normalized) return '';
    const known = MODEL_DETECTION_REASON_LABELS[normalized.toLocaleUpperCase()];
    if (known) return known;
    const readable = normalized
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase();
    return readable ? `${readable.charAt(0).toLocaleUpperCase()}${readable.slice(1)}` : normalized;
  }

  function getModelDetectionReasonLabels(rowOrDetection, includeInformational = true) {
    const detection = resolveModelDetection(rowOrDetection);
    if (!detection || detection.applicable === false || detection.status === 'passed' || detection.status === 'not_applicable') return [];
    return detection.reasonCodes
      .filter((code) => includeInformational
        || !MODEL_DETECTION_INFORMATIONAL_REASON_CODES.includes(String(code).toLocaleUpperCase()))
      .map(getModelDetectionReasonLabel)
      .filter(Boolean);
  }

  function formatModelDetectionReasonSummary(rowOrDetection, maxItems = 2) {
    const limit = Math.max(0, Math.floor(Number(maxItems) || 0));
    return getModelDetectionReasonLabels(rowOrDetection, false).slice(0, limit).join('；');
  }

  function formatModelDetectionSummary(rowOrDetection, maxReasons = 2) {
    const label = getModelDetectionLabel(rowOrDetection);
    if (!label) return '';
    const reasons = formatModelDetectionReasonSummary(rowOrDetection, maxReasons);
    return reasons ? `${label}（${reasons}）` : label;
  }

  function formatModelDetectionTitle(rowOrDetection) {
    const label = getModelDetectionLabel(rowOrDetection);
    const reasons = getModelDetectionReasonLabels(rowOrDetection, true);
    return label && reasons.length ? `${label}：${reasons.join('；')}` : '';
  }

  function isModelDetectionWarning(detection) {
    if (!detection || detection.applicable === false) return false;
    if (!detection.status) return detection.applicable === true;
    return !['passed', 'not_applicable'].includes(detection.status);
  }

  function hasModelDetectionWarning(row) {
    return isModelDetectionWarning(getModelDetection(row));
  }

  function getLatencyMetric(row, source = 'probe', minUserTtftSamples = DEFAULT_CONFIG.minUserTtftSamples) {
    const latencySource = normalizeLatencySource(source);
    const probe = nonNegativeNumberOrNull(
      row?.probeFirstTokenLatencyMs
      ?? row?.probe_ttft_ms
      ?? row?.firstTokenLatencyMs
      ?? row?.avg_ttft_ms,
    );
    const userValue = nonNegativeNumberOrNull(row?.userAvgTtftMs ?? row?.user_avg_ttft_ms);
    const userSampleCount = getUserLatencySampleCount(row);
    const minimumSamples = normalizeUserTtftSampleCount(minUserTtftSamples);
    const userHasData = row?.userHasData === true
      || row?.user_has_data === true
      || userSampleCount !== null;
    const user = userHasData && userValue !== null && userValue > 0 ? userValue : null;
    if (latencySource === 'user' && user !== null && userSampleCount !== null && userSampleCount >= minimumSamples) {
      return { value: user, source: 'user', fallback: false };
    }
    const fallback = latencySource === 'user' && probe !== null;
    if (latencySource === 'user' && user !== null) {
      return {
        value: probe,
        source: 'probe',
        fallback,
        userSampleInsufficient: true,
        userSampleCount: userSampleCount ?? 0,
        minUserTtftSamples: minimumSamples,
      };
    }
    return { value: probe, source: 'probe', fallback };
  }

  function getUserLatencySampleCount(row) {
    const sampleCount = Number(row?.userSampleCount ?? row?.user_sample_count);
    return Number.isFinite(sampleCount) && sampleCount > 0 ? Math.floor(sampleCount) : null;
  }

  function getUserTtftFallbackText(metric) {
    if (metric?.userSampleInsufficient === true) {
      const sampleCount = Math.max(0, Math.floor(Number(metric.userSampleCount) || 0));
      const minimumSamples = normalizeUserTtftSampleCount(metric.minUserTtftSamples);
      return `样本不足 ${sampleCount}/${minimumSamples}，回退探测`;
    }
    return metric?.fallback ? '回退探测' : '';
  }

  function getLatencyMetricLabel(source = 'probe', metric = null) {
    if (normalizeLatencySource(source) !== 'user') return '首 Token';
    const fallbackText = getUserTtftFallbackText(metric);
    return fallbackText ? `运行时 P50 TTFT（${fallbackText}）` : '运行时 P50 TTFT';
  }

  function formatLatencyMetric(row, source = 'probe', minUserTtftSamples = DEFAULT_CONFIG.minUserTtftSamples) {
    const metric = getLatencyMetric(row, source, minUserTtftSamples);
    const valueText = metric.value === null ? '暂无数据' : formatLatency(metric.value);
    if (normalizeLatencySource(source) === 'user') {
      const sampleCount = metric.source === 'user' ? getUserLatencySampleCount(row) : null;
      const sampleText = sampleCount === null ? '' : `（${sampleCount} 条）`;
      const fallbackText = getUserTtftFallbackText(metric);
      return fallbackText
        ? `运行时 P50 TTFT ${valueText}（${fallbackText}）`
        : `运行时 P50 TTFT ${valueText}${sampleText}`;
    }
    return `首 Token ${valueText}`;
  }

  function normalizeMonitorHistory(value) {
    const byTimestamp = new Map();
    for (const item of Array.isArray(value) ? value : []) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const probedAt = item.probedAt ?? item.probed_at ?? item.at ?? item.timestamp;
      const timestamp = typeof probedAt === 'number' ? probedAt : Date.parse(probedAt);
      if (!Number.isFinite(timestamp)) continue;
      const normalized = {
        ...item,
        probedAt,
        timestamp,
        status: String(item.status ?? '').trim().toLocaleLowerCase(),
        sampleCount: nonNegativeNumberOrNull(item.sampleCount ?? item.sample_count),
      };
      const existing = byTimestamp.get(timestamp);
      if (!existing) {
        byTimestamp.set(timestamp, normalized);
        continue;
      }
      const existingAvailability = monitorHistoryStatusToAvailability(existing.status);
      const nextAvailability = monitorHistoryStatusToAvailability(normalized.status);
      const existingCount = numberOr(existing.sampleCount, 0);
      const nextCount = numberOr(normalized.sampleCount, 0);
      if ((nextAvailability === 0 && existingAvailability !== 0)
        || (existingAvailability === null && nextAvailability === 1)
        || (existingAvailability === nextAvailability && nextCount > existingCount)) {
        byTimestamp.set(timestamp, normalized);
      }
    }
    return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
  }

  function normalizeMonitorRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    const groupId = Number(source.group_id ?? source.groupId ?? source.id);
    const visibleInHall = source.visible_in_hall ?? source.visibleInHall;
    const warningReasons = Array.isArray(source.warningReasons)
      ? source.warningReasons.slice()
      : (Array.isArray(source.warning_reasons) ? source.warning_reasons.slice() : []);
    if ((source.response_valid ?? source.responseValid) === false && !warningReasons.includes('response_invalid')) warningReasons.push('response_invalid');
    const modelDetection = normalizeModelDetection(source.modelDetection ?? source.model_detection);
    if (isModelDetectionWarning(modelDetection)) {
      const reason = `model_detection_${modelDetection.status || 'unknown'}`;
      if (!warningReasons.includes(reason)) warningReasons.push(reason);
    }
    const modelHealth = normalizeModelHealth(source.modelHealth ?? source.model_health);
    const modelPrices = normalizeModelPrices(source.modelPrices ?? source.model_prices);
    const runtimeCache1h = normalizeRuntimeCache1h(source.runtimeCache1h ?? source.runtime_cache_1h);
    const directCacheHitRate = normalizeCacheHitRate(source.cacheHitRate ?? source.cache_hit_rate);
    const cacheHitRate = directCacheHitRate !== null
      ? directCacheHitRate
      : (runtimeCache1h?.ready === true && runtimeCache1h.stale !== true ? runtimeCache1h.cacheHitRate : null);
    const effectiveMultiplier = nonNegativeNumberOrNull(source.effectiveMultiplier ?? source.effective_multiplier);
    const effectiveInputPricePerMillion1h = nonNegativeNumberOrNull(
      source.effectiveInputPricePerMillion1h ?? source.effective_input_price_per_million_1h,
    );
    const effectiveMultiplierReady = booleanOrNull(source.effectiveMultiplierReady ?? source.effective_multiplier_ready);
    const effectiveMultiplierReason = String(source.effectiveMultiplierReason ?? source.effective_multiplier_reason ?? '').trim() || null;
    return {
      ...source,
      id: source.id ?? (Number.isInteger(groupId) ? groupId : undefined),
      group_id: groupId,
      planType: String(source.planType ?? source.code ?? source.name ?? `Group ${source.group_id ?? ''}`),
      priceMultiplier: source.priceMultiplier ?? source.rate_multiplier ?? source.rateMultiplier,
      available: source.available,
      enabled: source.enabled ?? source.status !== 'disabled',
      visibleInHall,
      successRates: source.successRates ?? source.success_rates ?? {},
      warningReasons,
      modelDetection,
      modelHealth,
      modelPrices,
      cacheHitRate,
      runtimeCache1h,
      effectiveMultiplier,
      effectiveInputPricePerMillion1h,
      effectiveMultiplierReady,
      effectiveMultiplierReason,
      checkedAt: source.checkedAt ?? source.last_probed_at ?? source.lastProbedAt,
      probeFirstTokenLatencyMs: source.probeFirstTokenLatencyMs
        ?? source.probe_ttft_ms
        ?? source.firstTokenLatencyMs
        ?? source.avg_ttft_ms,
      probeE2eLatencyMs: source.probeE2eLatencyMs ?? source.probe_e2e_ttft_ms ?? source.avg_total_ms,
      userAvgTtftMs: source.userAvgTtftMs ?? source.user_avg_ttft_ms,
      userSampleCount: source.userSampleCount ?? source.user_sample_count,
      userHasData: source.userHasData ?? source.user_has_data,
      outputTokensPerSecond: nonNegativeNumberOrNull(source.outputTokensPerSecond ?? source.outputTps ?? source.output_tps),
      supportWs: booleanOrNull(source.supportWs ?? source.support_ws),
      subscriptionType: String(source.subscriptionType ?? source.subscription_type ?? '').trim() || null,
      history: normalizeMonitorHistory(source.history ?? source.monitorHistory ?? source.monitor_history),
    };
  }

  function normalizeMonitorSummaryPayload(payload) {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const sourceRows = Array.isArray(data?.apis) ? data.apis : (Array.isArray(data?.items) ? data.items : []);
    return {
      ...data,
      generatedAt: data?.generatedAt ?? data?.generated_at ?? null,
      apis: sourceRows.map(normalizeMonitorRow),
    };
  }

  function normalizeMonitorSeriesPayload(payload) {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const directSeries = data?.seriesByApiId ?? data?.series_by_api_id;
    const directUserTtft = data?.userTtftByGroupId
      ?? data?.userTTFTByGroupId
      ?? data?.userTtftByApiId
      ?? data?.userTTFTByApiId
      ?? data?.user_ttft_by_group_id
      ?? data?.user_ttft_by_api_id;
    const seriesByApiId = {};
    const userTtftByGroupId = {};
    if (directSeries && typeof directSeries === 'object' && !Array.isArray(directSeries)) {
      for (const [groupId, samples] of Object.entries(directSeries)) {
        if (Array.isArray(samples)) seriesByApiId[String(groupId)] = samples;
      }
    }
    if (directUserTtft && typeof directUserTtft === 'object' && !Array.isArray(directUserTtft)) {
      for (const [groupId, samples] of Object.entries(directUserTtft)) {
        if (Array.isArray(samples)) userTtftByGroupId[String(groupId)] = samples;
      }
    }
    for (const item of Array.isArray(data?.items) ? data.items : []) {
      const groupId = String(item?.group_id ?? item?.groupId ?? item?.id ?? '');
      if (!groupId) continue;
      const probe = item?.probe ?? item?.probeSeries ?? item?.probe_series;
      const userTtft = item?.userTtft ?? item?.userTTFT ?? item?.user_ttft;
      if ((!Array.isArray(seriesByApiId[groupId]) || !seriesByApiId[groupId].length) && Array.isArray(probe)) {
        seriesByApiId[groupId] = probe;
      }
      if ((!Array.isArray(userTtftByGroupId[groupId]) || !userTtftByGroupId[groupId].length) && Array.isArray(userTtft)) {
        userTtftByGroupId[groupId] = userTtft;
      }
    }
    return {
      ...data,
      generatedAt: data?.generatedAt ?? data?.generated_at ?? null,
      range: data?.range ?? null,
      seriesByApiId,
      userTtftByGroupId,
    };
  }

  function monitorHistoryStatusToAvailability(status) {
    const normalized = String(status || '').trim().toLocaleLowerCase();
    if (['operational', 'success', 'healthy', 'up', 'available', 'passed', 'ok'].includes(normalized)) return 1;
    if (['degraded', 'failed', 'error', 'down', 'unavailable'].includes(normalized)) return 0;
    return null;
  }

  function buildMonitorSeriesFromSummary(summary) {
    const seriesByApiId = {};
    for (const row of Array.isArray(summary?.apis) ? summary.apis : []) {
      const groupId = String(row?.id ?? row?.group_id ?? '');
      if (!groupId) continue;
      const samples = [];
      for (const item of Array.isArray(row?.history) ? row.history : []) {
        const timestamp = Number(item?.timestamp);
        if (!Number.isFinite(timestamp)) continue;
        const availability = monitorHistoryStatusToAvailability(item.status);
        if (availability === null) continue;
        const rawSampleCount = nonNegativeNumberOrNull(item.sampleCount);
        if (rawSampleCount === 0) continue;
        const sampleCount = Math.floor(clamp(rawSampleCount ?? 1, 1, MONITOR_HISTORY_SAMPLE_COUNT_CAP));
        samples.push([timestamp, availability, sampleCount]);
      }
      if (samples.length) seriesByApiId[groupId] = samples;
    }
    return {
      generatedAt: summary?.generatedAt ?? null,
      range: 'summary-history',
      seriesByApiId,
      userTtftByGroupId: {},
    };
  }

  function hasMonitorSeriesData(series) {
    return Object.values(series?.seriesByApiId || {}).some((samples) => Array.isArray(samples) && samples.length > 0);
  }

  function latestMonitorGeneratedAt(left, right) {
    const values = [left, right].map((value) => ({ value, parsed: typeof value === 'number' ? value : Date.parse(value) }));
    const valid = values.filter((item) => Number.isFinite(item.parsed)).sort((a, b) => b.parsed - a.parsed);
    return valid[0]?.value ?? left ?? right ?? null;
  }

  function mergeMonitorSampleLists(primarySamples, fallbackSamples) {
    const byTimestamp = new Map();
    const addSamples = (samples, overwrite) => {
      for (const sample of Array.isArray(samples) ? samples : []) {
        const timestamp = Number(sample?.[0]);
        if (!Number.isFinite(timestamp)) continue;
        if (overwrite || !byTimestamp.has(timestamp)) byTimestamp.set(timestamp, sample);
      }
    };
    addSamples(fallbackSamples, false);
    addSamples(primarySamples, true);
    return [...byTimestamp.values()].sort((left, right) => Number(left[0]) - Number(right[0]));
  }

  function mergeMonitorSeries(primary, fallback) {
    const normalizedPrimary = normalizeMonitorSeriesPayload(primary || {});
    const normalizedFallback = normalizeMonitorSeriesPayload(fallback || {});
    const seriesByApiId = {};
    const userTtftByGroupId = { ...normalizedPrimary.userTtftByGroupId };
    const groupIds = new Set([
      ...Object.keys(normalizedFallback.seriesByApiId),
      ...Object.keys(normalizedPrimary.seriesByApiId),
    ]);
    for (const groupId of groupIds) {
      seriesByApiId[groupId] = mergeMonitorSampleLists(
        normalizedPrimary.seriesByApiId[groupId],
        normalizedFallback.seriesByApiId[groupId],
      );
    }
    for (const [groupId, samples] of Object.entries(normalizedFallback.userTtftByGroupId)) {
      if (!Array.isArray(userTtftByGroupId[groupId]) || !userTtftByGroupId[groupId].length) userTtftByGroupId[groupId] = samples;
    }
    return {
      ...normalizedFallback,
      ...normalizedPrimary,
      generatedAt: latestMonitorGeneratedAt(normalizedPrimary.generatedAt, normalizedFallback.generatedAt),
      range: normalizedPrimary.range || normalizedFallback.range || null,
      seriesByApiId,
      userTtftByGroupId,
    };
  }

  function getBalanceAmount(payload) {
    const value = Number(payload?.data?.balance ?? payload?.balance);
    return Number.isFinite(value) ? value : null;
  }

  function formatBalance(value) {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? amount.toFixed(6).replace(/\.?0+$/, '')
      : '暂无数据';
  }

  function getExcludedGroupInfo(rows, keywordInput) {
    const keywords = normalizeExcludedGroupKeywords(keywordInput).split('|').filter(Boolean);
    const matches = [];
    const seen = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = String(row?.planType || row?.name || '').trim();
      const normalizedName = name.toLocaleLowerCase();
      if (!name || !keywords.some((keyword) => normalizedName.includes(keyword))) continue;
      const identity = `${row?.group_id ?? ''}:${normalizedName}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      matches.push({ row, name });
    }
    return { keywords, matches };
  }

  function getCandidateAnalysisSignature(config = DEFAULT_CONFIG) {
    const normalizedConfig = normalizeConfig(config);
    const availabilityThreshold = normalizedConfig.availabilityMode === 'successes'
      ? normalizedConfig.minSuccessPoints10m
      : normalizedConfig.availabilityMode === 'consecutive'
        ? normalizedConfig.minConsecutiveSuccesses10m
        : normalizedConfig.minSuccess10m;
    return JSON.stringify({
      recommendationPriceBasis: normalizedConfig.mode === 'price' ? normalizedConfig.recommendationPriceBasis : 'nominal',
      availabilityMode: normalizedConfig.availabilityMode,
      availabilityThreshold,
      requireNoWarnings: normalizedConfig.requireNoWarnings,
      excludedGroupKeywords: normalizedConfig.excludedGroupKeywords,
      latencySource: normalizedConfig.latencySource,
      minUserTtftSamples: normalizedConfig.latencySource === 'user' ? normalizedConfig.minUserTtftSamples : null,
    });
  }

  function analyzeCandidates(rows, config = DEFAULT_CONFIG) {
    const normalizedConfig = normalizeConfig(config);
    const excludedKeywords = normalizedConfig.excludedGroupKeywords.split('|').filter(Boolean);
    const sourceRows = Array.isArray(rows) ? rows : [];
    const signature = getCandidateAnalysisSignature(normalizedConfig);
    const rankingPriceBasis = normalizedConfig.mode === 'price' ? normalizedConfig.recommendationPriceBasis : 'nominal';
    const counts = {
      total: sourceRows.length,
      invalid: 0,
      unavailable: 0,
      lowSuccess: 0,
      warnings: 0,
      modelDetectionWarnings: 0,
      keywords: 0,
      priceMetricUnavailable: 0,
      priceMetricUnavailableReasons: { notReady: 0, stale: 0, missing: 0 },
      userLatencySampleFallbacks: 0,
      eligible: 0,
    };
    const candidates = [];
    for (const row of sourceRows) {
      const groupId = Number(row?.group_id);
      const price = nonNegativeNumberOrNull(row?.priceMultiplier);
      if (!row || !Number.isInteger(groupId) || groupId <= 0 || price === null) {
        counts.invalid += 1;
        continue;
      }
      if (row.enabled === false || row.visibleInHall === false || row.available !== true) {
        counts.unavailable += 1;
        continue;
      }
      const success10m = nonNegativeNumberOrNull(row.successRates?.['10m']);
      const recentSuccessCount = nonNegativeNumberOrNull(row.recentSuccessCount);
      const recentConsecutiveSuccessCount = nonNegativeNumberOrNull(row.recentConsecutiveSuccessCount);
      const availabilityPasses = normalizedConfig.availabilityMode === 'successes'
        ? Number.isFinite(recentSuccessCount) && recentSuccessCount >= normalizedConfig.minSuccessPoints10m
        : normalizedConfig.availabilityMode === 'consecutive'
          ? Number.isFinite(recentConsecutiveSuccessCount) && recentConsecutiveSuccessCount >= normalizedConfig.minConsecutiveSuccesses10m
          : Number.isFinite(success10m) && success10m >= normalizedConfig.minSuccess10m;
      if (!availabilityPasses) {
        counts.lowSuccess += 1;
        continue;
      }
      if (normalizedConfig.requireNoWarnings
        && ((Array.isArray(row.warningReasons) && row.warningReasons.length > 0) || hasModelDetectionWarning(row))) {
        counts.warnings += 1;
        if (hasModelDetectionWarning(row)) counts.modelDetectionWarnings += 1;
        continue;
      }
      const name = String(row.planType || row.name || `Group ${row.group_id}`);
      if (excludedKeywords.some((keyword) => name.toLocaleLowerCase().includes(keyword))) {
        counts.keywords += 1;
        continue;
      }
      const rankingPrice = getRecommendationPriceMetric(row, rankingPriceBasis);
      if (!rankingPrice.available) {
        counts.priceMetricUnavailable += 1;
        counts.priceMetricUnavailableReasons[rankingPrice.reason] += 1;
        continue;
      }
      const latencyMetric = getLatencyMetric(row, normalizedConfig.latencySource, normalizedConfig.minUserTtftSamples);
      if (latencyMetric.userSampleInsufficient) counts.userLatencySampleFallbacks += 1;
      candidates.push({
        ...row,
        groupId,
        price,
        rankingPriceValue: rankingPrice.value,
        rankingPriceBasis: rankingPrice.basis,
        success10m,
        latency: latencyMetric.value ?? Number.POSITIVE_INFINITY,
        latencyMetricSource: latencyMetric.source,
        latencyFallback: latencyMetric.fallback,
        name,
      });
      counts.eligible += 1;
    }
    return { candidates, counts, signature, sourceRows };
  }

  function getEligibleCandidates(rows, normalizedConfig) {
    return analyzeCandidates(rows, normalizedConfig).candidates;
  }

  function comparePrice(left, right) {
    return left.rankingPriceValue - right.rankingPriceValue
      || right.success10m - left.success10m
      || left.latency - right.latency
      || left.price - right.price
      || left.name.localeCompare(right.name)
      || left.groupId - right.groupId;
  }

  function compareSpeed(left, right) {
    return left.latency - right.latency
      || left.price - right.price
      || right.success10m - left.success10m
      || left.name.localeCompare(right.name);
  }

  function rankCandidates(rows, config = DEFAULT_CONFIG, analysis = null) {
    const normalizedConfig = normalizeConfig(config);
    const sourceRows = Array.isArray(rows) ? rows : [];
    const signature = getCandidateAnalysisSignature(normalizedConfig);
    const reusableAnalysis = analysis?.sourceRows === sourceRows
      && analysis?.signature === signature
      && Array.isArray(analysis?.candidates);
    const currentAnalysis = reusableAnalysis ? analysis : analyzeCandidates(sourceRows, normalizedConfig);
    const candidates = currentAnalysis.candidates.slice();
    if (normalizedConfig.mode === 'speed') return candidates.sort(compareSpeed);
    if (normalizedConfig.mode === 'balance') return candidates.filter((candidate) => candidate.price <= normalizedConfig.balanceMaxPrice).sort(compareSpeed);
    return candidates.sort(comparePrice);
  }

  function reanalyzeRecommendationForSwitch(rows, config = DEFAULT_CONFIG, stability = createStabilityState(), targetGroupId = null) {
    const analysis = analyzeCandidates(rows, config);
    const ranked = rankCandidates(rows, config, analysis);
    const winner = ranked[0] || null;
    const numericTargetGroupId = Number(targetGroupId);
    const numericStableGroupId = Number(stability?.groupId);
    const validTargetGroupId = Number.isInteger(numericTargetGroupId) && numericTargetGroupId > 0
      ? numericTargetGroupId
      : null;
    const validStableGroupId = Number.isInteger(numericStableGroupId) && numericStableGroupId > 0
      ? numericStableGroupId
      : null;
    const target = validTargetGroupId === null
      ? null
      : ranked.find((candidate) => candidate.groupId === validTargetGroupId) || null;
    let reason = '';
    if (validTargetGroupId === null) reason = '暂无可验证的推荐分组，请重新检测';
    else if (!target) reason = '推荐目标已不再符合当前筛选条件，请重新检测';
    else if (!winner || winner.groupId !== validTargetGroupId) reason = '推荐第一名已变化，请重新检测';
    else if (validStableGroupId !== validTargetGroupId) reason = '稳定推荐与切换目标不一致，请重新检测';
    return { analysis, ranked, winner, target, reason };
  }

  function formatRelativeAge(ageMs) {
    if (!Number.isFinite(ageMs)) return '时间未知';
    const seconds = Math.max(0, Math.floor(ageMs / 1000));
    if (seconds < 5) return '刚刚';
    if (seconds < 60) return `${seconds} 秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    return `${hours} 小时前`;
  }

  function getMonitorFreshness(generatedAt, now = Date.now(), maxAgeSeconds = DEFAULT_CONFIG.maxMonitorAgeSeconds) {
    const parsed = typeof generatedAt === 'number' ? generatedAt : Date.parse(generatedAt);
    if (!Number.isFinite(parsed)) return { generatedAt: null, ageMs: null, stale: true, label: '时间未知' };
    const ageMs = Math.max(0, Number(now) - parsed);
    return {
      generatedAt: parsed,
      ageMs,
      stale: ageMs > Math.max(0, Number(maxAgeSeconds) || 0) * 1000,
      label: formatRelativeAge(ageMs),
    };
  }

  function getLatestMonitorSampleAt(seriesPayload, maxTimestamp = Number.POSITIVE_INFINITY) {
    let latest = null;
    const upperBound = Number(maxTimestamp);
    for (const samples of Object.values(seriesPayload?.seriesByApiId || {})) {
      for (const sample of Array.isArray(samples) ? samples : []) {
        const timestamp = Number(sample?.[0]);
        if (Number.isFinite(timestamp)
          && timestamp <= upperBound
          && (latest === null || timestamp > latest)) latest = timestamp;
      }
    }
    for (const samples of Object.values(seriesPayload?.userTtftByGroupId || {})) {
      for (const sample of Array.isArray(samples) ? samples : []) {
        const value = sample?.at ?? sample?.probedAt ?? sample?.probed_at ?? sample?.timestamp;
        const timestamp = typeof value === 'number' ? value : Date.parse(value);
        if (Number.isFinite(timestamp)
          && timestamp <= upperBound
          && (latest === null || timestamp > latest)) latest = timestamp;
      }
    }
    return latest;
  }

  function getMonitorSeriesWindowAnchor(seriesPayload, wallNow = Date.now()) {
    const generatedAt = Date.parse(seriesPayload?.generatedAt);
    if (Number.isFinite(generatedAt)) {
      const latestSampleAt = getLatestMonitorSampleAt(seriesPayload, generatedAt + MONITOR_SAMPLE_CLOCK_SKEW_MS);
      return latestSampleAt === null ? generatedAt : Math.max(generatedAt, latestSampleAt);
    }
    const current = Number(wallNow);
    const latestSampleAt = getLatestMonitorSampleAt(
      seriesPayload,
      Number.isFinite(current) ? current + MONITOR_SAMPLE_CLOCK_SKEW_MS : Number.POSITIVE_INFINITY,
    );
    if (latestSampleAt !== null) return latestSampleAt;
    return null;
  }

  function formatRemainingTime(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    if (totalSeconds < 60) return `${totalSeconds} 秒`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
  }

  function getCooldownInfo(lastSwitchAt, cooldownMinutes, now = Date.now()) {
    const cooldownMs = Math.max(0, Number(cooldownMinutes) || 0) * 60 * 1000;
    const lastAt = Number(lastSwitchAt);
    const remainingMs = Number.isFinite(lastAt) ? Math.max(0, lastAt + cooldownMs - Number(now)) : 0;
    return { remainingMs, active: remainingMs > 0, label: remainingMs > 0 ? `剩余 ${formatRemainingTime(remainingMs)}` : '冷却已结束' };
  }

  function attachRecentAvailability(rows, seriesPayload, windowMs = 10 * 60 * 1000) {
    const anchor = getMonitorSeriesWindowAnchor(seriesPayload);
    const now = anchor === null ? Date.now() : anchor;
    const cutoff = now - Math.max(1, Number(windowMs) || 1);
    const seriesByApiId = seriesPayload?.seriesByApiId || {};
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const groupId = String(row?.id ?? row?.group_id ?? '');
      const samples = Array.isArray(seriesByApiId[groupId]) ? seriesByApiId[groupId] : [];
      const recent = [];
      let successes = 0;
      let totalWeight = 0;
      for (const sample of samples) {
        const at = Number(sample?.[0]);
        const status = sample?.[1];
        if (!Number.isFinite(at) || at < cutoff || at > now || (status !== 0 && status !== 1)) continue;
        // Summary fallbacks use exactly three fields; live 10-field series keep their original meaning.
        const rawWeight = Array.isArray(sample) && sample.length === 3 ? Number(sample[2]) : 1;
        if (!Number.isFinite(rawWeight) || rawWeight <= 0) continue;
        const weight = Math.floor(clamp(rawWeight, 1, MONITOR_HISTORY_SAMPLE_COUNT_CAP));
        recent.push({ at, status, weight });
        totalWeight += weight;
        if (status === 1) successes += weight;
      }
      recent.sort((left, right) => left.at - right.at);
      let trailingSuccesses = 0;
      for (let index = recent.length - 1; index >= 0 && recent[index].status === 1; index -= 1) {
        trailingSuccesses += recent[index].weight;
      }
      return {
        ...row,
        successRates: {
          ...(row?.successRates || {}),
          '10m': totalWeight ? successes / totalWeight : Number.NaN,
        },
        recentSampleCount: totalWeight,
        recentSuccessCount: successes,
        recentConsecutiveSuccessCount: trailingSuccesses,
      };
    });
  }

  function normalizeGroupName(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  function buildGroupMultiplierMap(rows) {
    const result = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = normalizeGroupName(row?.planType || row?.name);
      const multiplier = Number(row?.priceMultiplier);
      if (name && Number.isFinite(multiplier) && multiplier >= 0) result.set(name, multiplier);
    }
    return result;
  }

  function nonNegativeNumberOrNull(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function buildGroupMetricMap(rows, config = DEFAULT_CONFIG) {
    const result = new Map();
    const normalizedConfig = normalizeConfig(config);
    const latencySource = normalizedConfig.latencySource;
    for (const row of Array.isArray(rows) ? rows : []) {
      const groupId = Number(row?.group_id);
      if (!Number.isInteger(groupId) || groupId <= 0) continue;
      const latencyMetric = getLatencyMetric(row, latencySource, normalizedConfig.minUserTtftSamples);
      const metric = {
        multiplier: nonNegativeNumberOrNull(row?.priceMultiplier),
        latencyMs: latencyMetric.value,
      };
      if (latencySource === 'user') {
        const latencySampleCount = latencyMetric.source === 'user' ? getUserLatencySampleCount(row) : null;
        if (latencySampleCount !== null) metric.latencySampleCount = latencySampleCount;
        if (latencyMetric.source !== 'user' || latencyMetric.userSampleInsufficient) {
          metric.latencyMetricSource = latencyMetric.source;
          metric.latencyFallback = latencyMetric.fallback;
        }
        if (latencyMetric.userSampleInsufficient) {
          metric.userSampleInsufficient = true;
          metric.userSampleCount = latencyMetric.userSampleCount;
          metric.minUserTtftSamples = latencyMetric.minUserTtftSamples;
        }
      }
      const detection = getModelDetection(row);
      const cacheHitRate = normalizeCacheHitRate(row?.cacheHitRate ?? row?.cache_hit_rate);
      if (detection) {
        metric.modelDetection = detection;
        metric.detectionStatus = detection.status;
      }
      if (cacheHitRate !== null) metric.cacheHitRate = cacheHitRate;
      const health = normalizeModelHealth(row?.modelHealth ?? row?.model_health);
      if (health) metric.modelHealth = health;
      const modelPrices = normalizeModelPrices(row?.modelPrices ?? row?.model_prices);
      if (modelPrices) metric.modelPrices = modelPrices;
      const effectivePricing = getEffectivePricing(row);
      if (effectivePricing.hasData) metric.effectivePricing = effectivePricing;
      const outputTokensPerSecond = nonNegativeNumberOrNull(row?.outputTokensPerSecond ?? row?.outputTps ?? row?.output_tps);
      if (outputTokensPerSecond !== null) metric.outputTokensPerSecond = outputTokensPerSecond;
      result.set(groupId, metric);
    }
    return result;
  }

  function normalizeGroupMonitorMultiplier(value) {
    const multiplier = nonNegativeNumberOrNull(value);
    return multiplier === null ? '' : multiplier.toFixed(6);
  }

  function groupDropdownMonitorKey(name, multiplier) {
    const normalizedName = normalizeGroupName(name);
    const normalizedMultiplier = normalizeGroupMonitorMultiplier(multiplier);
    return normalizedName && normalizedMultiplier ? `${normalizedName}|${normalizedMultiplier}` : '';
  }

  function newerMonitorRow(current, candidate) {
    if (!current) return candidate;
    const currentAt = Date.parse(current.checkedAt);
    const candidateAt = Date.parse(candidate.checkedAt);
    return Number.isFinite(candidateAt) && (!Number.isFinite(currentAt) || candidateAt > currentAt) ? candidate : current;
  }

  function buildGroupDropdownMonitorIndex(rows) {
    const byComposite = new Map();
    const byName = new Map();
    const ambiguousNames = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = normalizeGroupName(row?.planType || row?.name);
      if (!name) continue;
      const compositeKey = groupDropdownMonitorKey(name, row?.priceMultiplier);
      if (compositeKey) byComposite.set(compositeKey, newerMonitorRow(byComposite.get(compositeKey), row));
      if (byName.has(name)) {
        ambiguousNames.add(name);
        byName.delete(name);
      } else if (!ambiguousNames.has(name)) {
        byName.set(name, row);
      }
    }
    return { byComposite, byName, ambiguousNames };
  }

  function findGroupDropdownMonitor(index, name, multiplier) {
    const compositeKey = groupDropdownMonitorKey(name, multiplier);
    if (compositeKey && index?.byComposite instanceof Map && index.byComposite.has(compositeKey)) {
      return index.byComposite.get(compositeKey);
    }
    const normalizedName = normalizeGroupName(name);
    return normalizedName && index?.byName instanceof Map ? index.byName.get(normalizedName) || null : null;
  }

  function parseGroupOptionMultiplier(value) {
    const text = String(value || '');
    const match = text.match(/(?:×\s*([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)\s*x(?:\s*倍率)?)/i);
    if (!match) return null;
    const multiplier = Number(match[1] ?? match[2]);
    return Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : null;
  }

  function buildUsageModelPriceIndex(rows) {
    const result = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = row?.planType || row?.name;
      const key = groupDropdownMonitorKey(name, row?.priceMultiplier);
      const prices = getModelPrices(row);
      if (!key || !prices) continue;
      const current = result.get(key);
      const newest = newerMonitorRow(current?.row, row);
      if (!current || newest === row) result.set(key, { row, prices });
    }
    return result;
  }

  function findUsageModelPrice(index, groupName, multiplier, model) {
    const normalizedModel = String(model ?? '').trim().toLocaleLowerCase();
    if (!['sol', 'terra', 'luna'].includes(normalizedModel)) return null;
    const key = groupDropdownMonitorKey(groupName, multiplier);
    return key && index instanceof Map ? index.get(key)?.prices?.[normalizedModel] || null : null;
  }

  function parseCompactTokenCount(value) {
    const text = String(value ?? '').trim().replaceAll(',', '');
    const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kmb])?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const scale = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[String(match[2] || '').toLocaleLowerCase()] || 1;
    const normalized = amount * scale;
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
  }

  function getCompactTokenRoundingUncertainty(value) {
    const text = String(value ?? '').trim().replaceAll(',', '');
    const match = text.match(/^([0-9]+(?:\.([0-9]+))?)\s*([kmb])$/i);
    if (!match) return 0;
    const scale = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[match[3].toLocaleLowerCase()];
    const precision = match[2]?.length || 0;
    return scale / (10 ** precision) / 2;
  }

  function parseUsageTokenBreakdown(value) {
    const source = (Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/))
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    if (source.length < 2 || source.length > 3) return null;
    const counts = source.map(parseCompactTokenCount);
    if (counts.some((item) => item === null)) return null;
    return {
      inputTokens: counts[0],
      outputTokens: counts[1],
      cacheInputTokens: counts[2] ?? 0,
    };
  }

  function normalizeUsageTokenBreakdown(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const inputTokens = nonNegativeNumberOrNull(value.inputTokens ?? value.input_tokens);
    const outputTokens = nonNegativeNumberOrNull(value.outputTokens ?? value.output_tokens);
    const cacheInputTokens = nonNegativeNumberOrNull(value.cacheInputTokens ?? value.cache_input_tokens ?? value.cacheReadTokens ?? value.cache_read_tokens);
    if ([inputTokens, outputTokens, cacheInputTokens].some((item) => item === null)) return null;
    return { inputTokens, outputTokens, cacheInputTokens };
  }

  function getUsageModelVariant(value) {
    const normalized = String(value ?? '').trim().toLocaleLowerCase();
    const variants = [...normalized.matchAll(/(?:^|[-_/])(sol|terra|luna)(?=$|[-_/])/g)].map((match) => match[1]);
    const unique = [...new Set(variants)];
    return unique.length === 1 ? unique[0] : null;
  }

  function parseUsageCost(value) {
    const match = String(value ?? '').trim().replaceAll(',', '').match(/^\$\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (!match) return null;
    return nonNegativeNumberOrNull(match[1]);
  }

  function parseUsageActualCost(value) {
    return nonNegativeNumberOrNull(value) ?? parseUsageCost(value);
  }

  function parseUsageGroupMultiplier(value) {
    return nonNegativeNumberOrNull(value) ?? parseGroupOptionMultiplier(value);
  }

  function isMeteredUsageBillingMode(value) {
    return ['按量', 'token', 'metered'].includes(String(value ?? '').trim().toLocaleLowerCase());
  }

  function calculateUsageCost(tokens, price) {
    if (!tokens || !price) return null;
    const inputTokens = nonNegativeNumberOrNull(tokens.inputTokens);
    const outputTokens = nonNegativeNumberOrNull(tokens.outputTokens);
    const cacheInputTokens = nonNegativeNumberOrNull(tokens.cacheInputTokens);
    const inputPrice = nonNegativeNumberOrNull(price.inputPerMillion ?? price.input_per_million);
    const outputPrice = nonNegativeNumberOrNull(price.outputPerMillion ?? price.output_per_million);
    const cacheInputPrice = nonNegativeNumberOrNull(price.cacheInputPerMillion ?? price.cache_input_per_million);
    if ([inputTokens, outputTokens, cacheInputTokens, inputPrice, outputPrice, cacheInputPrice].some((item) => item === null)) return null;
    return ((inputTokens * inputPrice) + (outputTokens * outputPrice) + (cacheInputTokens * cacheInputPrice)) / 1_000_000;
  }

  function calculateUsageCostRoundingTolerance(tokenValues, price) {
    const source = (Array.isArray(tokenValues) ? tokenValues : String(tokenValues ?? '').split(/\r?\n/))
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    if (source.length < 2 || source.length > 3 || !price) return null;
    const inputPrice = nonNegativeNumberOrNull(price.inputPerMillion ?? price.input_per_million);
    const outputPrice = nonNegativeNumberOrNull(price.outputPerMillion ?? price.output_per_million);
    const cacheInputPrice = nonNegativeNumberOrNull(price.cacheInputPerMillion ?? price.cache_input_per_million);
    if ([inputPrice, outputPrice, cacheInputPrice].some((item) => item === null)) return null;
    const uncertainty = source.map(getCompactTokenRoundingUncertainty);
    return ((uncertainty[0] * inputPrice)
      + (uncertainty[1] * outputPrice)
      + ((uncertainty[2] || 0) * cacheInputPrice)) / 1_000_000;
  }

  function classifyUsageCostDeviation(actualCost, estimatedCost, tolerancePercent = DEFAULT_CONFIG.usageCostAuditTolerancePercent, absoluteTolerance = 0.000005) {
    const actual = nonNegativeNumberOrNull(actualCost);
    const estimated = nonNegativeNumberOrNull(estimatedCost);
    if (actual === null || estimated === null) return null;
    const difference = actual - estimated;
    const relativePercent = estimated > 0 ? (difference / estimated) * 100 : null;
    const tolerance = Math.max(estimated * clamp(numberOr(tolerancePercent, DEFAULT_CONFIG.usageCostAuditTolerancePercent), 0.1, 100) / 100, Math.max(0, Number(absoluteTolerance) || 0));
    return {
      actual,
      estimated,
      difference,
      relativePercent,
      tolerance,
      anomaly: Math.abs(difference) > tolerance,
      direction: difference > 0 ? 'high' : difference < 0 ? 'low' : 'equal',
    };
  }

  function auditUsageCostRecord(record, priceIndex, config = DEFAULT_CONFIG) {
    const normalizedConfig = normalizeConfig(config);
    if (!normalizedConfig.usageCostAuditEnabled) return { status: 'skipped', reason: 'disabled' };
    if (!isMeteredUsageBillingMode(record?.billingMode)) return { status: 'skipped', reason: 'billing_mode' };
    const model = getUsageModelVariant(record?.model);
    const multiplier = parseUsageGroupMultiplier(record?.groupMultiplier ?? record?.groupText);
    const exactTokens = normalizeUsageTokenBreakdown(record?.tokens);
    const tokens = exactTokens || parseUsageTokenBreakdown(record?.tokenValues ?? record?.tokenText);
    const actualCost = parseUsageActualCost(record?.actualCost);
    const price = findUsageModelPrice(priceIndex, record?.groupName, multiplier, model);
    if (!model || multiplier === null || !tokens || actualCost === null || !price) return { status: 'skipped', reason: 'missing_data' };
    const estimatedCost = calculateUsageCost(tokens, price);
    const roundingTolerance = exactTokens ? 0 : calculateUsageCostRoundingTolerance(record?.tokenValues ?? record?.tokenText, price);
    const absoluteTolerance = Math.max(0.000005, roundingTolerance || 0);
    const deviation = classifyUsageCostDeviation(actualCost, estimatedCost, normalizedConfig.usageCostAuditTolerancePercent, absoluteTolerance);
    if (!deviation) return { status: 'skipped', reason: 'invalid_cost' };
    return { status: deviation.anomaly ? 'anomaly' : 'ok', model, multiplier, tokens, price, exactTokens: Boolean(exactTokens), roundingTolerance, ...deviation };
  }

  function formatUsageCost(value) {
    const amount = nonNegativeNumberOrNull(value);
    return amount === null ? '' : USAGE_COST_CURRENCY_FORMATTER.format(amount);
  }

  function formatGroupDropdownMonitor(row, latencySource = 'probe', minUserTtftSamples = DEFAULT_CONFIG.minUserTtftSamples) {
    const normalizedLatencySource = normalizeLatencySource(latencySource);
    const metric = getLatencyMetric(row, normalizedLatencySource, minUserTtftSamples);
    const latency = metric.value;
    const label = getLatencyMetricLabel(normalizedLatencySource, metric);
    const sampleCount = normalizedLatencySource === 'user' && metric.source === 'user' ? getUserLatencySampleCount(row) : null;
    const sampleText = sampleCount === null ? '' : `（${sampleCount} 条）`;
    const latencyValueText = row && latency !== null ? `${Math.round(latency)} ms${sampleText}` : '';
    const latencyText = row && latency !== null
      ? `${label} ${latencyValueText}`
      : `${label} 暂无数据`;
    const detectionTitle = formatModelDetectionTitle(row);
    const withDetectionTitle = (result) => detectionTitle ? { ...result, detectionTitle } : result;
    if (!row) return withDetectionTitle({ statusText: '暂无监控', statusTone: 'unknown', latencyText, latencyValueText });
    if (row.enabled === false) return withDetectionTitle({ statusText: '已停用', statusTone: 'disabled', latencyText, latencyValueText });
    if (row.available === true
      && ((Array.isArray(row.warningReasons) && row.warningReasons.length) || hasModelDetectionWarning(row))) {
      const detectionLabel = getModelDetectionLabel(row);
      return withDetectionTitle({ statusText: detectionLabel && detectionLabel !== '检测通过' ? `可用 · ${detectionLabel}` : '可用 · 有警告', statusTone: 'warning', latencyText, latencyValueText });
    }
    if (row.available === true) {
      const detectionLabel = getModelDetectionLabel(row);
      return withDetectionTitle({ statusText: detectionLabel ? `可用 · ${detectionLabel}` : '可用', statusTone: 'available', latencyText, latencyValueText });
    }
    if (row.available === false) return withDetectionTitle({ statusText: '不可用', statusTone: 'unavailable', latencyText, latencyValueText });
    return withDetectionTitle({ statusText: '暂无监控', statusTone: 'unknown', latencyText, latencyValueText });
  }

  function getGroupDropdownToneClass(tone) {
    const safeTone = ['available', 'warning', 'unavailable', 'disabled', 'error'].includes(tone) ? tone : '';
    return safeTone ? `asg-key-group-badge-${safeTone}` : '';
  }

  function formatKeyOptionLabel(key, metric, latencySource = 'probe') {
    const name = String(key?.name || `Key ${key?.id ?? ''}`).trim();
    const groupName = String(key?.groupName || '未分组').trim();
    const multiplier = nonNegativeNumberOrNull(metric?.multiplier);
    const latencyMs = nonNegativeNumberOrNull(metric?.latencyMs);
    const multiplierText = multiplier === null ? '倍率暂无数据' : formatMultiplier(multiplier);
    const normalizedLatencySource = normalizeLatencySource(latencySource);
    const latencyLabel = getLatencyMetricLabel(normalizedLatencySource, metric);
    const latencySampleCount = normalizedLatencySource === 'user' && metric?.latencyMetricSource !== 'probe'
      ? nonNegativeNumberOrNull(metric?.latencySampleCount)
      : null;
    const latencySampleText = latencySampleCount !== null && latencySampleCount > 0 ? `（${Math.floor(latencySampleCount)} 条）` : '';
    const latencyText = latencyMs === null ? `${latencyLabel} 暂无数据` : `${latencyLabel} ${formatLatency(latencyMs)}${latencySampleText}`;
    const detection = metric?.modelDetection ?? (metric?.detectionStatus ? { status: metric.detectionStatus } : null);
    const detectionText = detection ? ` · ${getModelDetectionLabel(detection)}` : '';
    const cacheText = metric?.cacheHitRate == null ? '' : ` · 缓存 ${(metric.cacheHitRate * 100).toFixed(1)}%`;
    return `${name} · ${groupName} · ${multiplierText} · ${latencyText}${detectionText}${cacheText}`;
  }

  function formatMultiplier(value) {
    const multiplier = Number(value);
    if (!Number.isFinite(multiplier) || multiplier < 0) return '';
    return `×${multiplier.toFixed(6).replace(/\.?0+$/, '')}`;
  }

  function getPageFeatures(pathname, loggedIn) {
    const path = String(pathname || '').split('?')[0];
    const providerSort = path === '/providers' || path.startsWith('/providers/');
    if (!loggedIn) return { panel: false, usage: false, keyGroups: false, providerSort };
    return {
      panel: true,
      usage: path === '/usage' || path.startsWith('/usage/'),
      keyGroups: path === '/keys' || path.startsWith('/keys/'),
      providerSort,
    };
  }

  function createStabilityState() {
    return { groupId: null, count: 0, stable: false, strategySignature: '' };
  }

  function getRecommendationStrategySignature(config = DEFAULT_CONFIG) {
    const normalized = normalizeConfig(config);
    return JSON.stringify({
      mode: normalized.mode,
      recommendationPriceBasis: normalized.mode === 'price' ? normalized.recommendationPriceBasis : 'nominal',
      balanceMaxPrice: normalized.mode === 'balance' ? normalized.balanceMaxPrice : null,
      latencySource: normalized.latencySource,
      minUserTtftSamples: normalized.latencySource === 'user' ? normalized.minUserTtftSamples : null,
      availabilityMode: normalized.availabilityMode,
      minSuccess10m: normalized.minSuccess10m,
      minSuccessPoints10m: normalized.minSuccessPoints10m,
      minConsecutiveSuccesses10m: normalized.minConsecutiveSuccesses10m,
      requireNoWarnings: normalized.requireNoWarnings,
      excludedGroupKeywords: normalized.excludedGroupKeywords,
    });
  }

  function getRecommendationSnapshotBlockReason(winner, config = DEFAULT_CONFIG, stability = createStabilityState()) {
    if (!winner) return '';
    const normalizedConfig = normalizeConfig(config);
    const currentSignature = getRecommendationStrategySignature(normalizedConfig);
    if (String(stability?.strategySignature || '') !== currentSignature) return '推荐策略已变化，请重新检测';
    const expectedBasis = normalizedConfig.mode === 'price' ? normalizedConfig.recommendationPriceBasis : 'nominal';
    if (winner.rankingPriceBasis !== expectedBasis) return '推荐价格口径已变化，请重新检测';
    const currentMetric = getRecommendationPriceMetric(winner, expectedBasis);
    if (!currentMetric.available) {
      return `${RECOMMENDATION_PRICE_BASIS_LABELS[expectedBasis]}当前不可用，请重新检测`;
    }
    const rankedValue = nonNegativeNumberOrNull(winner.rankingPriceValue);
    if (rankedValue === null || currentMetric.value !== rankedValue) return '推荐价格数据已变化，请重新检测';
    return '';
  }

  function advanceStability(state, groupId, requiredChecks, strategySignature = '') {
    const required = Math.max(1, Math.round(Number(requiredChecks) || 1));
    const numericGroupId = Number.isInteger(Number(groupId)) ? Number(groupId) : null;
    if (numericGroupId === null) return createStabilityState();
    const normalizedSignature = String(strategySignature || '');
    const sameGroup = state && state.groupId === numericGroupId && String(state.strategySignature || '') === normalizedSignature;
    const count = sameGroup ? Number(state.count || 0) + 1 : 1;
    return { groupId: numericGroupId, count, stable: count >= required, strategySignature: normalizedSignature };
  }

  function canAutoSwitch(options) {
    return getAutoSwitchBlockReason(options) === '';
  }

  function getAutoSwitchBlockReason({ now, lastSwitchAt, currentGroupId, targetGroupId, stable, config, monitorStale, monitorFreshnessText }) {
    if (monitorStale) return `监控数据已过期（${monitorFreshnessText || '时间未知'}）`;
    if (!stable) return '推荐尚未稳定';
    if (targetGroupId == null) return '暂无推荐分组';
    if (currentGroupId === targetGroupId) return '当前密钥已经在推荐分组';
    const cooldown = getCooldownInfo(lastSwitchAt, normalizeConfig(config).cooldownMinutes, now);
    if (cooldown.active) return `切换冷却中（${cooldown.label}）`;
    return '';
  }

  function shouldLogTransition(previous, current, forced = false) {
    return forced || previous !== current;
  }

  function getSwitchBlockReason({ loading, allowWhileLoading, error, authError, monitorStale, monitorFreshnessText, winner, key, stability, requiredChecks, config }) {
    if (loading && !allowWhileLoading) return '正在检测';
    if (error) return String(error);
    if (authError) return String(authError);
    if (monitorStale) return `监控数据已过期（${monitorFreshnessText || '时间未知'}）`;
    if (!winner) return '暂无符合条件的推荐分组';
    if (!key) return '请先读取并选择目标密钥';
    if (!stability?.stable) return `推荐尚未稳定（${Number(stability?.count) || 0}/${requiredChecks} 次）`;
    if (config) {
      const snapshotReason = getRecommendationSnapshotBlockReason(winner, config, stability);
      if (snapshotReason) return snapshotReason;
    }
    if (key.groupId === winner.groupId) return '当前密钥已经在推荐分组';
    return '';
  }

  function projectKeys(keys) {
    return (Array.isArray(keys) ? keys : [])
      .filter((key) => key && key.id != null)
      .map((key) => ({
        id: key.id,
        name: String(key.name || `Key ${key.id}`),
        groupId: key.group_id == null ? null : Number(key.group_id),
        groupName: String(key.group?.name || key.group_name || '未分组'),
        status: String(key.status || ''),
      }));
  }

  function buildAuthHeaders(token) {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    return trimmed ? { Authorization: `Bearer ${trimmed}` } : {};
  }

  function buildApiHeaders(path, token) {
    const headers = buildAuthHeaders(token);
    if (/^\/(?:auth\/me(?:\?|$)|keys(?:\/|\?|$)|groups\/(?:available|rates)(?:\?|$)|usage(?:\/|\?|$)|redeem(?:\/|\?|$)|subscriptions(?:\/|\?|$))/.test(path)) {
      headers['X-User-UI-Request'] = '1';
    }
    return headers;
  }

  function mergeKeyPages(pages) {
    const byId = new Map();
    for (const page of Array.isArray(pages) ? pages : []) {
      const items = Array.isArray(page)
        ? page
        : (Array.isArray(page?.items)
          ? page.items
          : (Array.isArray(page?.data?.items) ? page.data.items : (Array.isArray(page?.data) ? page.data : [])));
      for (const key of items) {
        if (key && key.id != null && !byId.has(key.id)) byId.set(key.id, key);
      }
    }
    return [...byId.values()];
  }

  function shouldRefreshKeys({ now = Date.now(), lastFetchedAt, keyCount, force = false, intervalMs = 5 * 60 * 1000 }) {
    const fetchedAt = Number(lastFetchedAt);
    return force === true
      || Number(keyCount) === 0
      || !Number.isFinite(fetchedAt)
      || fetchedAt <= 0
      || Number(now) - fetchedAt >= Math.max(0, Number(intervalMs) || 0);
  }

  function storageGet(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(STORAGE_PREFIX + key, fallback);
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(STORAGE_PREFIX + key, value);
        return;
      }
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage is optional; a failed write must not interrupt monitoring.
    }
  }

  function sanitizeLogText(value) {
    return String(value ?? '')
      .replace(/(Bearer\s+)[^\s,'"]+/gi, '$1[已隐藏]')
      .replace(/((?:auth[_-]?token|access[_-]?token|token)\s*[=:]\s*)[^\s,'"]+/gi, '$1[已隐藏]')
      .replace(/(?:sk-|key-)[^\s,'"]{8,}/gi, '[已隐藏]')
      .slice(0, 180);
  }

  function appendLogEntries(logs, entry, limit = 100) {
    const safeEntry = {
      at: Number(entry?.at) || Date.now(),
      scope: String(entry?.scope || 'general'),
      level: String(entry?.level || 'info'),
      message: sanitizeLogText(entry?.message),
    };
    return [safeEntry, ...(Array.isArray(logs) ? logs : [])]
      .slice(0, Math.max(1, Number(limit) || 100));
  }

  function formatLogLine(entry) {
    const time = new Date(Number(entry?.at) || Date.now()).toLocaleString();
    return `[${time}] ${entry?.level === 'error' ? '错误' : entry?.level === 'warn' ? '警告' : '信息'}：${sanitizeLogText(entry?.message)}`;
  }

  function readScopeLogs(scope) {
    return storageGet('runtime-logs', []).filter((entry) => entry?.scope === scope).slice(0, 30);
  }

  function writeRuntimeLog(scope, level, message) {
    const logs = appendLogEntries(storageGet('runtime-logs', []), { scope, level, message });
    storageSet('runtime-logs', logs);
    return logs;
  }

  function getAuthToken() {
    try {
      // Tampermonkey may expose page storage through the isolated world or
      // through unsafeWindow depending on its sandbox settings.
      const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      return pageWindow.localStorage.getItem('auth_token')
        || localStorage.getItem('auth_token')
        || '';
    } catch {
      return '';
    }
  }

  function getPageWindow() {
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  }

  function isPageVisible() {
    return typeof document === 'undefined' || document.hidden !== true;
  }

  async function apiRequest(path, options = {}) {
    const { timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestOptions } = options;
    const requestTimeoutMs = Math.max(1, Number(timeoutMs) || API_REQUEST_TIMEOUT_MS);
    const pageWindow = getPageWindow();
    const AbortControllerCtor = pageWindow.AbortController || globalThis.AbortController;
    const setTimer = typeof pageWindow.setTimeout === 'function'
      ? pageWindow.setTimeout.bind(pageWindow)
      : globalThis.setTimeout;
    const clearTimer = typeof pageWindow.clearTimeout === 'function'
      ? pageWindow.clearTimeout.bind(pageWindow)
      : globalThis.clearTimeout;
    const controller = !requestOptions.signal && typeof AbortControllerCtor === 'function'
      ? new AbortControllerCtor()
      : null;
    const timeoutId = controller && typeof setTimer === 'function'
      ? setTimer(() => controller.abort(), requestTimeoutMs)
      : null;
    const headers = {
      Accept: 'application/json',
      ...buildApiHeaders(path, getAuthToken()),
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOptions.headers || {}),
    };
    try {
      const response = await pageWindow.fetch(`/api/v1${path}`, {
        credentials: 'include',
        ...requestOptions,
        ...(controller ? { signal: controller.signal } : {}),
        headers,
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const detail = payload && (payload.detail || payload.message);
        const error = new Error(detail ? String(detail) : `请求失败 (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (controller?.signal.aborted && error?.name === 'AbortError') {
        const timeoutLabel = requestTimeoutMs >= 1000 ? `${Math.ceil(requestTimeoutMs / 1000)} 秒` : `${requestTimeoutMs} 毫秒`;
        throw new Error(`请求超时（${timeoutLabel}）`);
      }
      throw error;
    } finally {
      if (timeoutId !== null && typeof clearTimer === 'function') clearTimer(timeoutId);
    }
  }

  const monitorSummaryCache = {
    value: null,
    fetchedAt: 0,
    pending: null,
  };
  const monitorSeriesCache = {
    value: null,
    fetchedAt: 0,
    pending: null,
  };

  function clearMonitorSummaryCache() {
    monitorSummaryCache.value = null;
    monitorSummaryCache.fetchedAt = 0;
  }

  function clearMonitorSeriesCache() {
    monitorSeriesCache.value = null;
    monitorSeriesCache.fetchedAt = 0;
  }

  async function requestMonitorSummary(options = {}) {
    try {
      const payload = await apiRequest('/public/providers?timezone=Asia%2FShanghai', options);
      return normalizeMonitorSummaryPayload(payload);
    } catch (primaryError) {
      try {
        return normalizeMonitorSummaryPayload(await apiRequest('/public/monitor/summary', options));
      } catch {
        throw primaryError;
      }
    }
  }

  function fetchMonitorSummary(options = {}) {
    const force = options?.force === true;
    const now = Date.now();
    if (monitorSummaryCache.pending) return monitorSummaryCache.pending;
    if (!force
      && monitorSummaryCache.value
      && now - monitorSummaryCache.fetchedAt < MONITOR_SUMMARY_CACHE_TTL_MS) {
      return Promise.resolve(monitorSummaryCache.value);
    }
    const pending = requestMonitorSummary({ timeoutMs: options?.timeoutMs })
      .then((summary) => {
        monitorSummaryCache.value = summary;
        monitorSummaryCache.fetchedAt = Date.now();
        return summary;
      })
      .finally(() => {
        if (monitorSummaryCache.pending === pending) monitorSummaryCache.pending = null;
      });
    monitorSummaryCache.pending = pending;
    return pending;
  }

  async function requestMonitorSeries(options = {}) {
    try {
      const payload = await apiRequest('/public/providers/series?range=6h&timezone=Asia%2FShanghai', options);
      return normalizeMonitorSeriesPayload(payload);
    } catch (primaryError) {
      if (![404, 410].includes(Number(primaryError?.status))) throw primaryError;
      try {
        return normalizeMonitorSeriesPayload(await apiRequest('/public/monitor/series/6h', options));
      } catch {
        throw primaryError;
      }
    }
  }

  function fetchMonitorSeries(options = {}) {
    const force = options?.force === true;
    const now = Date.now();
    if (monitorSeriesCache.pending) return monitorSeriesCache.pending;
    if (!force
      && monitorSeriesCache.value
      && now - monitorSeriesCache.fetchedAt < MONITOR_SERIES_CACHE_TTL_MS) {
      return Promise.resolve(monitorSeriesCache.value);
    }
    const pending = requestMonitorSeries({ timeoutMs: options?.timeoutMs })
      .then((series) => {
        monitorSeriesCache.value = series;
        monitorSeriesCache.fetchedAt = Date.now();
        return series;
      })
      .finally(() => {
        if (monitorSeriesCache.pending === pending) monitorSeriesCache.pending = null;
      });
    monitorSeriesCache.pending = pending;
    return pending;
  }

  async function fetchCurrentBalance() {
    return apiRequest('/auth/me?timezone=Asia%2FShanghai');
  }

  function getCurrentUsageRequestPath(entries, pageWindow = getPageWindow()) {
    let resourceEntries = entries;
    if (resourceEntries == null) {
      try {
        resourceEntries = pageWindow?.performance?.getEntriesByType?.('resource');
      } catch {
        resourceEntries = [];
      }
    }
    const pageOrigin = pageWindow?.location?.origin || (typeof location !== 'undefined' ? location.origin : '');
    const baseUrl = pageWindow?.location?.href || (typeof location !== 'undefined' ? location.href : 'https://aihub.top/usage');
    const URLCtor = pageWindow?.URL;
    if (typeof URLCtor !== 'function') return null;
    for (const entry of [...(resourceEntries || [])].reverse()) {
      try {
        const url = new URLCtor(String(entry?.name || ''), baseUrl);
        if (pageOrigin && url.origin !== pageOrigin) continue;
        if (url.pathname !== '/api/v1/usage') continue;
        return `${url.pathname.slice('/api/v1'.length)}${url.search}`;
      } catch {
        // Ignore malformed resource entries and continue with older requests.
      }
    }
    return null;
  }

  function buildUsageAuditViewKey(path, rowIds) {
    const requestPath = String(path ?? '').trim();
    const ids = [...new Set([...(rowIds || [])].map((id) => String(id ?? '').trim()).filter(Boolean))].sort();
    return requestPath && ids.length ? `${requestPath}#${ids.join(',')}` : '';
  }

  function shouldLoadUsageAuditView({
    key = '',
    loadedKey = '',
    pendingKey = '',
    failedKey = '',
    now = Date.now(),
    lastAttemptAt = 0,
    retryMs = USAGE_AUDIT_RETRY_MS,
  } = {}) {
    if (!key || key === loadedKey || key === pendingKey) return false;
    return key !== failedKey || Number(now) - Number(lastAttemptAt) >= Math.max(0, Number(retryMs) || 0);
  }

  function projectUsageAuditItems(items) {
    const projected = [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = String(item?.id ?? '').trim();
      const tokens = normalizeUsageTokenBreakdown({
        input_tokens: item?.input_tokens,
        output_tokens: item?.output_tokens,
        cache_read_tokens: item?.cache_read_tokens,
      });
      const actualCost = nonNegativeNumberOrNull(item?.actual_cost);
      const rateMultiplier = nonNegativeNumberOrNull(item?.rate_multiplier);
      if (!id || !tokens || actualCost === null || rateMultiplier === null) continue;
      projected.push({
        id,
        model: String(item?.model ?? ''),
        groupName: normalizeGroupName(item?.group?.name ?? item?.group_name),
        rateMultiplier,
        tokens,
        actualCost,
        billingMode: String(item?.billing_mode ?? item?.billingMode ?? item?.billing_type ?? ''),
      });
    }
    return projected;
  }

  function buildUsageAuditRecordFromApiItem(item) {
    if (!item || typeof item !== 'object') return null;
    return {
      groupName: item.groupName,
      groupMultiplier: item.rateMultiplier,
      model: item.model,
      billingMode: item.billingMode,
      tokens: item.tokens,
      actualCost: item.actualCost,
    };
  }

  async function fetchCurrentUsageAuditItems(options = {}) {
    const { path: requestedPath, ...requestOptions } = options;
    const path = String(requestedPath || getCurrentUsageRequestPath() || '').trim();
    if (!path) return null;
    const payload = await apiRequest(path, requestOptions);
    const items = Array.isArray(payload?.data?.items)
      ? payload.data.items
      : (Array.isArray(payload?.items) ? payload.items : []);
    return projectUsageAuditItems(items);
  }

  async function fetchAllKeys() {
    const pages = [];
    let page = 1;
    let totalPages = 1;
    do {
      const query = new URLSearchParams({ page: String(page), page_size: '100', sort_by: 'created_at', sort_order: 'desc' });
      const result = await apiRequest(`/keys?${query}`);
      pages.push(result);
      totalPages = Math.max(1, Number(result?.pages ?? result?.data?.pages) || 1);
      page += 1;
    } while (page <= totalPages);
    return projectKeys(mergeKeyPages(pages));
  }

  async function updateKeyGroup(keyId, groupId) {
    return apiRequest(`/keys/${encodeURIComponent(keyId)}`, {
      method: 'PUT',
      body: JSON.stringify({ group_id: Number(groupId) }),
    });
  }

  const STYLE = `
    #${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-direction:column;width:680px;height:min(620px,calc(100vh - 32px));max-width:calc(100vw - 32px);color:#172033;background:#fff;border:1px solid #d6dbe5;border-radius:8px;box-shadow:0 8px 30px rgba(16,24,40,.18);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
    #${ROOT_ID}[hidden]{display:none}
    #${ROOT_ID} *{box-sizing:border-box}
    #${ROOT_ID} .asg-head{display:flex;flex:none;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e4e7ec}
    #${ROOT_ID} .asg-head strong{font-size:14px}
    #${ROOT_ID} button{font:inherit;cursor:pointer;border:1px solid #cfd5df;border-radius:6px;background:#fff;color:#172033;padding:5px 9px}
    #${ROOT_ID} button:hover:not(:disabled){background:#f3f5f8}
    #${ROOT_ID} button:disabled{cursor:not-allowed;opacity:.5}
    #${ROOT_ID} .asg-icon{border:0;padding:2px 5px;font-size:18px;line-height:1}
    #${ROOT_ID} .asg-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);flex:1;min-height:0;overflow:hidden}
    #${ROOT_ID} .asg-main-column,#${ROOT_ID} .asg-side-column{min-width:0;min-height:0;overflow:auto;padding:10px 12px}
    #${ROOT_ID} .asg-side-column{border-left:1px solid #e4e7ec;background:#fbfcfe}
    #${ROOT_ID} .asg-status-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
    #${ROOT_ID} .asg-status{min-width:0;color:#667085;font-size:12px}
    #${ROOT_ID} .asg-balance{flex:none;color:#15803d;font-size:12px;font-weight:600;text-align:right;white-space:nowrap}
    #${ROOT_ID} .asg-balance.asg-balance-error{color:#b54708;font-weight:500}
    #${ROOT_ID} .asg-recommend{padding:9px;background:#f4f8ff;border:1px solid #cfe0ff;border-radius:6px;margin:9px 0}
    #${ROOT_ID} .asg-recommend.asg-recommend-stale{background:#fff4f2;border-color:#fecdca}
    #${ROOT_ID} .asg-recommend strong{font-size:15px}
    #${ROOT_ID} .asg-muted{color:#667085}
    #${ROOT_ID} .asg-metrics{display:flex;flex-wrap:wrap;gap:6px 12px;color:#475467;font-size:12px;margin-top:4px}
    #${ROOT_ID} .asg-recommend-meta{margin-top:5px;color:#667085;font-size:11px;line-height:1.45;overflow-wrap:anywhere}
    #${ROOT_ID} .asg-monitor-age{margin-top:4px;color:#15803d;font-size:11px}
    #${ROOT_ID} .asg-monitor-age.asg-stale{color:#b42318;font-weight:600}
    #${ROOT_ID} label{display:block;color:#475467;font-size:12px;margin:8px 0 4px}
    #${ROOT_ID} [data-availability-setting][hidden]{display:none !important}
    #${ROOT_ID} [data-latency-setting][hidden]{display:none !important}
    #${ROOT_ID} select,#${ROOT_ID} input[type=number],#${ROOT_ID} input[type=text]{width:100%;border:1px solid #cfd5df;border-radius:6px;padding:6px;background:#fff;color:#172033;font:inherit}
    #${ROOT_ID} .asg-key-details[hidden]{display:none}
    #${ROOT_ID} .asg-key-details{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 10px;margin-top:5px;padding:6px 0 2px;border-bottom:1px solid #eef0f3}
    #${ROOT_ID} .asg-key-detail{min-width:0}
    #${ROOT_ID} .asg-key-detail span{display:block;color:#667085;font-size:10px}
    #${ROOT_ID} .asg-key-detail strong{display:block;margin-top:1px;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
    #${ROOT_ID} .asg-key-metric{color:#15803d}
    #${ROOT_ID} .asg-actions{display:flex;gap:7px;margin-top:10px}
    #${ROOT_ID} .asg-actions button:last-child{flex:1;background:#1456d9;color:#fff;border-color:#1456d9}
    #${ROOT_ID} .asg-actions button:last-child:hover:not(:disabled){background:#0f46b6}
    #${ROOT_ID} .asg-auto{display:flex;align-items:center;gap:6px;margin-top:9px;color:#475467}
    #${ROOT_ID} .asg-auto input{margin:0}
    #${ROOT_ID} .asg-guide{margin-top:8px;color:#475467;font-size:12px}
    #${ROOT_ID} .asg-guide ol{margin:6px 0 0;padding-left:20px}
    #${ROOT_ID} details{margin-top:9px;border-top:1px solid #e4e7ec;padding-top:7px}
    #${ROOT_ID} summary{cursor:pointer;color:#475467}
    #${ROOT_ID} .asg-side-tabs{position:sticky;top:-10px;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px;margin:-10px -12px 0;padding:10px 12px 8px;background:#fbfcfe;border-bottom:1px solid #e4e7ec}
    #${ROOT_ID} .asg-side-tab{border-color:transparent;background:transparent;color:#667085;font-weight:600}
    #${ROOT_ID} .asg-side-tab[aria-selected=true]{border-color:#b8cff9;background:#eaf1ff;color:#1456d9}
    #${ROOT_ID} .asg-side-view[hidden]{display:none}
    #${ROOT_ID} .asg-settings-body{margin-top:7px}
    #${ROOT_ID} .asg-settings-section{padding:7px 0}
    #${ROOT_ID} .asg-settings-section+.asg-settings-section{border-top:1px solid #eef0f3}
    #${ROOT_ID} .asg-settings-head{display:flex;align-items:baseline;gap:12px;margin-bottom:6px;min-width:0}
    #${ROOT_ID} .asg-settings-title{flex:none;color:#344054;font-size:11px;font-weight:600}
    #${ROOT_ID} .asg-settings-inline-label{min-width:0;margin:0;color:#475467;font-size:12px;line-height:1.3;overflow-wrap:anywhere}
    #${ROOT_ID} .asg-settings-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px 9px}
    #${ROOT_ID} .asg-settings-grid label{margin:0}
    #${ROOT_ID} .asg-settings-grid input[type=number],#${ROOT_ID} .asg-settings-grid input[type=text]{margin-top:3px}
    #${ROOT_ID} .asg-setting-wide{grid-column:1/-1}
    #${ROOT_ID} .asg-setting-compact{min-width:0}
    #${ROOT_ID} .asg-settings-grid .asg-auto{margin:1px 0 0}
    #${ROOT_ID} .asg-balance-setting{grid-column:1/-1}
    #${ROOT_ID} .asg-balance-preview,#${ROOT_ID} .asg-balance-reason,#${ROOT_ID} .asg-setting-preview{display:block;margin-top:4px;color:#15803d;font-size:11px;line-height:1.4;overflow-wrap:anywhere}
    #${ROOT_ID} .asg-preview-pending{color:#b54708}
    #${ROOT_ID} .asg-save{width:100%;margin-top:5px;background:#1456d9;color:#fff;border-color:#1456d9;font-weight:600}
    #${ROOT_ID} .asg-save:hover:not(:disabled){background:#0f46b6}
    #${ROOT_ID} .asg-log-actions{display:flex;justify-content:flex-end;margin-top:7px}
    #${ROOT_ID} .asg-logs{margin:6px 0 0;padding:0;list-style:none;border-top:1px solid #eef0f3}
    #${ROOT_ID} .asg-logs li{padding:5px 0;border-bottom:1px solid #eef0f3;font-size:11px;overflow-wrap:anywhere}
    #${ROOT_ID} .asg-logs .asg-log-error{color:#b42318}
    #${ROOT_ID} .asg-list{margin:8px 0 0;padding:0;list-style:none;max-height:132px;overflow:auto;border-top:1px solid #eef0f3}
    #${ROOT_ID} .asg-list li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eef0f3}
    #${ROOT_ID} .asg-list li span:last-child{text-align:right;color:#475467;white-space:nowrap}
    #${ROOT_ID} .asg-error{color:#b42318;background:#fff4f2;border-color:#fecdca}
    #${TOGGLE_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:42px;height:42px;padding:0;border:1px solid #1456d9;border-radius:50%;background:#1456d9;color:#fff;box-shadow:0 8px 24px rgba(16,24,40,.2);font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
    #${TOGGLE_ID}[hidden]{display:none}
    #${TOGGLE_ID}:hover{background:#0f46b6}
    @media (max-width:759px){
      #${ROOT_ID}{width:min(360px,calc(100vw - 32px))}
      #${ROOT_ID} .asg-body{
        display:flex;
        flex-direction:column;
        overflow:auto;
        -webkit-overflow-scrolling:touch;
      }
      #${ROOT_ID} .asg-main-column,
      #${ROOT_ID} .asg-side-column{
        flex:0 0 auto;
        min-height:auto;
        overflow:visible;
      }
      #${ROOT_ID} .asg-side-column{
        border-top:1px solid #e4e7ec;
        border-left:0;
      }
      #${ROOT_ID} .asg-side-tabs{
        position:static;
        top:auto;
        z-index:auto;
        margin:0;
        padding:0 0 8px;
      }
    }
  `;

  const USAGE_STYLE = `
    .asg-usage-multiplier{margin-inline-start:6px;color:#15803d;font-weight:600;white-space:nowrap}
    .asg-usage-cost-summary{display:flex;align-items:center;justify-content:flex-end;margin:0 0 8px;color:#475467;font-size:12px;line-height:1.4}
    .asg-usage-cost-summary.asg-usage-cost-summary-warning{color:#b42318;font-weight:600}
    .asg-usage-cost-audit{display:block;margin-top:3px;color:#15803d;font-size:11px;font-weight:600;line-height:1.35;white-space:nowrap}
    .asg-usage-cost-audit.asg-usage-cost-anomaly{color:#b42318}
    .dark .asg-usage-multiplier,.dark .asg-usage-cost-audit{color:#4ade80}
    .dark .asg-usage-cost-summary{color:#98a2b3}
    .dark .asg-usage-cost-summary.asg-usage-cost-summary-warning,.dark .asg-usage-cost-audit.asg-usage-cost-anomaly{color:#f87171}
  `;

  const KEY_GROUP_STYLE = `
    .asg-key-group-option .asg-key-group-row{align-items:center!important;gap:10px}
    .asg-key-group-main{display:flex!important;flex:1 1 auto;flex-direction:row!important;align-items:center!important;gap:7px;min-width:0}
    .asg-key-group-main>.groupOptionItemBadge{min-width:0}
    .groupOptionItemBadge.asg-key-group-badge-available{color:#15803d!important;background:#ecfdf3!important}
    .groupOptionItemBadge.asg-key-group-badge-warning{color:#b54708!important;background:#fffaeb!important}
    .groupOptionItemBadge.asg-key-group-badge-unavailable,.groupOptionItemBadge.asg-key-group-badge-error{color:#b42318!important;background:#fff1f0!important}
    .groupOptionItemBadge.asg-key-group-badge-disabled{color:#667085!important;background:#f2f4f7!important}
    .asg-key-group-rate-shell{flex:0 0 auto;min-width:max-content;padding-top:0!important}
    .asg-key-group-rate{display:flex!important;flex-direction:row!important;align-items:center!important;gap:8px;white-space:nowrap}
    .asg-key-group-status,.asg-key-group-latency{display:inline-flex;flex:0 0 auto;align-items:center;margin:0;font-size:11px;line-height:1.25;white-space:nowrap}
    .asg-key-group-status{font-weight:600}
    .asg-key-group-status::before{display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:currentColor;content:"";vertical-align:1px}
    .asg-key-group-status-available{color:#15803d}
    .asg-key-group-status-warning{color:#b54708}
    .asg-key-group-status-unavailable,.asg-key-group-status-error{color:#b42318}
    .asg-key-group-status-disabled,.asg-key-group-status-unknown{color:#667085}
    .asg-key-group-latency{color:#667085;font-weight:500;text-align:right}
    .asg-key-group-latency-value{margin-left:3px;color:#15803d;font-weight:700}
    .dark .asg-key-group-status-available{color:#4ade80}
    .dark .asg-key-group-status-warning{color:#fbbf24}
    .dark .asg-key-group-status-unavailable,.dark .asg-key-group-status-error{color:#f87171}
    .dark .asg-key-group-status-disabled,.dark .asg-key-group-status-unknown,.dark .asg-key-group-latency{color:#98a2b3}
    .dark .asg-key-group-latency-value{color:#4ade80}
    .dark .groupOptionItemBadge.asg-key-group-badge-available{color:#4ade80!important;background:rgba(34,197,94,.12)!important}
    .dark .groupOptionItemBadge.asg-key-group-badge-warning{color:#fbbf24!important;background:rgba(245,158,11,.12)!important}
    .dark .groupOptionItemBadge.asg-key-group-badge-unavailable,.dark .groupOptionItemBadge.asg-key-group-badge-error{color:#f87171!important;background:rgba(239,68,68,.12)!important}
    .dark .groupOptionItemBadge.asg-key-group-badge-disabled{color:#98a2b3!important;background:rgba(152,162,179,.12)!important}
  `;

  function addStyle(css, id) {
    if (id && document.getElementById(id)) return;
    let added = null;
    if (typeof GM_addStyle === 'function') added = GM_addStyle(css);
    else {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      added = style;
    }
    if (id) {
      if (added && typeof added.setAttribute === 'function') added.setAttribute('id', id);
      else {
        const marker = document.createElement('meta');
        marker.id = id;
        marker.dataset.asgStyleMarker = 'true';
        document.head.appendChild(marker);
      }
    }
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
  }

  function formatLatency(value) {
    return Number.isFinite(value) ? `${Math.round(value)} ms` : '-';
  }

  class Controller {
    constructor(options = {}) {
      this.config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
      this.selectedKeyId = storageGet('selectedKeyId', null);
      this.lastSwitch = storageGet('lastSwitch', { at: null, keyId: null, groupId: null });
      this.stability = createStabilityState();
      this.rows = [];
      this.ranked = [];
      this.keys = [];
      this.loading = false;
      this.lastUpdated = null;
      this.error = '';
      this.authError = '';
      this.balance = null;
      this.balanceError = '';
      this.keyCount = null;
      this.minimized = storageGet('minimized', false) === true;
      this.sideTab = normalizePanelTab(storageGet('sideTab', 'settings'));
      this.timer = null;
      this.uiTimer = null;
      this.panel = null;
      this.toggleButton = null;
      this.active = false;
      this.monitorGeneratedAt = null;
      this.monitorFreshness = getMonitorFreshness(null, Date.now(), this.config.maxMonitorAgeSeconds);
      this.candidateDiagnostics = analyzeCandidates([], this.config);
      this.lastKeysFetchedAt = 0;
      this.lastRefreshCompletedAt = 0;
      this.keySelectSignature = '';
      this.lastDetectionLogSignature = null;
      this.lastMonitorStaleLogState = null;
      this.lastSeriesFallbackLogState = null;
      this.lastAuthLogSignature = '';
      this.lastErrorLogSignature = '';
      this.lastAutoSkipLogSignature = '';
      this.onAuthInvalid = typeof options.onAuthInvalid === 'function' ? options.onAuthInvalid : null;
    }

    start(registerMenu = true) {
      this.active = true;
      const existing = document.getElementById(ROOT_ID);
      if (existing?.dataset.version === SCRIPT_VERSION) return;
      existing?.remove();
      document.getElementById(TOGGLE_ID)?.remove();
      addStyle(STYLE, 'aihub-smart-group-panel-style');
      this.renderShell();
      this.bindEvents();
      if (registerMenu && typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('显示 AIHub 智能分组', () => this.setMinimized(false));
      if (!this.minimized || this.config.autoSwitch) this.refresh();
      else this.syncPollingTimer();
      this.uiTimer = window.setInterval(() => {
        if (isPageVisible() && !this.minimized) this.renderTimeSensitiveState();
      }, 1000);
    }

    syncPollingTimer() {
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = null;
      if (!this.active || (this.minimized && !this.config.autoSwitch)) return;
      const intervalMs = this.config.pollIntervalSeconds * 1000;
      const elapsed = this.lastRefreshCompletedAt > 0 ? Date.now() - this.lastRefreshCompletedAt : intervalMs;
      const delay = this.loading
        ? 1000
        : (isPageVisible() ? Math.max(250, intervalMs - Math.max(0, elapsed)) : intervalMs);
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (this.shouldAutoRefresh()) this.refresh();
        else this.syncPollingTimer();
      }, delay);
    }

    shouldAutoRefresh(now = Date.now()) {
      return shouldRunControllerRefresh({
        active: this.active,
        visible: isPageVisible(),
        minimized: this.minimized,
        autoSwitch: this.config.autoSwitch,
        loading: this.loading,
        now,
        lastCompletedAt: this.lastRefreshCompletedAt,
        intervalMs: this.config.pollIntervalSeconds * 1000,
      });
    }

    handleVisibilityChange() {
      if (!this.active || !isPageVisible()) return;
      if (!this.minimized) this.renderTimeSensitiveState();
      if (this.shouldAutoRefresh()) this.refresh();
      else this.syncPollingTimer();
    }

    stop() {
      this.active = false;
      if (this.timer) window.clearTimeout(this.timer);
      if (this.uiTimer) window.clearInterval(this.uiTimer);
      this.timer = null;
      this.uiTimer = null;
      this.panel?.remove();
      this.toggleButton?.remove();
      this.panel = null;
      this.toggleButton = null;
    }

    renderShell() {
      const panel = document.createElement('section');
      panel.id = ROOT_ID;
      panel.dataset.version = SCRIPT_VERSION;
      panel.innerHTML = `
        <div class="asg-head"><strong>AIHub 智能分组 v${SCRIPT_VERSION}</strong><button class="asg-icon" data-action="minimize" title="最小化">−</button></div>
        <div class="asg-body">
          <div class="asg-main-column">
            <div class="asg-status-row"><div class="asg-status" data-field="status">准备检测</div><div class="asg-balance" data-field="balance">余额读取中...</div></div>
            <label for="asg-mode-select">模式</label>
            <select id="asg-mode-select" data-field="mode"><option value="price">价格（最低价格）</option><option value="balance">平衡（倍率上限内延迟最快）</option><option value="speed">速度（TTFT 最快）</option></select>
            <div class="asg-recommend" data-field="recommend"><div class="asg-muted">正在读取监控数据...</div></div>
            <label for="asg-key-select">目标密钥</label>
            <select id="asg-key-select" data-field="key"></select>
            <div class="asg-key-details" data-field="key-details" hidden>
              <div class="asg-key-detail"><span>密钥名</span><strong data-key-detail="name"></strong></div>
              <div class="asg-key-detail"><span>当前分组</span><strong data-key-detail="group"></strong></div>
              <div class="asg-key-detail"><span>倍率</span><strong class="asg-key-metric" data-key-detail="multiplier"></strong></div>
              <div class="asg-key-detail"><span data-key-detail-label="latency">最新首 Token</span><strong class="asg-key-metric" data-key-detail="latency"></strong></div>
              <div class="asg-key-detail"><span>模型检测</span><strong data-key-detail="detection"></strong></div>
              <div class="asg-key-detail" data-key-detail-row="model-price"><span data-key-detail-label="model-price">Sol 价格 / 1M</span><strong class="asg-key-metric" data-key-detail="model-price"></strong></div>
              <div class="asg-key-detail"><span>真实价格 / 预测倍率</span><strong class="asg-key-metric" data-key-detail="effective-price"></strong></div>
              <div class="asg-key-detail"><span>输出速度</span><strong class="asg-key-metric" data-key-detail="output-tps"></strong></div>
              <div class="asg-key-detail"><span>缓存命中率</span><strong class="asg-key-metric" data-key-detail="cache"></strong></div>
            </div>
            <div class="asg-actions"><button data-action="refresh">检测</button><button data-action="switch" disabled>切换到推荐分组</button></div>
            <label class="asg-auto"><input type="checkbox" data-field="auto"> 自动切换（默认关闭）</label>
            <details class="asg-guide"><summary>快速开始</summary><ol><li>选择价格、平衡或速度模式。</li><li>选择目标密钥并点击“检测”。</li><li>确认推荐分组后点击切换；自动切换可在设置中开启。</li></ol></details>
            <ul class="asg-list" data-field="list"></ul>
          </div>
          <aside class="asg-side-column" aria-label="设置与日志">
            <div class="asg-side-tabs" role="tablist" aria-label="面板工具">
              <button type="button" class="asg-side-tab" role="tab" id="asg-settings-tab" aria-controls="asg-settings-view" aria-selected="true" data-panel-tab="settings">设置</button>
              <button type="button" class="asg-side-tab" role="tab" id="asg-logs-tab" aria-controls="asg-logs-view" aria-selected="false" data-panel-tab="logs">日志</button>
            </div>
            <section class="asg-side-view" id="asg-settings-view" role="tabpanel" aria-labelledby="asg-settings-tab" data-panel-view="settings">
              <div class="asg-settings-body">
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">可靠性筛选</div><label class="asg-settings-inline-label" for="asg-availability-mode-setting">可用性判断方式</label></div>
                <div class="asg-settings-grid">
                  <select id="asg-availability-mode-setting" data-setting="availabilityMode"><option value="percent">按可用率（百分比）</option><option value="successes">按成功监控点数</option><option value="consecutive">按连续成功点数</option></select>
                  <label class="asg-setting-compact asg-auto"><input type="checkbox" data-setting="requireNoWarnings"> 排除监控警告</label>
                  <label class="asg-setting-wide" data-availability-setting="percent" title="可自行修改，0.1 表示 10%">最近10分钟最低可用率（默认10%）<input type="number" min="0" max="1" step="0.01" data-setting="minSuccess10m"></label>
                  <label class="asg-setting-wide" data-availability-setting="successes">最近10分钟至少成功监控点数<input type="number" min="1" max="60" step="1" data-setting="minSuccessPoints10m"></label>
                  <label class="asg-setting-wide" data-availability-setting="consecutive">连续成功监控点数<input type="number" min="1" max="60" step="1" data-setting="minConsecutiveSuccesses10m"></label>
                  <label class="asg-setting-wide" title="名称包含任一关键词的分组不会参与推荐或切换">排除分组关键词（使用 | 分隔）<input type="text" data-setting="excludedGroupKeywords" placeholder="例如 free|unstable"></label>
                  <span class="asg-setting-preview asg-setting-wide" data-field="excluded-preview" aria-live="polite"></span>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">TTFT 采集</div><label class="asg-settings-inline-label" for="asg-latency-source-setting">推荐、密钥详情和分组下拉使用的延迟指标</label></div>
                <div class="asg-settings-grid">
                  <label class="asg-setting-wide">采集指标<select id="asg-latency-source-setting" data-setting="latencySource"><option value="probe">主动探测首 Token</option><option value="user">运行时 P50 TTFT（无样本时回退探测）</option></select></label>
                  <label class="asg-setting-wide" data-latency-setting="user" title="运行时 P50 样本不足时改用主动探测，避免少量真实请求影响推荐">运行时 P50 最低有效样本数<input type="number" min="1" max="1000000" step="1" data-setting="minUserTtftSamples"></label>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">价格模式</div><label class="asg-settings-inline-label" for="asg-recommendation-price-basis-setting">仅改变价格模式的推荐依据</label></div>
                <div class="asg-settings-grid">
                  <label class="asg-setting-wide">价格依据<select id="asg-recommendation-price-basis-setting" data-setting="recommendationPriceBasis"><option value="nominal">标称倍率（默认）</option><option value="effectiveInput1h">1 小时真实输入价</option><option value="effectiveMultiplier1h">1 小时预测倍率</option></select></label>
                  <span class="asg-setting-preview asg-setting-wide" data-field="recommendation-price-preview" aria-live="polite"></span>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">模型价格</div><label class="asg-settings-inline-label" for="asg-model-price-setting">显示 AIHub 后端分组价格</label></div>
                <div class="asg-settings-grid">
                  <label class="asg-setting-wide">价格模型<select id="asg-model-price-setting" data-setting="modelPriceModel"><option value="sol">Sol</option><option value="terra">Terra</option><option value="luna">Luna</option><option value="none">不显示</option></select></label>
                  <span class="asg-setting-preview asg-setting-wide">价格单位为美元 / 每 1M Token，仅用于展示，不改变推荐、排序或自动切换目标。</span>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">用量费用核验</div><label class="asg-settings-inline-label" for="asg-usage-audit-display-setting">按历史分组倍率复算按量费用</label></div>
                <div class="asg-settings-grid">
                  <label class="asg-setting-compact asg-auto"><input type="checkbox" data-setting="usageCostAuditEnabled"> 开启费用核验</label>
                  <label>显示结果<select id="asg-usage-audit-display-setting" data-setting="usageCostAuditDisplay"><option value="anomalies">仅显示异常</option><option value="all">显示全部</option></select></label>
                  <label class="asg-setting-wide">相对容差（%）<input type="number" min="0.1" max="100" step="0.1" data-setting="usageCostAuditTolerancePercent"></label>
                  <span class="asg-setting-preview asg-setting-wide">仅核验“按量”记录；按页面历史倍率严格匹配分组，并保留 $0.000005 的压缩 Token 绝对误差。</span>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">供应商大厅</div><label class="asg-settings-inline-label" for="asg-provider-sort-setting">打开页面后自动选择排序</label></div>
                <div class="asg-settings-grid">
                  <label class="asg-setting-wide">自动排序<select id="asg-provider-sort-setting" data-setting="providerSortPreference"><option value="rate">倍率优先（从低到高）</option><option value="realPrice">真实价格优先</option><option value="user">用户速度排序</option><option value="cacheHit">缓存命中优先</option><option value="successRate">成功率优先</option><option value="custom">自定义排序</option><option value="default">默认排序</option></select></label>
                  <label class="asg-setting-compact asg-auto"><input type="checkbox" data-setting="providerAutoRefresh"> 定时自动刷新</label>
                  <label>刷新间隔（秒）<input type="number" min="15" max="3600" step="1" data-setting="providerRefreshIntervalSeconds"></label>
                  <span class="asg-setting-preview asg-setting-wide">排序保存后立即应用；自动刷新会点击页面原生“刷新”按钮，不会整页重载。</span>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-title">检测与切换</div>
                <div class="asg-settings-grid">
                  <label>连续通过次数<input type="number" min="1" max="5" step="1" data-setting="consecutiveChecks"></label>
                  <label>检测间隔（秒）<input type="number" min="10" max="3600" step="1" data-setting="pollIntervalSeconds"></label>
                  <label class="asg-setting-wide">切换冷却（分钟）<input type="number" min="0" max="1440" step="0.1" data-setting="cooldownMinutes"><span class="asg-setting-preview" data-field="cooldown-preview" aria-live="polite"></span></label>
                </div>
              </section>
              <section class="asg-settings-section">
                <div class="asg-settings-head"><div class="asg-settings-title">平衡策略</div><label class="asg-settings-inline-label" for="asg-balance-max-setting">允许切换的最高倍率</label></div>
                <div class="asg-settings-grid">
                  <label class="asg-balance-setting"><input id="asg-balance-max-setting" type="number" min="0" max="1000" step="0.001" data-setting="balanceMaxPrice" aria-label="允许切换的最高倍率"><span class="asg-balance-preview" data-field="balance-preview" aria-live="polite"></span></label>
                </div>
              </section>
              <button class="asg-save" data-action="save-settings">保存设置</button>
              </div>
            </section>
            <section class="asg-side-view" id="asg-logs-view" role="tabpanel" aria-labelledby="asg-logs-tab" data-panel-view="logs" hidden>
              <div class="asg-log-actions"><button data-action="clear-logs">清空日志</button></div>
              <ul class="asg-logs" data-field="logs"></ul>
            </section>
          </aside>
        </div>`;
      document.body.appendChild(panel);
      this.panel = panel;
      const toggle = document.createElement('button');
      toggle.id = TOGGLE_ID;
      toggle.type = 'button';
      toggle.textContent = 'AI';
      toggle.title = '打开 AIHub 智能分组';
      toggle.setAttribute('aria-label', '打开 AIHub 智能分组');
      document.body.appendChild(toggle);
      this.toggleButton = toggle;
      this.setSideTab(this.sideTab);
      this.syncSettingsInputs();
      this.setMinimized(this.minimized);
    }

    bindEvents() {
      this.panel.addEventListener('click', (event) => {
        const panelTab = event.target.closest('[data-panel-tab]')?.dataset.panelTab;
        if (panelTab) this.setSideTab(panelTab);
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'minimize') this.setMinimized(true);
        if (action === 'refresh') this.refresh(true);
        if (action === 'switch') this.switchToRecommendation(false);
        if (action === 'save-settings') this.saveSettings();
        if (action === 'clear-logs') this.clearLogs();
      });
      this.panel.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const tabs = [...this.panel.querySelectorAll('[data-panel-tab]')];
        const currentIndex = tabs.indexOf(document.activeElement);
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
        this.setSideTab(nextTab.dataset.panelTab);
        nextTab.focus();
      });
      this.toggleButton.addEventListener('click', () => this.setMinimized(false));
      this.panel.querySelector('[data-field="key"]').addEventListener('change', (event) => {
        this.selectedKeyId = event.target.value || null;
        storageSet('selectedKeyId', this.selectedKeyId);
        this.renderSelectedKeyDetails();
        this.renderActionState();
      });
      this.panel.querySelector('[data-field="mode"]').addEventListener('change', (event) => {
        const previousStrategy = getRecommendationStrategySignature(this.config);
        this.config.mode = normalizeGroupMode(event.target.value);
        if (getRecommendationStrategySignature(this.config) !== previousStrategy) this.stability = createStabilityState();
        storageSet('config', this.config);
        this.log('info', `模式改为${GROUP_MODE_LABELS[this.config.mode]}`);
        this.refresh();
      });
      this.panel.querySelector('[data-field="auto"]').addEventListener('change', (event) => {
        if (event.target.checked && !window.confirm('自动切换会在检测通过后修改选中 API 密钥的分组，是否启用？')) {
          event.target.checked = false;
          return;
        }
        this.config.autoSwitch = event.target.checked;
        storageSet('config', this.config);
        this.log('info', event.target.checked ? '已开启自动切换' : '已关闭自动切换');
        this.syncPollingTimer();
        this.refresh();
      });
      this.panel.addEventListener('input', (event) => {
        if (event.target.matches('[data-setting]') && event.target.dataset.setting !== 'availabilityMode') {
          this.renderSettingsPreviews(event.target.dataset.setting);
        }
      });
      this.panel.addEventListener('change', (event) => {
        if (event.target.matches('[data-setting="availabilityMode"]')) {
          this.syncAvailabilityInputs();
          this.renderSettingsPreviews('availabilityMode');
        }
        if (event.target.matches('[data-setting="latencySource"]')) {
          this.syncLatencyInputs();
          this.renderSettingsPreviews('latencySource');
        }
      });
    }

    setMinimized(value) {
      const wasMinimized = this.minimized;
      this.minimized = value === true;
      if (this.panel) this.panel.hidden = this.minimized;
      if (this.toggleButton) this.toggleButton.hidden = !this.minimized;
      storageSet('minimized', this.minimized);
      if (wasMinimized === this.minimized) return;
      if (wasMinimized && !this.minimized) {
        this.renderTimeSensitiveState();
        if (this.shouldAutoRefresh()) this.refresh();
        else this.syncPollingTimer();
      } else {
        this.syncPollingTimer();
      }
    }

    setSideTab(value) {
      this.sideTab = normalizePanelTab(value);
      storageSet('sideTab', this.sideTab);
      for (const tab of this.panel?.querySelectorAll('[data-panel-tab]') || []) {
        const selected = tab.dataset.panelTab === this.sideTab;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
      for (const view of this.panel?.querySelectorAll('[data-panel-view]') || []) {
        view.hidden = view.dataset.panelView !== this.sideTab;
      }
    }

    syncSettingsInputs() {
      for (const input of this.panel.querySelectorAll('[data-setting]')) {
        const key = input.dataset.setting;
        if (input.type === 'checkbox') input.checked = this.config[key] === true;
        else input.value = this.config[key];
      }
      this.panel.querySelector('[data-field="auto"]').checked = this.config.autoSwitch;
      this.panel.querySelector('[data-field="mode"]').value = this.config.mode;
      this.syncAvailabilityInputs();
      this.syncLatencyInputs();
      this.renderSettingsPreviews();
    }

    syncAvailabilityInputs() {
      const mode = normalizeAvailabilityMode(this.panel?.querySelector('[data-setting="availabilityMode"]')?.value);
      for (const field of this.panel?.querySelectorAll('[data-availability-setting]') || []) {
        field.hidden = field.dataset.availabilitySetting !== mode;
      }
    }

    syncLatencyInputs() {
      const source = normalizeLatencySource(this.panel?.querySelector('[data-setting="latencySource"]')?.value);
      for (const field of this.panel?.querySelectorAll('[data-latency-setting]') || []) {
        field.hidden = field.dataset.latencySetting !== source;
      }
    }

    readDraftConfig() {
      const draft = { ...this.config };
      for (const input of this.panel?.querySelectorAll('[data-setting]') || []) {
        draft[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
      }
      return normalizeConfig(draft);
    }

    renderSettingsPreviews(changedKey) {
      const targets = getSettingsPreviewTargets(changedKey);
      const normalizedDraft = targets.recommendation || targets.balance ? this.readDraftConfig() : null;
      if (targets.recommendation) this.renderRecommendationPricePreview(normalizedDraft);
      if (targets.balance) this.renderBalancePreview(normalizedDraft);
      if (targets.excluded) this.renderExcludedPreview();
      if (targets.cooldown) this.renderCooldownPreview();
    }

    renderRecommendationPricePreview(normalizedDraft = this.readDraftConfig()) {
      const preview = this.panel?.querySelector('[data-field="recommendation-price-preview"]');
      if (!preview) return;
      const basis = normalizedDraft.recommendationPriceBasis;
      const label = RECOMMENDATION_PRICE_BASIS_LABELS[basis];
      const unsaved = getRecommendationPricePreviewSignature(normalizedDraft)
        !== getRecommendationPricePreviewSignature(this.config);
      const suffix = unsaved ? ' · 未保存' : '';
      if (basis === 'nominal') {
        preview.textContent = `价格模式按${label}排序；平衡上限和费用核验也继续使用标称倍率${suffix}`;
      } else if (!this.lastUpdated) {
        preview.textContent = `价格模式将按${label}排序；无有效数据的分组不会回退标称倍率${suffix}`;
      } else {
        const analysis = analyzeCandidates(this.rows, { ...normalizedDraft, mode: 'price' });
        const unavailable = analysis.counts.priceMetricUnavailable;
        const reasonText = formatRecommendationPriceUnavailableReasons(analysis.counts.priceMetricUnavailableReasons);
        preview.textContent = `${label}可用 ${analysis.candidates.length} 个 · 数据不可用排除 ${unavailable} 个${reasonText ? `（${reasonText}）` : ''} · 不回退标称倍率${suffix}`;
      }
      preview.classList.toggle('asg-preview-pending', unsaved);
    }

    renderBalancePreview(normalizedDraft = this.readDraftConfig()) {
      const preview = this.panel?.querySelector('[data-field="balance-preview"]');
      const maxPriceInput = this.panel?.querySelector('[data-setting="balanceMaxPrice"]');
      if (!preview || !maxPriceInput) return;
      const rawMaxPrice = maxPriceInput.value.trim();
      if (rawMaxPrice === '' || !maxPriceInput.checkValidity()) {
        preview.textContent = '请输入 0–1000 之间的倍率';
        preview.classList.add('asg-preview-pending');
        return;
      }
      const candidateCount = getEligibleCandidates(this.rows, { ...normalizedDraft, mode: 'balance' })
        .filter((candidate) => candidate.price <= normalizedDraft.balanceMaxPrice).length;
      const hasUnsavedFilter = normalizedDraft.balanceMaxPrice !== this.config.balanceMaxPrice
        || normalizedDraft.minSuccess10m !== this.config.minSuccess10m
        || normalizedDraft.availabilityMode !== this.config.availabilityMode
        || normalizedDraft.minSuccessPoints10m !== this.config.minSuccessPoints10m
        || normalizedDraft.minConsecutiveSuccesses10m !== this.config.minConsecutiveSuccesses10m
        || normalizedDraft.requireNoWarnings !== this.config.requireNoWarnings
        || normalizedDraft.excludedGroupKeywords !== this.config.excludedGroupKeywords
        || normalizedDraft.latencySource !== this.config.latencySource
        || (normalizedDraft.latencySource === 'user'
          && normalizedDraft.minUserTtftSamples !== this.config.minUserTtftSamples);
      const suffix = hasUnsavedFilter ? ' · 未保存' : '';
      const limit = formatMultiplier(normalizedDraft.balanceMaxPrice);
      if (!this.lastUpdated) {
        preview.textContent = `最高倍率 ${limit} · 检测后显示符合分组${suffix}`;
      } else if (candidateCount === 0) {
        preview.textContent = `最高倍率 ${limit} · 当前没有符合条件的分组${suffix}`;
      } else {
        preview.textContent = `只考虑倍率 ≤ ${limit} · ${candidateCount} 个分组可选 · 将选${LATENCY_SOURCE_LABELS[normalizedDraft.latencySource]} 最快${suffix}`;
      }
      preview.classList.toggle('asg-preview-pending', hasUnsavedFilter);
    }

    renderExcludedPreview() {
      const preview = this.panel?.querySelector('[data-field="excluded-preview"]');
      const input = this.panel?.querySelector('[data-setting="excludedGroupKeywords"]');
      if (!preview || !input) return;
      const info = getExcludedGroupInfo(this.rows, input.value);
      const normalized = info.keywords.join('|');
      const unsaved = normalized !== this.config.excludedGroupKeywords;
      const suffix = unsaved ? ' · 未保存' : '';
      if (!info.keywords.length) {
        preview.textContent = `未设置排除关键词${suffix}`;
      } else if (!this.lastUpdated) {
        preview.textContent = `${info.keywords.length} 个关键词 · 检测后显示匹配分组${suffix}`;
      } else if (!info.matches.length) {
        preview.textContent = `未匹配到分组${suffix}`;
      } else {
        const names = info.matches.slice(0, 3).map((match) => match.name).join('、');
        const more = info.matches.length > 3 ? ` 等 ${info.matches.length} 个` : '';
        preview.textContent = `将排除 ${info.matches.length} 个：${names}${more}${suffix}`;
      }
      preview.classList.toggle('asg-preview-pending', unsaved);
    }

    renderCooldownPreview() {
      const preview = this.panel?.querySelector('[data-field="cooldown-preview"]');
      const input = this.panel?.querySelector('[data-setting="cooldownMinutes"]');
      if (!preview || !input) return;
      if (input.value.trim() === '' || !input.checkValidity()) {
        preview.textContent = '请输入 0–1440 之间的分钟数';
        preview.classList.add('asg-preview-pending');
        return;
      }
      const minutes = normalizeConfig({ ...this.config, cooldownMinutes: input.value }).cooldownMinutes;
      const unsaved = minutes !== this.config.cooldownMinutes;
      const cooldown = getCooldownInfo(Number(this.lastSwitch.at), minutes);
      preview.textContent = `${minutes} 分钟 = ${formatRemainingTime(minutes * 60 * 1000)}${cooldown.active ? ` · 当前${cooldown.label}` : ''}${unsaved ? ' · 未保存' : ''}`;
      preview.classList.toggle('asg-preview-pending', unsaved);
    }

    saveSettings() {
      const previousStrategy = getRecommendationStrategySignature(this.config);
      const next = {};
      for (const input of this.panel.querySelectorAll('[data-setting]')) {
        next[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
      }
      next.autoSwitch = this.config.autoSwitch;
      next.mode = this.config.mode;
      this.config = normalizeConfig(next);
      if (getRecommendationStrategySignature(this.config) !== previousStrategy) {
        this.stability = createStabilityState();
        this.lastAutoSkipLogSignature = '';
      }
      storageSet('config', this.config);
      window.dispatchEvent(new window.CustomEvent(CONFIG_CHANGE_EVENT));
      this.syncSettingsInputs();
      this.syncPollingTimer();
      this.setStatus('设置已保存');
      this.log('info', '设置已保存');
      this.refresh(true);
    }

    log(level, message) {
      writeRuntimeLog('aihub', level, message);
      this.renderLogs();
    }

    clearLogs() {
      storageSet('runtime-logs', storageGet('runtime-logs', []).filter((entry) => entry?.scope !== 'aihub'));
      this.renderLogs();
    }

    renderLogs() {
      const list = this.panel?.querySelector('[data-field="logs"]');
      if (!list) return;
      list.replaceChildren();
      const logs = readScopeLogs('aihub');
      if (!logs.length) {
        const empty = document.createElement('li');
        empty.className = 'asg-muted';
        empty.textContent = '暂无日志';
        list.appendChild(empty);
        return;
      }
      for (const entry of logs) {
        const item = document.createElement('li');
        item.className = `asg-log-${entry.level}`;
        item.textContent = formatLogLine(entry);
        list.appendChild(item);
      }
    }

    async refresh(forceLog = false) {
      if (this.loading) return;
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = null;
      this.loading = true;
      this.authError = '';
      this.setStatus('检测中...');
      this.renderActionState();
      try {
        const [summary, seriesResult, balanceResult] = await Promise.all([
          fetchMonitorSummary({ force: forceLog }),
          fetchMonitorSeries({ force: forceLog })
            .then((value) => ({ value }))
            .catch((error) => ({ error })),
          fetchCurrentBalance().then((payload) => ({ payload })).catch((error) => ({ error })),
        ]);
        if (!this.active) return;
        const fallbackSeries = buildMonitorSeriesFromSummary(summary);
        const series = seriesResult.value
          ? mergeMonitorSeries(seriesResult.value, fallbackSeries)
          : fallbackSeries;
        const usingSeriesFallback = Boolean(seriesResult.error);
        if (usingSeriesFallback && this.lastSeriesFallbackLogState !== true) {
          const hasFallbackData = hasMonitorSeriesData(fallbackSeries);
          this.log(hasFallbackData ? 'info' : 'error', hasFallbackData
            ? '监控序列接口暂不可用，已使用供应商概览历史继续检测'
            : '监控序列接口暂不可用，供应商概览也没有可用于推荐的历史点');
        } else if (!usingSeriesFallback && this.lastSeriesFallbackLogState === true) {
          this.log('info', '监控序列接口已恢复');
        }
        this.lastSeriesFallbackLogState = usingSeriesFallback;
        if (balanceResult.error) {
          this.balanceError = balanceResult.error instanceof Error ? balanceResult.error.message : '余额读取失败';
        } else {
          this.balance = getBalanceAmount(balanceResult.payload);
          this.balanceError = this.balance === null ? '余额数据格式异常' : '';
        }
        let keys = null;
        if (shouldRefreshKeys({ now: Date.now(), lastFetchedAt: this.lastKeysFetchedAt, keyCount: this.keys.length, force: forceLog })) {
          try {
            keys = await fetchAllKeys();
            if (!this.active) return;
            this.lastKeysFetchedAt = Date.now();
          } catch (error) {
            if (!this.active) return;
            if (error?.status === 401 && this.onAuthInvalid) {
              this.onAuthInvalid();
              if (!this.active) return;
            }
            this.authError = error?.status === 401
              ? (getAuthToken() ? '密钥接口返回 401：当前登录已失效，请重新登录后刷新' : '未找到页面登录令牌，请在此 Chrome 配置中重新登录后刷新')
              : (error instanceof Error ? `密钥读取失败：${error.message}` : '密钥读取失败');
          }
        }
        if (this.authError && shouldLogTransition(this.lastAuthLogSignature, this.authError, forceLog)) {
          this.log('error', this.authError);
        } else if (!this.authError && this.lastAuthLogSignature) {
          this.log('info', '密钥读取已恢复');
        }
        this.lastAuthLogSignature = this.authError;
        this.rows = attachRecentAvailability(summary?.apis, series);
        this.monitorGeneratedAt = getMonitorSeriesWindowAnchor(series) ?? summary?.generatedAt ?? null;
        this.updateMonitorFreshness();
        this.recordMonitorFreshnessState();
        this.candidateDiagnostics = analyzeCandidates(this.rows, this.config);
        this.ranked = rankCandidates(this.rows, this.config, this.candidateDiagnostics);
        const winner = this.ranked[0] || null;
        const strategySignature = getRecommendationStrategySignature(this.config);
        this.stability = this.monitorFreshness.stale
          ? createStabilityState()
          : advanceStability(this.stability, winner?.groupId ?? null, this.config.consecutiveChecks, strategySignature);
        if (keys) {
          this.keys = keys;
          this.keyCount = keys.length;
          if (!this.keys.some((key) => String(key.id) === String(this.selectedKeyId))) {
            this.selectedKeyId = this.keys.length === 1 ? this.keys[0].id : null;
            storageSet('selectedKeyId', this.selectedKeyId);
          }
        }
        this.lastUpdated = new Date();
        this.error = '';
        this.renderData();
        const detectionSignature = `${strategySignature}:${winner?.groupId ?? 'none'}`;
        if (shouldLogTransition(this.lastDetectionLogSignature, detectionSignature, forceLog)) {
          this.log('info', `检测完成，推荐${winner?.name || '暂无分组'}`);
        }
        this.lastDetectionLogSignature = detectionSignature;
        if (this.lastErrorLogSignature) this.log('info', '监控检测已恢复');
        this.lastErrorLogSignature = '';
        if (this.config.autoSwitch) await this.switchToRecommendation(true);
      } catch (error) {
        if (!this.active) return;
        this.error = error instanceof Error ? error.message : '检测失败';
        if (shouldLogTransition(this.lastErrorLogSignature, this.error, forceLog)) this.log('error', this.error);
        this.lastErrorLogSignature = this.error;
        this.setStatus(this.error, true);
        this.renderActionState();
      } finally {
        this.loading = false;
        this.lastRefreshCompletedAt = Date.now();
        if (this.active) {
          this.renderActionState();
          this.syncPollingTimer();
        }
      }
    }

    updateMonitorFreshness() {
      this.monitorFreshness = getMonitorFreshness(this.monitorGeneratedAt, Date.now(), this.config.maxMonitorAgeSeconds);
      return this.monitorFreshness;
    }

    renderTimeSensitiveState() {
      if (!this.active || !this.panel) return;
      const wasStale = this.monitorFreshness.stale;
      this.updateMonitorFreshness();
      if (!wasStale && this.monitorFreshness.stale) this.stability = createStabilityState();
      this.recordMonitorFreshnessState();
      this.panel.querySelector('[data-field="recommend"]')?.classList.toggle('asg-recommend-stale', this.monitorFreshness.stale);
      const node = this.panel.querySelector('[data-field="monitor-freshness"]');
      if (node) {
        node.textContent = this.monitorFreshness.stale
          ? `监控数据已过期（${this.monitorFreshness.label}），切换已暂停`
          : `数据更新于 ${this.monitorFreshness.label}`;
        node.classList.toggle('asg-stale', this.monitorFreshness.stale);
      }
      this.renderCooldownPreview();
      this.renderActionState();
    }

    recordMonitorFreshnessState() {
      if (!this.monitorGeneratedAt || this.lastMonitorStaleLogState === this.monitorFreshness.stale) return;
      if (this.monitorFreshness.stale) {
        this.log('error', `监控数据已超过 10 分钟未更新（${this.monitorFreshness.label}），已暂停切换`);
      } else if (this.lastMonitorStaleLogState === true) {
        this.log('info', '监控数据已恢复，切换保护解除');
      }
      this.lastMonitorStaleLogState = this.monitorFreshness.stale;
    }

    selectedKey() {
      return this.keys.find((key) => String(key.id) === String(this.selectedKeyId)) || null;
    }

    async switchToRecommendation(fromAuto) {
      const reportBlock = (reason) => {
        if (fromAuto) {
          if (shouldLogTransition(this.lastAutoSkipLogSignature, reason)) this.log('info', `自动切换跳过：${reason}`);
          this.lastAutoSkipLogSignature = reason;
        } else {
          this.setStatus(reason, Boolean(this.error || this.authError));
        }
        return false;
      };
      const cachedWinner = this.ranked[0] || null;
      const key = this.selectedKey();
      const initialBlockReason = getSwitchBlockReason({
        loading: this.loading,
        allowWhileLoading: fromAuto,
        error: this.error,
        authError: this.authError,
        monitorStale: this.monitorFreshness.stale,
        monitorFreshnessText: this.monitorFreshness.label,
        winner: cachedWinner,
        key,
        stability: this.stability,
        requiredChecks: this.config.consecutiveChecks,
        config: this.config,
      });
      if (initialBlockReason) return reportBlock(initialBlockReason);

      const validation = reanalyzeRecommendationForSwitch(
        this.rows,
        this.config,
        this.stability,
        cachedWinner.groupId,
      );
      this.candidateDiagnostics = validation.analysis;
      this.ranked = validation.ranked;
      if (validation.reason) {
        this.stability = createStabilityState();
        this.renderData();
        return reportBlock(validation.reason);
      }
      const winner = validation.winner;
      const finalBlockReason = getSwitchBlockReason({
        loading: this.loading,
        allowWhileLoading: fromAuto,
        error: this.error,
        authError: this.authError,
        monitorStale: this.monitorFreshness.stale,
        monitorFreshnessText: this.monitorFreshness.label,
        winner,
        key,
        stability: this.stability,
        requiredChecks: this.config.consecutiveChecks,
        config: this.config,
      });
      if (finalBlockReason) return reportBlock(finalBlockReason);
      const now = Date.now();
      if (fromAuto && !canAutoSwitch({
        now,
        lastSwitchAt: Number(this.lastSwitch.at),
        currentGroupId: key.groupId,
        targetGroupId: winner.groupId,
        stable: this.stability.stable,
        config: this.config,
        monitorStale: this.monitorFreshness.stale,
        monitorFreshnessText: this.monitorFreshness.label,
      })) {
        const reason = getAutoSwitchBlockReason({
          now,
          lastSwitchAt: Number(this.lastSwitch.at),
          currentGroupId: key.groupId,
          targetGroupId: winner.groupId,
          stable: this.stability.stable,
          config: this.config,
          monitorStale: this.monitorFreshness.stale,
          monitorFreshnessText: this.monitorFreshness.label,
        });
        if (shouldLogTransition(this.lastAutoSkipLogSignature, reason)) this.log('info', `自动切换跳过：${reason}`);
        this.lastAutoSkipLogSignature = reason;
        return false;
      }
      if (!fromAuto && !window.confirm(`将密钥“${key.name}”切换到 ${winner.name}（${formatRecommendationPriceCriterion(winner)}），是否继续？`)) return false;
      try {
        await updateKeyGroup(key.id, winner.groupId);
        if (!this.active) return false;
        key.groupId = winner.groupId;
        key.groupName = winner.name;
        this.lastKeysFetchedAt = 0;
        this.lastSwitch = { at: Date.now(), keyId: key.id, groupId: winner.groupId };
        this.lastAutoSkipLogSignature = '';
        storageSet('lastSwitch', this.lastSwitch);
        this.setStatus(`已切换到 ${winner.name}`);
        this.log('info', `已切换到${winner.name}`);
        this.renderData();
        return true;
      } catch (error) {
        if (!this.active) return false;
        this.setStatus(error instanceof Error ? error.message : '切换失败', true);
        this.log('error', error instanceof Error ? error.message : '切换失败');
        return false;
      }
    }

    setStatus(text, error = false) {
      const node = this.panel?.querySelector('[data-field="status"]');
      if (node) {
        node.textContent = text;
        node.classList.toggle('asg-error', error);
      }
    }

    renderData() {
      const winner = this.ranked[0];
      const recommend = this.panel.querySelector('[data-field="recommend"]');
      recommend.classList.toggle('asg-recommend-stale', this.monitorFreshness.stale);
      recommend.replaceChildren();
      if (!winner) {
        const empty = document.createElement('div');
        empty.className = 'asg-muted';
        if (this.config.mode === 'balance') {
          empty.textContent = '没有符合当前可靠性和倍率上限的分组';
        } else if (this.config.mode === 'price'
          && this.config.recommendationPriceBasis !== 'nominal'
          && this.candidateDiagnostics?.counts?.priceMetricUnavailable > 0) {
          empty.textContent = `没有具备可用${RECOMMENDATION_PRICE_BASIS_LABELS[this.config.recommendationPriceBasis]}且满足可靠性条件的分组`;
        } else {
          empty.textContent = '没有符合当前可靠性条件的分组';
        }
        recommend.appendChild(empty);
      } else {
        const title = document.createElement('strong');
        title.textContent = `${GROUP_MODE_LABELS[this.config.mode]}模式 · ${winner.name} · ${formatRecommendationPriceCriterion(winner)}`;
        const metrics = document.createElement('div');
        metrics.className = 'asg-metrics';
        const availabilityText = this.config.availabilityMode === 'successes'
          ? `成功 ${winner.recentSuccessCount || 0}/${winner.recentSampleCount || 0} 点`
          : this.config.availabilityMode === 'consecutive'
            ? `连续成功 ${winner.recentConsecutiveSuccessCount || 0} 点`
            : `可用率 ${formatPercent(winner.success10m)}`;
        const detectionText = formatModelDetectionSummary(winner);
        const detectionTitle = formatModelDetectionTitle(winner);
        const healthText = formatModelHealthSummary(winner.modelHealth ?? winner.model_health);
        const modelPriceText = formatModelPriceSummary(winner, this.config.modelPriceModel);
        const effectivePriceText = formatEffectivePricingSummary(winner);
        const outputTpsText = formatOutputThroughput(winner);
        const cacheText = normalizeCacheHitRate(winner.cacheHitRate ?? winner.cache_hit_rate) === null
          ? ''
          : ` · ${formatCacheHitRate(winner.cacheHitRate ?? winner.cache_hit_rate)}`;
        metrics.textContent = `10m ${availabilityText} · ${winner.recentSampleCount}次探测 · ${formatLatencyMetric(winner, this.config.latencySource, this.config.minUserTtftSamples)}${detectionText ? ` · 模型${detectionText}` : ''}${healthText ? ` · ${healthText}` : ''}${modelPriceText ? ` · ${modelPriceText}` : ''}${effectivePriceText ? ` · ${effectivePriceText}` : ''}${outputTpsText ? ` · ${outputTpsText}` : ''}${cacheText}${this.stability.stable ? ' · 已稳定' : ` · ${this.stability.count}/${this.config.consecutiveChecks} 次`}`;
        if (detectionTitle) metrics.title = detectionTitle;
        recommend.append(title, metrics);
        if (this.config.mode === 'balance') {
          const reason = document.createElement('div');
          reason.className = 'asg-balance-reason';
          reason.textContent = `倍率上限 ${formatMultiplier(this.config.balanceMaxPrice)} · 范围内${LATENCY_SOURCE_LABELS[this.config.latencySource]} 最快`;
          recommend.appendChild(reason);
        }
      }
      const diagnostics = this.candidateDiagnostics?.counts || {};
      const diagnostic = document.createElement('div');
      diagnostic.className = 'asg-recommend-meta';
      const overLimit = this.config.mode === 'balance' ? Math.max(0, Number(diagnostics.eligible || 0) - this.ranked.length) : 0;
      const detectionWarnings = Number(diagnostics.modelDetectionWarnings) || 0;
      const priceUnavailable = Number(diagnostics.priceMetricUnavailable) || 0;
      const priceUnavailableReasons = formatRecommendationPriceUnavailableReasons(diagnostics.priceMetricUnavailableReasons);
      const userLatencySampleFallbacks = this.config.latencySource === 'user'
        ? Number(diagnostics.userLatencySampleFallbacks) || 0
        : 0;
      diagnostic.textContent = `参与比较 ${this.ranked.length} · 排除关键词 ${diagnostics.keywords || 0} · 不可用 ${diagnostics.unavailable || 0} · 可用率不足 ${diagnostics.lowSuccess || 0} · 监控警告 ${diagnostics.warnings || 0}${detectionWarnings ? `（模型检测异常 ${detectionWarnings}）` : ''}${userLatencySampleFallbacks ? ` · 运行时样本不足回退 ${userLatencySampleFallbacks}` : ''}${priceUnavailable ? ` · 价格数据不可用 ${priceUnavailable}${priceUnavailableReasons ? `（${priceUnavailableReasons}）` : ''}` : ''}${overLimit ? ` · 超过倍率上限 ${overLimit}` : ''}`;
      recommend.appendChild(diagnostic);
      const freshness = document.createElement('div');
      freshness.className = `asg-monitor-age${this.monitorFreshness.stale ? ' asg-stale' : ''}`;
      freshness.dataset.field = 'monitor-freshness';
      freshness.textContent = this.monitorFreshness.stale
        ? `监控数据已过期（${this.monitorFreshness.label}），切换已暂停`
        : `数据更新于 ${this.monitorFreshness.label}`;
      recommend.appendChild(freshness);
      this.renderBalance();
      const keyInfo = this.authError || (this.keyCount !== null ? `已读取 ${this.keyCount} 个密钥` : '');
      this.setStatus(this.error || keyInfo || (this.lastUpdated ? `最近检测：${this.lastUpdated.toLocaleTimeString()}` : '准备检测'), Boolean(this.error || this.authError));
      this.renderKeys();
      this.renderCandidates();
      this.renderLogs();
      this.renderActionState();
      this.renderSettingsPreviews();
    }

    renderBalance() {
      const node = this.panel?.querySelector('[data-field="balance"]');
      if (!node) return;
      node.classList.toggle('asg-balance-error', Boolean(this.balanceError));
      node.textContent = this.balanceError ? '余额暂不可用' : `余额 ${formatBalance(this.balance)}`;
      node.title = this.balanceError ? this.balanceError : '每次检测刷新当前余额';
    }

    renderKeys() {
      const select = this.panel.querySelector('[data-field="key"]');
      const metricMap = buildGroupMetricMap(this.rows, this.config);
      const placeholderText = this.keys.length
        ? '选择要切换的密钥'
        : (this.authError || (this.keyCount !== null ? `接口返回 ${this.keyCount} 个密钥` : '未读取到密钥'));
      const optionRows = this.keys.map((key) => ({
        value: String(key.id),
        text: formatKeyOptionLabel(key, metricMap.get(key.groupId), this.config.latencySource),
      }));
      const signature = JSON.stringify([placeholderText, String(this.selectedKeyId ?? ''), optionRows]);
      if (signature !== this.keySelectSignature) {
        const fragment = document.createDocumentFragment();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        fragment.appendChild(placeholder);
        for (const row of optionRows) {
          const option = document.createElement('option');
          option.value = row.value;
          option.textContent = row.text;
          option.selected = row.value === String(this.selectedKeyId);
          fragment.appendChild(option);
        }
        select.replaceChildren(fragment);
        this.keySelectSignature = signature;
      }
      select.disabled = this.keys.length === 0;
      this.renderSelectedKeyDetails(metricMap);
    }

    renderSelectedKeyDetails(metricMap = buildGroupMetricMap(this.rows, this.config)) {
      const details = this.panel?.querySelector('[data-field="key-details"]');
      if (!details) return;
      const key = this.selectedKey();
      details.hidden = !key;
      if (!key) return;
      const metric = metricMap.get(key.groupId);
      const multiplier = nonNegativeNumberOrNull(metric?.multiplier);
      const latencyMs = nonNegativeNumberOrNull(metric?.latencyMs);
      const detection = metric?.modelDetection ?? (metric?.detectionStatus ? { status: metric.detectionStatus } : null);
      const detectionText = detection ? formatModelDetectionSummary(detection) : '暂无数据';
      const detectionTitle = detection ? formatModelDetectionTitle(detection) : '';
      const latencySampleCount = this.config.latencySource === 'user' && metric?.latencyMetricSource !== 'probe'
        ? nonNegativeNumberOrNull(metric?.latencySampleCount)
        : null;
      const latencySampleText = latencySampleCount !== null && latencySampleCount > 0 ? `（${Math.floor(latencySampleCount)} 条）` : '';
      const modelPriceText = formatModelPriceSummary(metric?.modelPrices, this.config.modelPriceModel, true);
      const effectivePriceText = formatEffectivePricingSummary(metric?.effectivePricing, true, true);
      const outputTpsText = formatOutputThroughput(metric, true);
      const cacheHitRate = normalizeCacheHitRate(metric?.cacheHitRate);
      const latencyLabel = details.querySelector('[data-key-detail-label="latency"]');
      const modelPriceRow = details.querySelector('[data-key-detail-row="model-price"]');
      const modelPriceLabel = details.querySelector('[data-key-detail-label="model-price"]');
      if (latencyLabel) latencyLabel.textContent = this.config.latencySource === 'user'
        ? getLatencyMetricLabel('user', metric)
        : '最新首 Token';
      if (modelPriceRow) modelPriceRow.hidden = this.config.modelPriceModel === 'none';
      if (modelPriceLabel) modelPriceLabel.textContent = `${MODEL_PRICE_MODEL_LABELS[this.config.modelPriceModel]} 价格 / 1M`;
      details.querySelector('[data-key-detail="name"]').textContent = key.name;
      details.querySelector('[data-key-detail="group"]').textContent = key.groupName;
      details.querySelector('[data-key-detail="multiplier"]').textContent = multiplier === null ? '暂无数据' : formatMultiplier(multiplier);
      const userLatencyFallbackText = this.config.latencySource === 'user' ? getUserTtftFallbackText(metric) : '';
      details.querySelector('[data-key-detail="latency"]').textContent = latencyMs === null
        ? `暂无数据${userLatencyFallbackText ? `（${userLatencyFallbackText}）` : ''}`
        : `${formatLatency(latencyMs)}${latencySampleText}`;
      const detectionNode = details.querySelector('[data-key-detail="detection"]');
      detectionNode.textContent = detectionText;
      detectionNode.title = detectionTitle;
      details.querySelector('[data-key-detail="model-price"]').textContent = modelPriceText || '暂无数据';
      details.querySelector('[data-key-detail="effective-price"]').textContent = effectivePriceText || '暂无数据';
      details.querySelector('[data-key-detail="output-tps"]').textContent = outputTpsText || '暂无数据';
      details.querySelector('[data-key-detail="cache"]').textContent = cacheHitRate === null ? '暂无数据' : `${(cacheHitRate * 100).toFixed(1)}%`;
    }

    renderCandidates() {
      const list = this.panel.querySelector('[data-field="list"]');
      list.replaceChildren();
      for (const candidate of this.ranked.slice(0, 5)) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = candidate.name;
        const metrics = document.createElement('span');
        const detectionText = formatModelDetectionSummary(candidate);
        const detectionTitle = formatModelDetectionTitle(candidate);
        const cacheHitRate = normalizeCacheHitRate(candidate.cacheHitRate ?? candidate.cache_hit_rate);
        const healthText = formatModelHealthSummary(candidate.modelHealth ?? candidate.model_health);
        const modelPriceText = formatModelPriceSummary(candidate, this.config.modelPriceModel, true);
        const effectivePriceText = formatEffectivePricingSummary(candidate, true);
        const outputTpsText = formatOutputThroughput(candidate, true);
        metrics.textContent = `${formatRecommendationPriceCriterion(candidate)} · ${formatLatencyMetric(candidate, this.config.latencySource, this.config.minUserTtftSamples)} · 10m ${formatPercent(candidate.success10m)}${detectionText ? ` · ${detectionText}` : ''}${healthText ? ` · ${healthText}` : ''}${modelPriceText ? ` · ${modelPriceText}` : ''}${effectivePriceText ? ` · ${effectivePriceText}` : ''}${outputTpsText ? ` · ${outputTpsText}` : ''}${cacheHitRate === null ? '' : ` · 缓存 ${(cacheHitRate * 100).toFixed(1)}%`}`;
        if (detectionTitle) metrics.title = detectionTitle;
        item.append(name, metrics);
        list.appendChild(item);
      }
    }

    renderActionState() {
      const button = this.panel.querySelector('[data-action="switch"]');
      const winner = this.ranked[0];
      const key = this.selectedKey();
      const reason = getSwitchBlockReason({
        loading: this.loading,
        error: this.error,
        authError: this.authError,
        monitorStale: this.monitorFreshness.stale,
        monitorFreshnessText: this.monitorFreshness.label,
        winner,
        key,
        stability: this.stability,
        requiredChecks: this.config.consecutiveChecks,
        config: this.config,
      });
      button.disabled = Boolean(reason);
      button.title = reason || `切换到 ${winner.name}`;
    }
  }

  class KeyGroupDropdownEnhancer {
    constructor() {
      this.monitorIndex = buildGroupDropdownMonitorIndex([]);
      this.observer = null;
      this.menuObservers = new Map();
      this.renderTimer = null;
      this.refreshTimer = null;
      this.renderQueued = false;
      this.loading = false;
      this.active = false;
      this.hasMonitorData = false;
      this.loadFailed = false;
      this.lastAttemptAt = 0;
      this.lastErrorSignature = '';
      const config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
      this.latencySource = config.latencySource;
      this.minUserTtftSamples = config.minUserTtftSamples;
    }

    start() {
      this.active = true;
      addStyle(KEY_GROUP_STYLE, 'aihub-smart-group-key-style');
      this.observer = new MutationObserver((records) => {
        if (this.mutationsNeedMenuScan(records)) this.queueRender();
      });
      // New AIHub group pickers are portaled directly under <body>, outside <main>.
      this.observer.observe(document.body, { childList: true, subtree: true });
      this.queueRender();
      this.refreshTimer = window.setInterval(() => {
        if (isPageVisible() && this.findMenus().length && Date.now() - this.lastAttemptAt >= 60_000) this.refresh();
      }, 60_000);
    }

    stop() {
      this.active = false;
      this.observer?.disconnect();
      this.observer?.takeRecords?.();
      this.observer = null;
      this.observedRoot = null;
      for (const observer of this.menuObservers.values()) observer.disconnect();
      this.menuObservers.clear();
      if (this.renderTimer) window.clearTimeout(this.renderTimer);
      if (this.refreshTimer) window.clearInterval(this.refreshTimer);
      this.renderTimer = null;
      this.refreshTimer = null;
      document.querySelectorAll('.asg-key-group-status,.asg-key-group-latency').forEach((node) => node.remove());
      document.querySelectorAll('.asg-key-group-option').forEach((button) => {
        button.classList.remove('asg-key-group-option');
        const badge = button.querySelector('.groupOptionItemBadge');
        if (badge?.dataset.asgToneClass) {
          badge.classList.remove(badge.dataset.asgToneClass);
          delete badge.dataset.asgToneClass;
        }
        button.querySelector('.asg-key-group-row')?.classList.remove('asg-key-group-row');
        button.querySelector('.asg-key-group-main')?.classList.remove('asg-key-group-main');
        button.querySelector('.asg-key-group-rate-shell')?.classList.remove('asg-key-group-rate-shell');
        button.querySelector('.asg-key-group-rate')?.classList.remove('asg-key-group-rate');
      });
    }

    mutationsNeedMenuScan(records) {
      return [...(records || [])].some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1
        && (node.matches?.('input[placeholder="搜索分组..."]') || node.querySelector?.('input[placeholder="搜索分组..."]'))));
    }

    findMenus() {
      return [...document.querySelectorAll('input[placeholder="搜索分组..."]')]
        .map((input) => {
          const portal = input.closest?.('[role="listbox"]');
          if (portal) {
            const optionList = portal.querySelector('.select-options') || portal;
            return optionList && portal.contains(optionList) ? { menu: portal, optionList } : null;
          }
          const searchArea = input.parentElement?.parentElement;
          const menu = searchArea?.parentElement;
          const optionList = searchArea?.nextElementSibling;
          return menu && optionList && menu.contains(optionList) ? { menu, optionList } : null;
        })
        .filter(Boolean);
    }

    syncMenuObservers(menus) {
      const optionLists = new Set(menus.map(({ optionList }) => optionList));
      for (const [optionList, observer] of this.menuObservers) {
        if (optionLists.has(optionList) && optionList.isConnected) continue;
        observer.disconnect();
        this.menuObservers.delete(optionList);
      }
      for (const optionList of optionLists) {
        if (this.menuObservers.has(optionList)) continue;
        const observer = new MutationObserver((records) => {
          if (this.menuMutationsNeedRender(records)) this.queueRender();
        });
        observer.observe(optionList, { childList: true, subtree: true });
        this.menuObservers.set(optionList, observer);
      }
    }

    menuMutationsNeedRender(records) {
      return [...(records || [])].some((record) => {
        const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
        if (target?.closest?.('.asg-key-group-status,.asg-key-group-latency')) return false;
        return [...record.addedNodes, ...record.removedNodes].some((node) => {
          if (node.nodeType !== 1) return false;
          if (node.matches?.('.asg-key-group-status,.asg-key-group-latency')
            || node.querySelector?.('.asg-key-group-status,.asg-key-group-latency')) return false;
          return Boolean(target?.closest?.('button,[role="option"]')
            || node.matches?.('button,[role="option"]')
            || node.querySelector?.('button,[role="option"]'));
        });
      });
    }

    handleVisibilityChange() {
      if (!this.active || !isPageVisible()) return;
      if (this.findMenus().length && Date.now() - this.lastAttemptAt >= 60_000) this.refresh();
      else this.queueRender();
    }

    queueRender() {
      if (!this.active || this.renderQueued) return;
      this.renderQueued = true;
      this.renderTimer = window.setTimeout(() => {
        this.renderTimer = null;
        this.renderQueued = false;
        this.render();
      }, ENHANCER_RENDER_DEBOUNCE_MS);
    }

    async refresh() {
      if (!this.active || !isPageVisible() || this.loading || Date.now() - this.lastAttemptAt < 60_000) return;
      this.loading = true;
      this.loadFailed = false;
      this.lastAttemptAt = Date.now();
      this.render();
      try {
        const summary = await fetchMonitorSummary();
        if (!this.active) return;
        this.latencySource = normalizeConfig(storageGet('config', DEFAULT_CONFIG)).latencySource;
        this.monitorIndex = buildGroupDropdownMonitorIndex(summary?.apis);
        this.hasMonitorData = true;
        if (this.lastErrorSignature) writeRuntimeLog('aihub', 'info', '密钥分组监控读取已恢复');
        this.lastErrorSignature = '';
      } catch (error) {
        if (!this.active) return;
        this.loadFailed = !this.hasMonitorData;
        const message = error instanceof Error ? error.message : '未知错误';
        if (message !== this.lastErrorSignature) writeRuntimeLog('aihub', 'error', `密钥分组监控读取失败：${message}`);
        this.lastErrorSignature = message;
      } finally {
        this.loading = false;
        if (this.active) this.render();
      }
    }

    render() {
      if (!this.active) return;
      const config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
      this.latencySource = config.latencySource;
      this.minUserTtftSamples = config.minUserTtftSamples;
      const menus = this.findMenus();
      this.syncMenuObservers(menus);
      if (!menus.length) return;
      if (!this.hasMonitorData && !this.loading && Date.now() - this.lastAttemptAt >= 60_000) this.refresh();
      for (const { optionList } of menus) {
        for (const option of optionList.querySelectorAll('button,[role="option"]')) this.renderOption(option);
      }
    }

    renderOption(button) {
      const badge = button.querySelector('.groupOptionItemBadge');
      const nameNode = badge?.querySelector('.truncate');
      const content = button.firstElementChild;
      const leftColumn = badge?.parentElement;
      const rightShell = content?.lastElementChild;
      const rightColumn = rightShell?.firstElementChild || rightShell;
      const multiplierNode = rightColumn?.querySelector('span');
      const name = nameNode?.textContent?.trim();
      if (!name || !leftColumn || !rightColumn || !multiplierNode) return;

      button.classList.add('asg-key-group-option');
      content.classList.add('asg-key-group-row');
      leftColumn.classList.add('asg-key-group-main');
      rightShell?.classList.add('asg-key-group-rate-shell');
      rightColumn.classList.add('asg-key-group-rate');

      let info;
      if (this.loadFailed) {
        info = { ...formatGroupDropdownMonitor(null, this.latencySource), statusText: '监控读取失败', statusTone: 'error' };
      } else if (!this.hasMonitorData) {
        const latencyLabel = this.latencySource === 'user' ? '运行时 P50 TTFT' : '首 Token';
        info = { statusText: '监控读取中', statusTone: 'unknown', latencyText: `${latencyLabel} --`, latencyValueText: '' };
      } else {
        const multiplier = parseGroupOptionMultiplier(multiplierNode.textContent);
        info = formatGroupDropdownMonitor(
          findGroupDropdownMonitor(this.monitorIndex, name, multiplier),
          this.latencySource,
          this.minUserTtftSamples,
        );
      }

      const badgeToneClass = getGroupDropdownToneClass(info.statusTone);
      const currentBadgeToneClass = badge.dataset.asgToneClass || '';
      if (currentBadgeToneClass !== badgeToneClass) {
        if (badge.dataset.asgToneClass) badge.classList.remove(badge.dataset.asgToneClass);
        if (badgeToneClass) {
          badge.classList.add(badgeToneClass);
          badge.dataset.asgToneClass = badgeToneClass;
        } else {
          delete badge.dataset.asgToneClass;
        }
      }

      let status = leftColumn.querySelector('.asg-key-group-status');
      if (!status) {
        status = document.createElement('span');
        leftColumn.appendChild(status);
      }
      const statusClass = `asg-key-group-status asg-key-group-status-${info.statusTone}`;
      if (status.className !== statusClass) status.className = statusClass;
      if (status.textContent !== info.statusText) status.textContent = info.statusText;
      const statusTitle = info.detectionTitle || '';
      if (status.title !== statusTitle) status.title = statusTitle;

      let latency = rightColumn.querySelector('.asg-key-group-latency');
      if (!latency) {
        latency = document.createElement('span');
        rightColumn.appendChild(latency);
      }
      if (latency.className !== 'asg-key-group-latency') latency.className = 'asg-key-group-latency';
      const latencyRenderKey = `${info.latencyText}|${info.latencyValueText}`;
      if (latency.dataset.renderKey !== latencyRenderKey) {
        if (info.latencyValueText) {
          const value = document.createElement('strong');
          value.className = 'asg-key-group-latency-value';
          value.textContent = info.latencyValueText;
          const latencyLabel = info.latencyText.slice(0, Math.max(0, info.latencyText.length - info.latencyValueText.length)).trim();
          latency.replaceChildren(document.createTextNode(latencyLabel), value);
        } else {
          latency.textContent = info.latencyText;
        }
        latency.dataset.renderKey = latencyRenderKey;
      }
    }
  }

  class UsageMultiplierEnhancer {
    constructor() {
      this.multiplierByGroup = new Map();
      this.modelPriceIndex = buildUsageModelPriceIndex([]);
      this.usageItemsById = new Map();
      this.usageAuditCache = new Map();
      this.pendingUsageLoads = new Map();
      this.usageViewKey = '';
      this.usageRequestPath = '';
      this.loadedUsageViewKey = '';
      this.pendingUsageViewKey = '';
      this.failedUsageViewKey = '';
      this.lastUsageFailureAt = 0;
      this.usageRetryTimer = null;
      this.summaryByTable = new Map();
      this.observer = null;
      this.observedRoot = null;
      this.renderQueued = false;
      this.active = false;
      this.refreshTimer = null;
      this.renderTimer = null;
      this.loading = false;
      this.lastRefreshCompletedAt = 0;
      this.hasMonitorData = false;
      this.loadFailed = false;
      this.usageDataAvailable = false;
      this.usageLoadFailed = false;
      this.config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
      this.onConfigChanged = () => {
        this.config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
        this.queueRender();
      };
    }

    start() {
      if (this.active) return;
      this.active = true;
      addStyle(USAGE_STYLE, 'aihub-smart-group-usage-style');
      window.addEventListener(CONFIG_CHANGE_EVENT, this.onConfigChanged);
      this.observer = new MutationObserver((records) => {
        const currentRoot = this.observedRoot;
        const currentRecords = currentRoot
          ? [...records].filter((record) => record.target === currentRoot || currentRoot.contains(record.target))
          : [];
        if (this.mutationsNeedRender(currentRecords)) this.queueRender();
      });
      this.syncObserverRoot();
      this.refresh(true);
      this.refreshTimer = window.setInterval(() => {
        if (isPageVisible() && isRefreshDue(Date.now(), this.lastRefreshCompletedAt, USAGE_REFRESH_INTERVAL_MS)) this.refresh();
      }, USAGE_REFRESH_INTERVAL_MS);
    }

    stop() {
      this.active = false;
      this.observer?.disconnect();
      this.observer?.takeRecords?.();
      this.observer = null;
      this.observedRoot = null;
      if (this.refreshTimer) window.clearInterval(this.refreshTimer);
      if (this.renderTimer) window.clearTimeout(this.renderTimer);
      if (this.usageRetryTimer !== null) window.clearTimeout(this.usageRetryTimer);
      this.refreshTimer = null;
      this.renderTimer = null;
      this.usageRetryTimer = null;
      window.removeEventListener(CONFIG_CHANGE_EVENT, this.onConfigChanged);
      document.querySelectorAll('.asg-usage-multiplier,.asg-usage-cost-audit,.asg-usage-cost-summary').forEach((node) => node.remove());
      this.summaryByTable.clear();
      this.usageItemsById.clear();
      this.usageAuditCache.clear();
      this.pendingUsageLoads.clear();
      this.usageViewKey = '';
      this.usageRequestPath = '';
      this.loadedUsageViewKey = '';
      this.pendingUsageViewKey = '';
      this.failedUsageViewKey = '';
      this.lastUsageFailureAt = 0;
      this.usageDataAvailable = false;
      this.usageLoadFailed = false;
    }

    syncObserverRoot() {
      if (!this.active || !this.observer) return false;
      const nextRoot = document.querySelector('main') || document.body;
      if (!nextRoot) return false;
      if (nextRoot === this.observedRoot && nextRoot.isConnected) return false;
      this.observer.disconnect();
      this.observer.takeRecords?.();
      this.observedRoot = null;
      this.observer.observe(nextRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-row-id'],
      });
      this.observedRoot = nextRoot;
      this.queueRender();
      return true;
    }

    mutationsNeedRender(records) {
      return [...(records || [])].some((record) => {
        const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
        if (target?.closest?.('.asg-usage-multiplier,.asg-usage-cost-audit,.asg-usage-cost-summary')) return false;
        if (record.type === 'attributes' && target?.matches?.('tr[data-row-id]')) return true;
        if (target?.closest?.('thead') || target?.matches?.('tbody')) return true;
        return [...(record.addedNodes || []), ...(record.removedNodes || [])].some((node) => node.nodeType === 1
          && (node.matches?.('table,thead,tbody,tr') || node.querySelector?.('table,thead,tbody,tr')));
      });
    }

    async refresh(force = false) {
      if (!this.active || !isPageVisible() || this.loading) return;
      if (!force && !isRefreshDue(Date.now(), this.lastRefreshCompletedAt, USAGE_REFRESH_INTERVAL_MS)) return;
      this.loading = true;
      try {
        const [monitorResult] = await Promise.allSettled([fetchMonitorSummary()]);
        if (!this.active) return;
        if (monitorResult.status === 'fulfilled') {
          this.multiplierByGroup = buildGroupMultiplierMap(monitorResult.value?.apis);
          this.modelPriceIndex = buildUsageModelPriceIndex(monitorResult.value?.apis);
          this.hasMonitorData = true;
          this.loadFailed = false;
        } else {
          this.loadFailed = !this.hasMonitorData;
        }
        this.render();
      } finally {
        this.loading = false;
        this.lastRefreshCompletedAt = Date.now();
      }
    }

    handleVisibilityChange() {
      if (!this.active || !isPageVisible()) return;
      if (isRefreshDue(Date.now(), this.lastRefreshCompletedAt, USAGE_REFRESH_INTERVAL_MS)) this.refresh();
      else this.queueRender();
    }

    queueRender() {
      if (!this.active || this.renderQueued) return;
      this.renderQueued = true;
      this.renderTimer = window.setTimeout(() => {
        this.renderTimer = null;
        this.renderQueued = false;
        this.render();
      }, ENHANCER_RENDER_DEBOUNCE_MS);
    }

    render() {
      if (!this.active) return;
      this.config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
      const tables = [...document.querySelectorAll('table')];
      for (const table of tables) this.renderMultipliers(table);
      const detailTables = tables.filter((table) => this.isUsageDetailTable(table));
      this.syncUsageAuditView(detailTables);
      const activeTables = new Set(detailTables);
      for (const [table, summary] of this.summaryByTable) {
        if (table.isConnected && activeTables.has(table)) continue;
        summary.remove();
        this.summaryByTable.delete(table);
      }
      for (const table of detailTables) this.renderCostAudit(table);
    }

    getUsageAuditView(detailTables) {
      const path = getCurrentUsageRequestPath();
      const rowIds = [...new Set([...(detailTables || [])]
        .flatMap((table) => [...table.querySelectorAll('tbody tr[data-row-id]')])
        .map((row) => String(row.dataset.rowId || '').trim())
        .filter(Boolean))]
        .sort();
      return {
        path: String(path || '').trim(),
        rowIds,
        key: buildUsageAuditViewKey(path, rowIds),
      };
    }

    syncUsageQueryPath() {
      if (!this.active) return false;
      const path = String(getCurrentUsageRequestPath() || '').trim();
      if (!path || path === this.usageRequestPath) return false;
      this.queueRender();
      return true;
    }

    clearUsageAuditRetry() {
      const timerWindow = typeof window !== 'undefined' ? window : globalThis;
      if (this.usageRetryTimer !== null) timerWindow.clearTimeout(this.usageRetryTimer);
      this.usageRetryTimer = null;
    }

    scheduleUsageAuditRetry(key) {
      this.clearUsageAuditRetry();
      const timerWindow = typeof window !== 'undefined' ? window : globalThis;
      const retry = () => {
        this.usageRetryTimer = null;
        if (!this.active || this.usageViewKey !== key || this.failedUsageViewKey !== key) return;
        const remaining = USAGE_AUDIT_RETRY_MS - (Date.now() - this.lastUsageFailureAt);
        if (remaining > 0) {
          this.usageRetryTimer = timerWindow.setTimeout(retry, remaining);
          return;
        }
        this.queueRender();
      };
      this.usageRetryTimer = timerWindow.setTimeout(retry, USAGE_AUDIT_RETRY_MS);
    }

    markUsageAuditFailure(key) {
      if (!this.active || this.usageViewKey !== key) return false;
      this.failedUsageViewKey = key;
      this.lastUsageFailureAt = Date.now();
      this.usageLoadFailed = true;
      this.scheduleUsageAuditRetry(key);
      return true;
    }

    isUsageAuditViewCurrent(view) {
      if (!view?.key || this.usageViewKey !== view.key) return false;
      if (typeof document === 'undefined') return true;
      const tables = [...document.querySelectorAll('table')];
      const detailTables = tables.filter((table) => this.isUsageDetailTable(table));
      return this.getUsageAuditView(detailTables).key === view.key;
    }

    syncUsageAuditView(detailTables) {
      const view = this.getUsageAuditView(detailTables);
      if (!view.key) {
        this.clearUsageAuditRetry();
        this.usageViewKey = '';
        this.usageRequestPath = view.path;
        this.loadedUsageViewKey = '';
        this.pendingUsageViewKey = '';
        this.usageItemsById.clear();
        this.usageDataAvailable = false;
        return false;
      }

      if (view.key !== this.usageViewKey) {
        this.clearUsageAuditRetry();
        if (this.failedUsageViewKey !== view.key) {
          this.failedUsageViewKey = '';
          this.lastUsageFailureAt = 0;
        }
        this.usageViewKey = view.key;
        this.usageRequestPath = view.path;
        this.loadedUsageViewKey = '';
        this.usageItemsById.clear();
        this.usageDataAvailable = false;
        this.usageLoadFailed = false;
      }

      if (this.loadedUsageViewKey === view.key) return false;

      const cached = this.usageAuditCache.get(view.key);
      if (cached) {
        this.usageAuditCache.delete(view.key);
        this.usageAuditCache.set(view.key, cached);
        this.applyUsageAuditItems(view.key, cached);
        return false;
      }

      const pendingKey = this.pendingUsageLoads.has(view.key) ? view.key : '';
      if (!shouldLoadUsageAuditView({
        key: view.key,
        loadedKey: this.loadedUsageViewKey,
        pendingKey,
        failedKey: this.failedUsageViewKey,
        lastAttemptAt: this.lastUsageFailureAt,
      })) return false;

      this.loadUsageAuditView(view);
      return true;
    }

    applyUsageAuditItems(key, itemsById) {
      if (!key || key !== this.usageViewKey) return false;
      this.usageItemsById = new Map(itemsById || []);
      this.loadedUsageViewKey = key;
      this.usageDataAvailable = true;
      this.usageLoadFailed = false;
      if (this.failedUsageViewKey === key) {
        this.failedUsageViewKey = '';
        this.lastUsageFailureAt = 0;
        this.clearUsageAuditRetry();
      }
      return true;
    }

    cacheUsageAuditItems(key, items) {
      const itemsById = items instanceof Map
        ? new Map(items)
        : new Map([...(items || [])].map((item) => [String(item?.id ?? '').trim(), item]).filter(([id]) => id));
      this.usageAuditCache.delete(key);
      this.usageAuditCache.set(key, itemsById);
      while (this.usageAuditCache.size > USAGE_AUDIT_CACHE_LIMIT) {
        this.usageAuditCache.delete(this.usageAuditCache.keys().next().value);
      }
      return itemsById;
    }

    loadUsageAuditView(view) {
      this.clearUsageAuditRetry();
      this.pendingUsageViewKey = view.key;
      const load = (async () => {
        try {
          const items = await fetchCurrentUsageAuditItems({ path: view.path });
          if (!this.active || !Array.isArray(items)) return;
          const rowIds = new Set(view.rowIds);
          const viewIsCurrent = this.isUsageAuditViewCurrent(view);
          if (rowIds.size && !items.some((item) => rowIds.has(String(item?.id ?? '').trim()))) {
            if (viewIsCurrent) this.markUsageAuditFailure(view.key);
            return;
          }
          const itemsById = this.cacheUsageAuditItems(view.key, items);
          if (viewIsCurrent) this.applyUsageAuditItems(view.key, itemsById);
        } catch {
          this.markUsageAuditFailure(view.key);
        } finally {
          this.pendingUsageLoads.delete(view.key);
          if (this.pendingUsageViewKey === view.key) this.pendingUsageViewKey = '';
          if (this.active && this.usageViewKey === view.key) this.queueRender();
        }
      })();
      this.pendingUsageLoads.set(view.key, load);
      return load;
    }

    getHeaderLabels(table) {
      return [...table.querySelectorAll('thead th')].map((header) => header.textContent.trim());
    }

    isUsageDetailTable(table) {
      return hasUsageDetailColumns(this.getHeaderLabels(table));
    }

    getGroupName(cell) {
      if (!cell) return '';
      const nativeMultiplier = cell.querySelector('[data-testid="usage-group-rate-multiplier"]');
      const candidate = [...cell.querySelectorAll('span')].find((node) => {
        if (node === nativeMultiplier || node.contains(nativeMultiplier)) return false;
        if (node.closest('.asg-usage-multiplier,.asg-usage-cost-audit')) return false;
        return Boolean(node.textContent.trim());
      });
      if (candidate) return normalizeGroupName(candidate.textContent);
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('.asg-usage-multiplier,.asg-usage-cost-audit,[data-testid="usage-group-rate-multiplier"]').forEach((node) => node.remove());
      return normalizeGroupName(clone.textContent);
    }

    renderMultipliers(table) {
      if (!this.multiplierByGroup.size) return;
      const headers = [...table.querySelectorAll('thead th')];
      const groupColumnIndex = headers.findIndex((header) => header.textContent.trim() === '分组');
      if (groupColumnIndex < 0) return;
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td');
        const cell = cells[groupColumnIndex];
        if (!cell) continue;
        const existing = cell.querySelector('.asg-usage-multiplier');
        if (cell.querySelector('[data-testid="usage-group-rate-multiplier"]')) {
          existing?.remove();
          continue;
        }
        const name = this.getGroupName(cell);
        const multiplier = this.multiplierByGroup.get(name);
        if (multiplier == null) {
          existing?.remove();
          continue;
        }
        const text = formatMultiplier(multiplier);
        if (existing) {
          existing.dataset.groupName = name;
          if (existing.textContent !== text) existing.textContent = text;
        } else {
          const badge = document.createElement('span');
          badge.className = 'asg-usage-multiplier';
          badge.dataset.groupName = name;
          badge.textContent = text;
          cell.appendChild(badge);
        }
      }
    }

    getCostAuditRecord(row, indexes) {
      const cells = row.querySelectorAll('td');
      const groupCell = cells[indexes.group];
      const tokenCell = cells[indexes.tokens];
      const costCell = cells[indexes.cost];
      if (!groupCell || !tokenCell || !costCell) return null;
      const modelCell = cells[indexes.model];
      const billingCell = cells[indexes.billing];
      const modelNode = modelCell?.querySelector('span.font-medium');
      const tokenValues = [...tokenCell.querySelectorAll('span.font-medium')]
        .filter((node) => !node.closest('.asg-usage-cost-audit'))
        .map((node) => node.textContent.trim());
      const nativeCostNode = costCell.querySelector('span.font-medium.text-green-600')
        || [...costCell.querySelectorAll('span')].find((node) => !node.closest('.asg-usage-cost-audit') && parseUsageCost(node.textContent) !== null);
      return {
        costCell,
        record: {
          groupName: this.getGroupName(groupCell),
          groupMultiplier: groupCell.querySelector('[data-testid="usage-group-rate-multiplier"]')?.textContent || '',
          model: modelNode?.textContent?.trim() || modelCell?.textContent?.trim() || '',
          billingMode: billingCell?.textContent?.trim() || '',
          tokenValues,
          actualCost: nativeCostNode?.textContent?.trim() || '',
        },
      };
    }

    getUsageApiAuditRecord(row) {
      const item = this.usageItemsById.get(String(row?.dataset?.rowId || '').trim());
      return item ? buildUsageAuditRecordFromApiItem(item) : null;
    }

    ensureCostSummary(table) {
      let summary = this.summaryByTable.get(table);
      if (summary?.isConnected) return summary;
      summary = document.createElement('div');
      summary.className = 'asg-usage-cost-summary';
      summary.setAttribute('role', 'status');
      summary.setAttribute('aria-live', 'polite');
      table.parentElement?.insertBefore(summary, table);
      this.summaryByTable.set(table, summary);
      return summary;
    }

    renderCostAudit(table) {
      const summary = this.ensureCostSummary(table);
      const rows = [...table.querySelectorAll('tbody tr')];
      if (!this.config.usageCostAuditEnabled) {
        rows.forEach((row) => row.querySelector('.asg-usage-cost-audit')?.remove());
        summary.textContent = '费用校验：已关闭';
        summary.classList.remove('asg-usage-cost-summary-warning');
        return;
      }
      if (!this.hasMonitorData) {
        rows.forEach((row) => row.querySelector('.asg-usage-cost-audit')?.remove());
        summary.textContent = this.loadFailed ? '费用校验：模型价格读取失败' : '费用校验：正在读取模型价格…';
        summary.classList.toggle('asg-usage-cost-summary-warning', this.loadFailed);
        return;
      }
      const headers = this.getHeaderLabels(table);
      const indexes = {
        model: headers.indexOf('模型'),
        group: headers.indexOf('分组'),
        billing: headers.indexOf('计费模式'),
        tokens: headers.indexOf('Token'),
        cost: headers.indexOf('费用'),
      };
      const counts = { ok: 0, anomaly: 0, skipped: 0 };
      let estimatedFromPage = 0;
      for (const row of rows) {
        const extracted = this.getCostAuditRecord(row, indexes);
        if (!extracted) {
          counts.skipped += 1;
          continue;
        }
        const apiRecord = this.getUsageApiAuditRecord(row);
        const result = auditUsageCostRecord(apiRecord || extracted.record, this.modelPriceIndex, this.config);
        if (!apiRecord) estimatedFromPage += 1;
        counts[result.status] = (counts[result.status] || 0) + 1;
        this.renderCostAuditResult(extracted.costCell, result);
      }
      const sourceSuffix = estimatedFromPage > 0 ? ` · ${estimatedFromPage} 条按页面显示值估算` : '';
      summary.textContent = `费用校验：${counts.ok} 条正常 · ${counts.anomaly} 条异常 · ${counts.skipped} 条跳过${sourceSuffix}`;
      summary.classList.toggle('asg-usage-cost-summary-warning', counts.anomaly > 0);
    }

    renderCostAuditResult(costCell, result) {
      let node = costCell.querySelector('.asg-usage-cost-audit');
      const shouldDisplay = result.status === 'anomaly'
        || (result.status === 'ok' && this.config.usageCostAuditDisplay === 'all');
      if (!shouldDisplay) {
        node?.remove();
        return;
      }
      if (!node) {
        node = document.createElement('span');
        costCell.appendChild(node);
      }
      const relative = Number.isFinite(result.relativePercent) ? `${Math.abs(result.relativePercent).toFixed(1)}%` : formatUsageCost(Math.abs(result.difference));
      const verdict = result.status === 'ok' ? '一致' : `${result.direction === 'low' ? '偏低' : '偏高'} ${relative}`;
      node.className = `asg-usage-cost-audit${result.status === 'anomaly' ? ' asg-usage-cost-anomaly' : ''}`;
      node.textContent = `预计 ${formatUsageCost(result.estimated)} · ${verdict}`;
      const formatTokens = (value) => Math.round(value).toLocaleString('en-US');
      node.title = `输入 ${formatTokens(result.tokens.inputTokens)} × ${formatModelPriceAmount(result.price.inputPerMillion)}/1M + 输出 ${formatTokens(result.tokens.outputTokens)} × ${formatModelPriceAmount(result.price.outputPerMillion)}/1M + 缓存输入 ${formatTokens(result.tokens.cacheInputTokens)} × ${formatModelPriceAmount(result.price.cacheInputPerMillion)}/1M = ${formatUsageCost(result.estimated)}；实际 ${formatUsageCost(result.actual)}；容差 ±${formatUsageCost(result.tolerance)}`;
    }
  }

  class ProviderSortEnhancer {
    constructor() {
      this.active = false;
      this.applied = false;
      this.observer = null;
      this.applyTimer = null;
      this.observerDeadlineTimer = null;
      this.retryTimer = null;
      this.sortVerifyTimer = null;
      this.refreshTimer = null;
      this.refreshCompletionTimer = null;
      this.refreshObserver = null;
      this.refreshButton = null;
      this.refreshRoot = null;
      this.refreshDataSignature = '';
      this.lastRefreshAt = 0;
      this.refreshing = false;
      this.refreshSawDataChange = false;
      this.sortClickCount = 0;
      this.sortConvergenceExhausted = false;
      this.sortClickPending = false;
      this.sortPendingStateSignature = '';
      this.sortRoot = null;
      this.providerConfigLoaded = false;
      this.providerSortPreference = DEFAULT_CONFIG.providerSortPreference;
      this.providerAutoRefresh = DEFAULT_CONFIG.providerAutoRefresh;
      this.providerRefreshIntervalSeconds = DEFAULT_CONFIG.providerRefreshIntervalSeconds;
      this.onPageClick = (event) => {
        const button = event.target?.closest?.('button');
        const root = button?.closest?.('[data-testid="llm-monitor-panel"]') || button?.closest?.('main');
        if (root
          && findProviderRefreshButtonInRoot(root) === button
          && !isProviderRefreshButtonDisabled(button)) {
          if (this.refreshing) return;
          if (!this.beginRefreshTracking(button, root)) {
            this.lastRefreshAt = Date.now();
            if (!this.refreshing) this.syncRefreshTimer(false);
          }
        }
      };
      this.onConfigChanged = () => {
        const previous = this.getProviderConfig();
        const next = this.loadProviderConfig();
        const sortChanged = next.providerSortPreference !== previous.providerSortPreference;
        const refreshChanged = next.providerAutoRefresh !== previous.providerAutoRefresh
          || next.providerRefreshIntervalSeconds !== previous.providerRefreshIntervalSeconds;
        if (sortChanged) {
          this.applied = false;
          this.sortClickCount = 0;
          this.sortConvergenceExhausted = false;
          this.sortClickPending = false;
          this.sortPendingStateSignature = '';
          this.observeUntilApplied();
          this.queueApply();
        }
        if (refreshChanged) {
          if (!next.providerAutoRefresh) this.stopRefreshTracking();
          this.syncRefreshTimer();
        }
      };
    }

    start() {
      this.loadProviderConfig();
      this.active = true;
      this.applied = false;
      this.sortClickCount = 0;
      this.sortConvergenceExhausted = false;
      this.sortClickPending = false;
      this.sortPendingStateSignature = '';
      this.lastRefreshAt = Date.now();
      document.addEventListener('click', this.onPageClick, true);
      window.addEventListener(CONFIG_CHANGE_EVENT, this.onConfigChanged);
      this.syncSortRoot();
      this.observeUntilApplied();
      this.queueApply();
      this.syncRefreshTimer();
    }

    loadProviderConfig() {
      const config = normalizeConfig(storageGet('config', DEFAULT_CONFIG));
      this.providerSortPreference = config.providerSortPreference;
      this.providerAutoRefresh = config.providerAutoRefresh;
      this.providerRefreshIntervalSeconds = config.providerRefreshIntervalSeconds;
      this.providerConfigLoaded = true;
      return this.getProviderConfig();
    }

    getProviderConfig() {
      if (!this.providerConfigLoaded) return this.loadProviderConfig();
      return {
        providerSortPreference: this.providerSortPreference,
        providerAutoRefresh: this.providerAutoRefresh,
        providerRefreshIntervalSeconds: this.providerRefreshIntervalSeconds,
      };
    }

    getSortRoot() {
      const panel = document.querySelector('[data-testid="llm-monitor-panel"]');
      return panel?.querySelector?.('.monitor-sort-controls') || document.querySelector('.monitor-sort-controls') || null;
    }

    syncSortRoot() {
      const nextRoot = this.getSortRoot();
      const currentRoot = this.sortRoot;
      const rootChanged = nextRoot !== currentRoot || currentRoot?.isConnected === false;
      if (!rootChanged) return false;
      this.stopSortRetries();
      this.sortRoot = nextRoot;
      this.applied = false;
      this.sortClickCount = 0;
      this.sortConvergenceExhausted = false;
      this.sortClickPending = false;
      this.sortPendingStateSignature = '';
      if (this.active) {
        this.observeUntilApplied();
        this.queueApply();
      }
      return true;
    }

    observeUntilApplied() {
      if (!this.active || this.applied || this.sortConvergenceExhausted || this.observer) return;
      if (this.retryTimer) window.clearInterval(this.retryTimer);
      this.retryTimer = null;
      this.observer = new MutationObserver((records) => {
        if (this.mutationsNeedSortScan(records)) this.queueApply();
      });
      this.observer.observe(document.querySelector('main') || document.body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
      if (this.observerDeadlineTimer) window.clearTimeout(this.observerDeadlineTimer);
      this.observerDeadlineTimer = window.setTimeout(() => {
        this.observerDeadlineTimer = null;
        this.observer?.disconnect();
        this.observer = null;
        this.startLowFrequencyRetry();
      }, 15_000);
    }

    mutationsNeedSortScan(records) {
      return [...(records || [])].some((record) => {
        const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
        if (target?.closest?.('button.monitor-sort-head')) return true;
        return [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1
          && (node.matches?.('button.monitor-sort-head') || node.querySelector?.('button.monitor-sort-head')));
      });
    }

    startLowFrequencyRetry() {
      if (!this.active || this.applied || this.sortConvergenceExhausted || this.retryTimer) return;
      this.retryTimer = window.setInterval(() => this.queueApply(), 5_000);
    }

    stop() {
      this.active = false;
      this.observer?.disconnect();
      this.observer = null;
      if (this.applyTimer) window.clearTimeout(this.applyTimer);
      if (this.observerDeadlineTimer) window.clearTimeout(this.observerDeadlineTimer);
      if (this.retryTimer) window.clearInterval(this.retryTimer);
      if (this.sortVerifyTimer) window.clearTimeout(this.sortVerifyTimer);
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.applyTimer = null;
      this.observerDeadlineTimer = null;
      this.retryTimer = null;
      this.sortVerifyTimer = null;
      this.refreshTimer = null;
      this.stopRefreshTracking();
      this.sortRoot = null;
      document.removeEventListener('click', this.onPageClick, true);
      window.removeEventListener(CONFIG_CHANGE_EVENT, this.onConfigChanged);
    }

    queueApply() {
      if (!this.active || this.applied || this.sortConvergenceExhausted || this.applyTimer) return;
      this.applyTimer = window.setTimeout(() => {
        this.applyTimer = null;
        this.apply();
      }, ENHANCER_RENDER_DEBOUNCE_MS);
    }

    queueSortVerification() {
      if (!this.active) return;
      if (this.sortVerifyTimer) window.clearTimeout(this.sortVerifyTimer);
      this.sortVerifyTimer = window.setTimeout(() => {
        this.sortVerifyTimer = null;
        this.apply();
      }, PROVIDER_SORT_VERIFY_DELAY_MS);
    }

    apply() {
      if (!this.active || this.applied || this.sortConvergenceExhausted) return false;
      const preference = this.getProviderConfig().providerSortPreference;
      const scopedButtons = document.querySelectorAll('[data-testid="llm-monitor-panel"] .monitor-sort-controls button.monitor-sort-head');
      const buttons = scopedButtons.length ? scopedButtons : document.querySelectorAll('button.monitor-sort-head');
      const target = findProviderSortButton(buttons, preference);
      if (!target) return false;
      const activeButton = findActiveProviderSortButton(buttons);
      const stateSignature = getProviderSortStateSignature(buttons);
      if (this.sortClickPending) {
        if (!stateSignature || stateSignature === this.sortPendingStateSignature) return false;
        this.sortClickPending = false;
        this.sortPendingStateSignature = '';
      }
      if (shouldActivateProviderSort(target, activeButton, preference)) {
        if (this.sortClickCount >= PROVIDER_SORT_MAX_CLICKS) {
          this.sortConvergenceExhausted = true;
          this.stopSortRetries();
          return false;
        }
        this.sortClickCount += 1;
        this.sortClickPending = true;
        this.sortPendingStateSignature = stateSignature;
        target.click();
        this.queueSortVerification();
        return false;
      }
      this.applied = true;
      this.sortClickCount = 0;
      this.sortClickPending = false;
      this.sortPendingStateSignature = '';
      this.stopSortRetries();
      return true;
    }

    stopSortRetries() {
      this.observer?.disconnect();
      this.observer = null;
      if (this.observerDeadlineTimer) window.clearTimeout(this.observerDeadlineTimer);
      if (this.retryTimer) window.clearInterval(this.retryTimer);
      if (this.sortVerifyTimer) window.clearTimeout(this.sortVerifyTimer);
      this.observerDeadlineTimer = null;
      this.retryTimer = null;
      this.sortVerifyTimer = null;
    }

    syncRefreshTimer(refreshIfDue = true, forceBackoff = false) {
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      if (!this.active || !isPageVisible()) return;
      const config = this.getProviderConfig();
      if (!config.providerAutoRefresh) return;
      if (this.refreshing) return;
      const intervalMs = config.providerRefreshIntervalSeconds * 1000;
      const now = Date.now();
      const refreshDue = refreshIfDue && isRefreshDue(now, this.lastRefreshAt, intervalMs);
      const refreshStarted = refreshDue && this.refresh(config, now);
      if (refreshStarted && this.refreshing) return;
      const refreshUnavailable = forceBackoff || (refreshDue && !refreshStarted);
      const delayMs = getProviderRefreshTimerDelay(Date.now(), this.lastRefreshAt, intervalMs, refreshUnavailable);
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        this.syncRefreshTimer(true);
      }, delayMs);
    }

    handleVisibilityChange() {
      if (!this.active) return;
      if (!isPageVisible()) {
        if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        return;
      }
      this.syncRefreshTimer(true);
    }

    refresh(config, now = Date.now()) {
      if (!this.active || !isPageVisible()) return false;
      const currentConfig = config || this.getProviderConfig();
      if (!currentConfig.providerAutoRefresh
        || !isRefreshDue(now, this.lastRefreshAt, currentConfig.providerRefreshIntervalSeconds * 1000)) return false;
      const root = document.querySelector('main');
      const button = findProviderRefreshButtonInRoot(root);
      if (!button || isProviderRefreshButtonDisabled(button)) return false;
      const tracking = this.beginRefreshTracking(button, root);
      try {
        button.click();
      } catch {
        this.stopRefreshTracking();
        return false;
      }
      if (!tracking) {
        this.lastRefreshAt = Date.now();
      }
      return true;
    }

    beginRefreshTracking(button, root) {
      if (!this.active || this.refreshing || typeof MutationObserver !== 'function') return false;
      const observedRoot = root || document.querySelector('main') || button?.parentElement;
      if (!observedRoot) return false;
      this.refreshing = true;
      this.refreshButton = button;
      this.refreshRoot = observedRoot;
      this.refreshDataSignature = getProviderRefreshDataSignature(observedRoot);
      this.refreshSawDataChange = false;
      this.refreshObserver = new MutationObserver((records) => this.handleRefreshMutations(records));
      this.refreshObserver.observe(observedRoot, {
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'class'],
        characterData: true,
        childList: true,
        subtree: true,
      });
      this.refreshCompletionTimer = window.setTimeout(() => this.completeRefreshTracking(false), PROVIDER_REFRESH_COMPLETION_TIMEOUT_MS);
      return true;
    }

    handleRefreshMutations() {
      if (!this.refreshing) return;
      const root = this.refreshRoot;
      const button = findProviderRefreshButtonInRoot(root) || this.refreshButton;
      if (!button) return this.completeRefreshTracking(false);
      this.refreshButton = button;
      const busy = isProviderRefreshButtonBusy(button);
      const dataSignature = getProviderRefreshDataSignature(root);
      if (dataSignature && dataSignature !== this.refreshDataSignature) this.refreshSawDataChange = true;
      if (this.refreshSawDataChange && !busy) this.completeRefreshTracking(true);
    }

    completeRefreshTracking(succeeded) {
      if (!this.refreshing) return;
      this.stopRefreshTracking();
      if (succeeded) this.lastRefreshAt = Date.now();
      if (this.active) this.syncRefreshTimer(false, !succeeded);
    }

    stopRefreshTracking() {
      this.refreshObserver?.disconnect();
      if (this.refreshCompletionTimer) window.clearTimeout(this.refreshCompletionTimer);
      this.refreshObserver = null;
      this.refreshCompletionTimer = null;
      this.refreshButton = null;
      this.refreshRoot = null;
      this.refreshDataSignature = '';
      this.refreshing = false;
      this.refreshSawDataChange = false;
    }
  }

  class AppRouter {
    constructor() {
      this.panel = null;
      this.usage = null;
      this.keyGroups = null;
      this.providerSort = null;
      this.rejectedToken = '';
      this.timer = null;
      this.menuCommandId = null;
      this.active = false;
      this.onRouteChange = () => this.sync();
      this.onRouterReplace = () => this.stop();
      this.onVisibilityChange = () => {
        if (isPageVisible()) {
          this.sync();
          this.panel?.handleVisibilityChange();
          this.usage?.handleVisibilityChange();
          this.keyGroups?.handleVisibilityChange();
        }
        this.providerSort?.handleVisibilityChange();
      };
    }

    start() {
      if (this.active) return;
      this.active = true;
      if (typeof GM_registerMenuCommand === 'function') {
        this.menuCommandId = GM_registerMenuCommand('显示 AIHub 智能分组', () => {
          this.panel?.setMinimized(false);
        });
      }
      document.addEventListener(ROUTER_REPLACE_EVENT, this.onRouterReplace);
      this.sync();
      this.timer = window.setInterval(() => {
        if (isPageVisible()) this.sync();
      }, ROUTER_SYNC_INTERVAL_MS);
      window.addEventListener('popstate', this.onRouteChange);
      window.addEventListener('hashchange', this.onRouteChange);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      if (this.timer) window.clearInterval(this.timer);
      this.timer = null;
      window.removeEventListener('popstate', this.onRouteChange);
      window.removeEventListener('hashchange', this.onRouteChange);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      document.removeEventListener(ROUTER_REPLACE_EVENT, this.onRouterReplace);
      this.panel?.stop();
      this.usage?.stop();
      this.keyGroups?.stop();
      this.providerSort?.stop();
      this.panel = null;
      this.usage = null;
      this.keyGroups = null;
      this.providerSort = null;
      if (this.menuCommandId != null && typeof GM_unregisterMenuCommand === 'function') {
        try {
          GM_unregisterMenuCommand(this.menuCommandId);
        } catch {
          // Older userscript managers may expose registration without removal.
        }
      }
      this.menuCommandId = null;
      if (activeRouter === this) activeRouter = null;
    }

    sync() {
      if (!this.active) return;
      const token = getAuthToken();
      if (!token) this.rejectedToken = '';
      const features = getPageFeatures(location.pathname, Boolean(token) && token !== this.rejectedToken);
      if (features.panel && !this.panel) {
        this.panel = new Controller({
          onAuthInvalid: () => {
            this.rejectedToken = token;
            this.sync();
          },
        });
        this.panel.start(false);
      } else if (!features.panel && this.panel) {
        this.panel.stop();
        this.panel = null;
      }
      if (features.usage && !this.usage) {
        this.usage = new UsageMultiplierEnhancer();
        this.usage.start();
      } else if (features.usage && this.usage) {
        this.usage.syncObserverRoot();
        this.usage.syncUsageQueryPath();
      } else if (!features.usage && this.usage) {
        this.usage.stop();
        this.usage = null;
      }
      if (features.keyGroups && !this.keyGroups) {
        this.keyGroups = new KeyGroupDropdownEnhancer();
        this.keyGroups.start();
      } else if (!features.keyGroups && this.keyGroups) {
        this.keyGroups.stop();
        this.keyGroups = null;
      }
      if (features.providerSort && !this.providerSort) {
        this.providerSort = new ProviderSortEnhancer();
        this.providerSort.start();
      } else if (features.providerSort && this.providerSort) {
        this.providerSort.syncSortRoot();
      } else if (!features.providerSort && this.providerSort) {
        this.providerSort.stop();
        this.providerSort = null;
      }
    }
  }

  return {
    DEFAULT_CONFIG,
    GROUP_MODE_LABELS,
    LATENCY_SOURCE_LABELS,
    MODEL_PRICE_MODEL_LABELS,
    MODEL_DETECTION_REASON_LABELS,
    PROVIDER_SORT_LABELS,
    RECOMMENDATION_PRICE_BASIS_LABELS,
    normalizeConfig,
    getSettingsPreviewTargets,
    getRecommendationPricePreviewSignature,
    normalizeGroupMode,
    normalizeAvailabilityMode,
    normalizeLatencySource,
    normalizeUserTtftSampleCount,
    normalizeModelPriceModel,
    normalizeRecommendationPriceBasis,
    normalizeProviderSortPreference,
    getProviderSortButtonText,
    getProviderSortButtonTexts,
    getProviderSortDirection,
    getProviderSortButtonDirection,
    findActiveProviderSortButton,
    shouldActivateProviderSort,
    findProviderSortButton,
    findProviderRefreshButton,
    findProviderRefreshButtonInRoot,
    isProviderRefreshButtonDisabled,
    isProviderRefreshButtonBusy,
    getProviderRefreshDataSignature,
    normalizeCacheHitRate,
    formatCacheHitRate,
    normalizeRuntimeCache1h,
    getEffectivePricing,
    getEffectiveMultiplierReasonLabel,
    formatEffectivePricingSummary,
    getRecommendationPriceMetric,
    formatRecommendationPriceCriterion,
    formatOutputThroughput,
    normalizeModelPrices,
    getModelPrices,
    getSelectedModelPrice,
    formatModelPriceSummary,
    normalizeModelHealth,
    summarizeModelHealth,
    formatModelHealthSummary,
    normalizeModelDetectionReasonCodes,
    normalizeModelDetection,
    getModelDetection,
    getModelDetectionLabel,
    getModelDetectionReasonLabel,
    getModelDetectionReasonLabels,
    formatModelDetectionReasonSummary,
    formatModelDetectionSummary,
    formatModelDetectionTitle,
    isModelDetectionWarning,
    hasModelDetectionWarning,
    normalizePanelTab,
    getLatencyMetric,
    getUserLatencySampleCount,
    getUserTtftFallbackText,
    getLatencyMetricLabel,
    formatLatencyMetric,
    normalizeMonitorRow,
    normalizeMonitorSummaryPayload,
    normalizeMonitorSeriesPayload,
    normalizeMonitorHistory,
    monitorHistoryStatusToAvailability,
    buildMonitorSeriesFromSummary,
    hasMonitorSeriesData,
    mergeMonitorSeries,
    getBalanceAmount,
    formatBalance,
    getExcludedGroupInfo,
    getCandidateAnalysisSignature,
    analyzeCandidates,
    rankCandidates,
    reanalyzeRecommendationForSwitch,
    getMonitorFreshness,
    getLatestMonitorSampleAt,
    getMonitorSeriesWindowAnchor,
    getCooldownInfo,
    attachRecentAvailability,
    normalizeGroupName,
    buildGroupMultiplierMap,
    buildGroupMetricMap,
    buildGroupDropdownMonitorIndex,
    findGroupDropdownMonitor,
    parseGroupOptionMultiplier,
    buildUsageModelPriceIndex,
    findUsageModelPrice,
    parseCompactTokenCount,
    getCompactTokenRoundingUncertainty,
    parseUsageTokenBreakdown,
    normalizeUsageTokenBreakdown,
    getUsageModelVariant,
    parseUsageCost,
    parseUsageActualCost,
    parseUsageGroupMultiplier,
    isMeteredUsageBillingMode,
    calculateUsageCost,
    calculateUsageCostRoundingTolerance,
    classifyUsageCostDeviation,
    auditUsageCostRecord,
    formatUsageCost,
    formatGroupDropdownMonitor,
    getGroupDropdownToneClass,
    formatKeyOptionLabel,
    formatMultiplier,
    hasUsageDetailColumns,
    getPageFeatures,
    createStabilityState,
    getRecommendationStrategySignature,
    getRecommendationSnapshotBlockReason,
    advanceStability,
    canAutoSwitch,
    getAutoSwitchBlockReason,
    shouldLogTransition,
    getSwitchBlockReason,
    projectKeys,
    buildAuthHeaders,
    buildApiHeaders,
    mergeKeyPages,
    shouldRefreshKeys,
    isRefreshDue,
    getProviderRefreshDelay,
    getProviderRefreshTimerDelay,
    shouldRunControllerRefresh,
    isPageVisible,
    fetchMonitorSummary,
    clearMonitorSummaryCache,
    fetchMonitorSeries,
    clearMonitorSeriesCache,
    getCurrentUsageRequestPath,
    buildUsageAuditViewKey,
    shouldLoadUsageAuditView,
    projectUsageAuditItems,
    buildUsageAuditRecordFromApiItem,
    fetchCurrentUsageAuditItems,
    UsageMultiplierEnhancer,
    ProviderSortEnhancer,
    appendLogEntries,
    formatLogLine,
    start() {
      if (location.hostname !== 'aihub.top') return;
      activeRouter?.stop();
      document.dispatchEvent(new window.Event(ROUTER_REPLACE_EVENT));
      activeRouter = new AppRouter();
      activeRouter.start();
    },
  };
});
