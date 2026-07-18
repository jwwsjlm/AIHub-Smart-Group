// ==UserScript==
// @name         AIHub + ShuaiAPI Smart Group
// @name:zh-CN   AIHub + 帅API 智能分组
// @namespace    local.aihub.smart-group
// @version      0.2.1
// @description  Recommend reliable low-cost groups on AIHub and ShuaiAPI.
// @description:zh-CN 按倍率、模型和可用性推荐 AIHub 与帅API分组
// @license      MIT
// @homepageURL   https://github.com/jwwsjlm/AIHub-Smart-Group
// @supportURL    https://github.com/jwwsjlm/AIHub-Smart-Group/issues
// @match        https://aihub.top/providers*
// @match        https://aihub.top/keys*
// @match        https://api.shuaiapi.com/performance*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function (factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') exported.start();
})(function () {
  'use strict';

  const ROOT_ID = 'aihub-smart-group-panel';
  const TOGGLE_ID = 'aihub-smart-group-toggle';
  const SHUAI_ROOT_ID = 'shuai-smart-group-panel';
  const SHUAI_TOGGLE_ID = 'shuai-smart-group-toggle';
  const SCRIPT_VERSION = '0.2.1';
  const STORAGE_PREFIX = 'aihub-smart-group:';
  const DEFAULT_CONFIG = Object.freeze({
    minSuccess6h: 0.95,
    minSuccess24h: 0.90,
    requireNoWarnings: true,
    consecutiveChecks: 2,
    pollIntervalSeconds: 30,
    cooldownMinutes: 10,
    autoSwitch: false,
  });
  const SHUAI_DEFAULT_CONFIG = Object.freeze({
    hours: 24,
    minSuccessRate: 99,
    excludeWarnings: true,
    requireRecentData: true,
    pollIntervalSeconds: 60,
  });

  function numberOr(value, fallback) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      minSuccess6h: clamp(numberOr(source.minSuccess6h, DEFAULT_CONFIG.minSuccess6h), 0, 1),
      minSuccess24h: clamp(numberOr(source.minSuccess24h, DEFAULT_CONFIG.minSuccess24h), 0, 1),
      requireNoWarnings: source.requireNoWarnings !== false,
      consecutiveChecks: Math.round(clamp(numberOr(source.consecutiveChecks, DEFAULT_CONFIG.consecutiveChecks), 1, 5)),
      pollIntervalSeconds: Math.round(clamp(numberOr(source.pollIntervalSeconds, DEFAULT_CONFIG.pollIntervalSeconds), 10, 3600)),
      cooldownMinutes: Math.round(clamp(numberOr(source.cooldownMinutes, DEFAULT_CONFIG.cooldownMinutes), 0, 1440)),
      autoSwitch: source.autoSwitch === true,
    };
  }

  function rankCandidates(rows, config = DEFAULT_CONFIG) {
    const normalizedConfig = normalizeConfig(config);
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => {
        if (!row || row.enabled === false || row.available !== true) return false;
        const groupId = Number(row.group_id);
        const price = Number(row.priceMultiplier);
        const success6h = Number(row.successRates?.['6h']);
        const success24h = Number(row.successRates?.['24h']);
        if (!Number.isInteger(groupId) || groupId <= 0 || !Number.isFinite(price) || price < 0) return false;
        if (!Number.isFinite(success6h) || success6h < normalizedConfig.minSuccess6h) return false;
        if (!Number.isFinite(success24h) || success24h < normalizedConfig.minSuccess24h) return false;
        if (normalizedConfig.requireNoWarnings && Array.isArray(row.warningReasons) && row.warningReasons.length > 0) return false;
        return true;
      })
      .map((row) => ({
        ...row,
        groupId: Number(row.group_id),
        price: Number(row.priceMultiplier),
        success6h: Number(row.successRates['6h']),
        success24h: Number(row.successRates['24h']),
        latency: Number.isFinite(Number(row.firstTokenLatencyMs)) ? Number(row.firstTokenLatencyMs) : Number.POSITIVE_INFINITY,
        name: String(row.planType || row.name || `Group ${row.group_id}`),
      }))
      .sort((left, right) => (
        left.price - right.price
        || right.success6h - left.success6h
        || right.success24h - left.success24h
        || left.latency - right.latency
        || left.name.localeCompare(right.name)
      ));
  }

  function createStabilityState() {
    return { groupId: null, count: 0, stable: false };
  }

  function advanceStability(state, groupId, requiredChecks) {
    const required = Math.max(1, Math.round(Number(requiredChecks) || 1));
    const numericGroupId = Number.isInteger(Number(groupId)) ? Number(groupId) : null;
    if (numericGroupId === null) return createStabilityState();
    const sameGroup = state && state.groupId === numericGroupId;
    const count = sameGroup ? Number(state.count || 0) + 1 : 1;
    return { groupId: numericGroupId, count, stable: count >= required };
  }

  function canAutoSwitch({ now, lastSwitchAt, currentGroupId, targetGroupId, stable, config }) {
    if (!stable || targetGroupId == null || currentGroupId === targetGroupId) return false;
    const cooldownMs = normalizeConfig(config).cooldownMinutes * 60 * 1000;
    if (!Number.isFinite(lastSwitchAt)) return true;
    return Number(now) - lastSwitchAt >= cooldownMs;
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
    if (/^\/(?:keys(?:\/|\?|$)|groups\/(?:available|rates)(?:\?|$)|usage(?:\/|\?|$)|redeem(?:\/|\?|$)|subscriptions(?:\/|\?|$))/.test(path)) {
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

  async function apiRequest(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...buildApiHeaders(path, getAuthToken()),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    const response = await getPageWindow().fetch(`/api/v1${path}`, {
      credentials: 'include',
      ...options,
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
  }

  async function fetchMonitorSummary() {
    return apiRequest('/public/monitor/summary');
  }

  function shuaiRequestHeaders() {
    const headers = { Accept: 'application/json' };
    try {
      const uid = getPageWindow().localStorage.getItem('uid');
      if (uid) headers['New-Api-User'] = uid;
    } catch {
      // The session cookie is sufficient when the optional user hint is unavailable.
    }
    return headers;
  }

  async function fetchShuaiJson(path, options = {}) {
    const response = await getPageWindow().fetch(path, {
      credentials: 'include',
      ...options,
      headers: { ...shuaiRequestHeaders(), ...(options.headers || {}) },
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
  }

  async function fetchShuaiGroups(hours = 24) {
    const query = new URLSearchParams({ hours: String(hours) });
    return extractShuaiGroups(await fetchShuaiJson(`/api/perf-metrics/groups?${query}`));
  }

  async function fetchShuaiGroupCatalog() {
    const payload = await fetchShuaiJson('/api/user/self/groups');
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    return Object.entries(data).map(([name, value]) => ({
      name: String(name),
      description: String(value?.desc || value?.description || name),
      ratio: Number(value?.ratio),
      customChain: value?.custom_chain === true,
    }));
  }

  function normalizeShuaiToken(token) {
    const source = token && typeof token === 'object' ? token : {};
    return {
      id: source.id,
      name: String(source.name || source.key_name || `Key ${source.id ?? ''}`).trim(),
      group: String(source.group || source.group_name || '').trim(),
      status: String(source.status || '').trim(),
      crossGroupRetry: source.cross_group_retry === true,
    };
  }

  function extractShuaiTokens(payload) {
    const data = payload?.data ?? payload;
    const items = Array.isArray(data)
      ? data
      : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.tokens) ? data.tokens : []));
    return items.map(normalizeShuaiToken).filter((token) => token.id != null);
  }

  async function fetchShuaiTokens() {
    const payload = await fetchShuaiJson('/api/token/?p=1&size=100');
    return extractShuaiTokens(payload);
  }

  async function updateShuaiTokenGroup(tokenId, group, crossGroupRetry = false) {
    return fetchShuaiJson('/api/token/?group_only=true', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tokenId, group, cross_group_retry: Boolean(crossGroupRetry) }),
    });
  }

  async function fetchAllKeys() {
    const pages = [];
    let page = 1;
    let totalPages = 1;
    do {
      const query = new URLSearchParams({ page: String(page), page_size: '100', sort_by: 'created_at', sort_order: 'desc' });
      const result = await apiRequest(`/keys?${query}`);
      pages.push(result);
      totalPages = Math.max(1, Number(result?.pages) || 1);
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
    #${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px);color:#172033;background:#fff;border:1px solid #d6dbe5;border-radius:8px;box-shadow:0 8px 30px rgba(16,24,40,.18);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #${ROOT_ID}[hidden]{display:none}
    #${ROOT_ID} *{box-sizing:border-box}
    #${ROOT_ID} .asg-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e4e7ec}
    #${ROOT_ID} .asg-head strong{font-size:14px}
    #${ROOT_ID} button{font:inherit;cursor:pointer;border:1px solid #cfd5df;border-radius:6px;background:#fff;color:#172033;padding:5px 9px}
    #${ROOT_ID} button:hover:not(:disabled){background:#f3f5f8}
    #${ROOT_ID} button:disabled{cursor:not-allowed;opacity:.5}
    #${ROOT_ID} .asg-icon{border:0;padding:2px 5px;font-size:18px;line-height:1}
    #${ROOT_ID} .asg-body{padding:10px 12px}
    #${ROOT_ID} .asg-status{color:#667085;font-size:12px;margin-bottom:8px}
    #${ROOT_ID} .asg-recommend{padding:9px;background:#f4f8ff;border:1px solid #cfe0ff;border-radius:6px;margin-bottom:9px}
    #${ROOT_ID} .asg-recommend strong{font-size:15px}
    #${ROOT_ID} .asg-muted{color:#667085}
    #${ROOT_ID} .asg-metrics{display:flex;flex-wrap:wrap;gap:6px 12px;color:#475467;font-size:12px;margin-top:4px}
    #${ROOT_ID} label{display:block;color:#475467;font-size:12px;margin:8px 0 4px}
    #${ROOT_ID} select,#${ROOT_ID} input[type=number]{width:100%;border:1px solid #cfd5df;border-radius:6px;padding:6px;background:#fff;color:#172033;font:inherit}
    #${ROOT_ID} .asg-actions{display:flex;gap:7px;margin-top:10px}
    #${ROOT_ID} .asg-actions button:last-child{flex:1;background:#1456d9;color:#fff;border-color:#1456d9}
    #${ROOT_ID} .asg-actions button:last-child:hover:not(:disabled){background:#0f46b6}
    #${ROOT_ID} .asg-auto{display:flex;align-items:center;gap:6px;margin-top:9px;color:#475467}
    #${ROOT_ID} .asg-auto input{margin:0}
    #${ROOT_ID} details{margin-top:9px;border-top:1px solid #e4e7ec;padding-top:7px}
    #${ROOT_ID} summary{cursor:pointer;color:#475467}
    #${ROOT_ID} .asg-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px;margin-top:7px}
    #${ROOT_ID} .asg-grid label{margin:0}
    #${ROOT_ID} .asg-grid input{margin-top:3px}
    #${ROOT_ID} .asg-save{margin-top:8px}
    #${ROOT_ID} .asg-list{margin:8px 0 0;padding:0;list-style:none;max-height:132px;overflow:auto;border-top:1px solid #eef0f3}
    #${ROOT_ID} .asg-list li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eef0f3}
    #${ROOT_ID} .asg-list li span:last-child{text-align:right;color:#475467;white-space:nowrap}
    #${ROOT_ID} .asg-error{color:#b42318;background:#fff4f2;border-color:#fecdca}
    #${TOGGLE_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:42px;height:42px;padding:0;border:1px solid #1456d9;border-radius:50%;background:#1456d9;color:#fff;box-shadow:0 8px 24px rgba(16,24,40,.2);font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
    #${TOGGLE_ID}[hidden]{display:none}
    #${TOGGLE_ID}:hover{background:#0f46b6}
  `;

  const SHUAI_STYLE = `
    #${SHUAI_ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:390px;max-width:calc(100vw - 32px);color:#182230;background:#fff;border:1px solid #d7dde7;border-radius:8px;box-shadow:0 8px 30px rgba(16,24,40,.18);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #${SHUAI_ROOT_ID}[hidden]{display:none}
    #${SHUAI_ROOT_ID} *{box-sizing:border-box}
    #${SHUAI_ROOT_ID} .ssg-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e4e7ec}
    #${SHUAI_ROOT_ID} .ssg-head strong{font-size:14px}
    #${SHUAI_ROOT_ID} button{font:inherit;cursor:pointer;border:1px solid #cfd5df;border-radius:6px;background:#fff;color:#182230;padding:5px 9px}
    #${SHUAI_ROOT_ID} button:hover:not(:disabled){background:#f3f5f8}
    #${SHUAI_ROOT_ID} button:disabled{cursor:not-allowed;opacity:.5}
    #${SHUAI_ROOT_ID} .ssg-icon{border:0;padding:2px 5px;font-size:18px;line-height:1}
    #${SHUAI_ROOT_ID} .ssg-body{padding:10px 12px}
    #${SHUAI_ROOT_ID} .ssg-status{color:#667085;font-size:12px;margin-bottom:8px}
    #${SHUAI_ROOT_ID} .ssg-status.ssg-error{color:#b42318;background:#fff4f2;border:1px solid #fecdca;border-radius:6px;padding:6px}
    #${SHUAI_ROOT_ID} label{display:block;color:#475467;font-size:12px;margin:8px 0 4px}
    #${SHUAI_ROOT_ID} select,#${SHUAI_ROOT_ID} input[type=number]{width:100%;border:1px solid #cfd5df;border-radius:6px;padding:6px;background:#fff;color:#182230;font:inherit}
    #${SHUAI_ROOT_ID} .ssg-controls{display:grid;grid-template-columns:1fr 90px;gap:8px}
    #${SHUAI_ROOT_ID} .ssg-recommend{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
    #${SHUAI_ROOT_ID} .ssg-box{padding:9px;background:#f7f9fc;border:1px solid #e1e6ef;border-radius:6px;min-width:0}
    #${SHUAI_ROOT_ID} .ssg-box.ssg-primary{background:#f4f8ff;border-color:#cfe0ff}
    #${SHUAI_ROOT_ID} .ssg-box strong{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #${SHUAI_ROOT_ID} .ssg-label{color:#667085;font-size:11px;margin-bottom:3px}
    #${SHUAI_ROOT_ID} .ssg-metrics{display:flex;flex-wrap:wrap;gap:4px 8px;color:#475467;font-size:11px;margin-top:5px}
    #${SHUAI_ROOT_ID} .ssg-muted{color:#667085}
    #${SHUAI_ROOT_ID} .ssg-options{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 8px;margin-top:8px;color:#475467;font-size:12px}
    #${SHUAI_ROOT_ID} .ssg-options input{margin:0 4px 0 0}
    #${SHUAI_ROOT_ID} .ssg-actions{display:flex;gap:7px;margin-top:9px}
    #${SHUAI_ROOT_ID} .ssg-actions button:last-child{flex:1;background:#1456d9;color:#fff;border-color:#1456d9}
    #${SHUAI_ROOT_ID} .ssg-switch{border-top:1px solid #e4e7ec;margin-top:10px;padding-top:8px}
    #${SHUAI_ROOT_ID} .ssg-switch-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #${SHUAI_ROOT_ID} .ssg-switch button{width:100%;margin-top:7px;background:#0f766e;color:#fff;border-color:#0f766e}
    #${SHUAI_ROOT_ID} .ssg-list{margin:8px 0 0;padding:0;list-style:none;max-height:190px;overflow:auto;border-top:1px solid #eef0f3}
    #${SHUAI_ROOT_ID} .ssg-list li{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #eef0f3}
    #${SHUAI_ROOT_ID} .ssg-list li span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #${SHUAI_ROOT_ID} .ssg-list li span:last-child{text-align:right;color:#475467;white-space:nowrap;font-size:11px}
    #${SHUAI_TOGGLE_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:42px;height:42px;padding:0;border:1px solid #1456d9;border-radius:50%;background:#1456d9;color:#fff;box-shadow:0 8px 24px rgba(16,24,40,.2);font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
    #${SHUAI_TOGGLE_ID}[hidden]{display:none}
    #${SHUAI_TOGGLE_ID}:hover{background:#0f46b6}
    @media (max-width:520px){#${SHUAI_ROOT_ID} .ssg-recommend{grid-template-columns:1fr}}
  `;

  function addStyle(css) {
    if (typeof GM_addStyle === 'function') GM_addStyle(css);
    else {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
  }

  function formatLatency(value) {
    return Number.isFinite(value) ? `${Math.round(value)} ms` : '-';
  }

  function normalizeShuaiPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return Number.NaN;
    return number >= 0 && number <= 1 ? number * 100 : number;
  }

  function shuaiWarningText(group) {
    return [group?.description, group?.warning, group?.warning_reason, group?.status]
      .filter((value) => value != null)
      .map(String)
      .join(' ');
  }

  function hasShuaiWarning(group) {
    return /不稳定|警告|故障|建议使用其他|unstable|warning|degraded|critical/i.test(shuaiWarningText(group));
  }

  function normalizeShuaiModel(model) {
    const source = model && typeof model === 'object' ? model : {};
    return {
      name: String(source.model_name || source.model || source.name || '').trim(),
      requestCount: Number(source.request_count ?? source.requests ?? 0),
      successRate: normalizeShuaiPercent(source.success_rate ?? source.availability),
      cacheHitRate: normalizeShuaiPercent(source.cache_hit_rate),
      avgTtftMs: Number(source.avg_ttft_ms ?? source.avg_ttft ?? Number.NaN),
      avgLatencyMs: Number(source.avg_latency_ms ?? source.avg_latency ?? Number.NaN),
      avgTps: Number(source.avg_tps ?? source.tps ?? Number.NaN),
    };
  }

  function normalizeShuaiSeriesPoint(point) {
    const source = point && typeof point === 'object' ? point : {};
    return {
      ts: Number(source.ts ?? source.timestamp ?? 0),
      requestCount: Number(source.request_count ?? source.requests ?? 0),
      successRate: normalizeShuaiPercent(source.success_rate ?? source.availability),
    };
  }

  function normalizeShuaiGroup(group) {
    const source = group && typeof group === 'object' ? group : {};
    const models = (Array.isArray(source.models) ? source.models : [])
      .map(normalizeShuaiModel)
      .filter((model) => model.name);
    return {
      name: String(source.group ?? source.group_name ?? source.name ?? '').trim(),
      ratio: Number(source.ratio ?? source.group_ratio ?? Number.NaN),
      requestCount: Number(source.request_count ?? source.requests ?? 0),
      successRate: normalizeShuaiPercent(source.success_rate ?? source.availability),
      cacheHitRate: normalizeShuaiPercent(source.cache_hit_rate),
      avgTtftMs: Number(source.avg_ttft_ms ?? source.avg_ttft ?? Number.NaN),
      avgLatencyMs: Number(source.avg_latency_ms ?? source.avg_latency ?? Number.NaN),
      avgTps: Number(source.avg_tps ?? source.tps ?? Number.NaN),
      description: String(source.description || '').trim(),
      warning: hasShuaiWarning(source),
      models,
      series: (Array.isArray(source.series) ? source.series : []).map(normalizeShuaiSeriesPoint),
      startTs: Number(source.start_ts ?? source.startTs ?? 0),
      endTs: Number(source.end_ts ?? source.endTs ?? 0),
      bucketSeconds: Number(source.bucket_seconds ?? source.bucketSeconds ?? 3600),
    };
  }

  function extractShuaiGroups(payload) {
    const data = payload?.data ?? payload;
    const groups = Array.isArray(data) ? data : data?.groups;
    return (Array.isArray(groups) ? groups : []).map(normalizeShuaiGroup).filter((group) => group.name);
  }

  function classifyShuaiModel(modelName) {
    const name = String(modelName || '').toLowerCase();
    if (name.includes('claude')) return 'claude';
    if (name.includes('grok')) return 'grok';
    if (name.includes('codex')) return 'codex';
    if (name.includes('gpt')) return 'gpt';
    if (name.includes('gemini')) return 'gemini';
    if (name.includes('deepseek')) return 'deepseek';
    if (name.includes('qwen') || name.includes('通义')) return 'qwen';
    return 'other';
  }

  function buildShuaiModelOptions(groups) {
    return [...new Set((Array.isArray(groups) ? groups : [])
      .flatMap((group) => (Array.isArray(group.models) ? group.models : []))
      .map((model) => String(model.name || '').trim())
      .filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }

  function matchesShuaiModel(group, modelFilter) {
    if (!modelFilter || modelFilter === 'all') return true;
    const models = Array.isArray(group.models) ? group.models : [];
    if (modelFilter.startsWith('category:')) {
      const category = modelFilter.slice('category:'.length);
      return models.some((model) => classifyShuaiModel(model.name) === category);
    }
    return models.some((model) => model.name === modelFilter);
  }

  function hasRecentShuaiActivity(group) {
    const series = Array.isArray(group?.series) ? group.series.filter((point) => Number.isFinite(point.ts)) : [];
    if (!series.length) return true;
    const latest = series.reduce((current, point) => point.ts > current.ts ? point : current, series[0]);
    return latest.requestCount > 0;
  }

  function projectShuaiCandidate(group, modelFilter) {
    const model = modelFilter && !modelFilter.startsWith('category:')
      ? group.models.find((item) => item.name === modelFilter)
      : null;
    const source = model || group;
    return {
      ...group,
      modelName: model?.name || null,
      requestCount: Number(source.requestCount),
      successRate: Number(source.successRate),
      cacheHitRate: Number(source.cacheHitRate),
      avgTtftMs: Number(source.avgTtftMs),
      avgLatencyMs: Number(source.avgLatencyMs),
      avgTps: Number(source.avgTps),
    };
  }

  function rankShuaiGroups(groups, modelFilter = 'all', config = SHUAI_DEFAULT_CONFIG, options = {}) {
    const minSuccessRate = clamp(numberOr(config?.minSuccessRate, SHUAI_DEFAULT_CONFIG.minSuccessRate), 0, 100);
    const excludeWarnings = config?.excludeWarnings !== false;
    const reliableOnly = options.reliableOnly !== false;
    return (Array.isArray(groups) ? groups : [])
      .filter((group) => group && Number.isFinite(Number(group.ratio)) && Number(group.ratio) >= 0)
      .filter((group) => matchesShuaiModel(group, modelFilter))
      .filter((group) => config?.requireRecentData === false || hasRecentShuaiActivity(group))
      .map((group) => projectShuaiCandidate(group, modelFilter))
      .filter((candidate) => candidate.requestCount > 0 && Number.isFinite(candidate.successRate))
      .filter((candidate) => !reliableOnly || candidate.successRate >= minSuccessRate)
      .filter((candidate) => !reliableOnly || !excludeWarnings || !candidate.warning)
      .sort((left, right) => (
        left.ratio - right.ratio
        || right.successRate - left.successRate
        || (Number.isFinite(left.avgTtftMs) ? left.avgTtftMs : Number.POSITIVE_INFINITY)
          - (Number.isFinite(right.avgTtftMs) ? right.avgTtftMs : Number.POSITIVE_INFINITY)
        || (Number.isFinite(left.avgLatencyMs) ? left.avgLatencyMs : Number.POSITIVE_INFINITY)
          - (Number.isFinite(right.avgLatencyMs) ? right.avgLatencyMs : Number.POSITIVE_INFINITY)
        || left.name.localeCompare(right.name)
      ));
  }

  function getShuaiRecommendations(groups, modelFilter = 'all', config = SHUAI_DEFAULT_CONFIG) {
    return {
      cheapest: rankShuaiGroups(groups, modelFilter, config, { reliableOnly: false })[0] || null,
      recommended: rankShuaiGroups(groups, modelFilter, config, { reliableOnly: true })[0] || null,
      candidates: rankShuaiGroups(groups, modelFilter, config, { reliableOnly: true }),
    };
  }

  function normalizeShuaiConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      hours: Number(source.hours) === 168 ? 168 : 24,
      minSuccessRate: clamp(numberOr(source.minSuccessRate, SHUAI_DEFAULT_CONFIG.minSuccessRate), 0, 100),
      excludeWarnings: source.excludeWarnings !== false,
      requireRecentData: source.requireRecentData !== false,
      pollIntervalSeconds: Math.round(clamp(numberOr(source.pollIntervalSeconds, SHUAI_DEFAULT_CONFIG.pollIntervalSeconds), 30, 3600)),
    };
  }

  class Controller {
    constructor() {
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
      this.keyCount = null;
      this.minimized = storageGet('minimized', false) === true;
      this.timer = null;
      this.panel = null;
      this.toggleButton = null;
    }

    start() {
      const existing = document.getElementById(ROOT_ID);
      if (existing?.dataset.version === SCRIPT_VERSION) return;
      existing?.remove();
      document.getElementById(TOGGLE_ID)?.remove();
      addStyle(STYLE);
      this.renderShell();
      this.bindEvents();
      if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('显示 AIHub 智能分组', () => this.setMinimized(false));
      this.refresh();
      this.timer = window.setInterval(() => this.refresh(), this.config.pollIntervalSeconds * 1000);
    }

    renderShell() {
      const panel = document.createElement('section');
      panel.id = ROOT_ID;
      panel.dataset.version = SCRIPT_VERSION;
      panel.innerHTML = `
        <div class="asg-head"><strong>AIHub 智能分组 v${SCRIPT_VERSION}</strong><button class="asg-icon" data-action="minimize" title="最小化">−</button></div>
        <div class="asg-body">
          <div class="asg-status" data-field="status">准备检测</div>
          <div class="asg-recommend" data-field="recommend"><div class="asg-muted">正在读取监控数据...</div></div>
          <label for="asg-key-select">目标密钥</label>
          <select id="asg-key-select" data-field="key"></select>
          <div class="asg-actions"><button data-action="refresh">检测</button><button data-action="switch" disabled>切换到推荐分组</button></div>
          <label class="asg-auto"><input type="checkbox" data-field="auto"> 自动切换（默认关闭）</label>
          <details><summary>设置</summary>
            <div class="asg-grid">
              <label>6h 最低可用率<input type="number" min="0" max="1" step="0.01" data-setting="minSuccess6h"></label>
              <label>24h 最低可用率<input type="number" min="0" max="1" step="0.01" data-setting="minSuccess24h"></label>
              <label>连续通过次数<input type="number" min="1" max="5" step="1" data-setting="consecutiveChecks"></label>
              <label>检测间隔（秒）<input type="number" min="10" max="3600" step="1" data-setting="pollIntervalSeconds"></label>
              <label>切换冷却（分钟）<input type="number" min="0" max="1440" step="1" data-setting="cooldownMinutes"></label>
            </div>
            <label class="asg-auto"><input type="checkbox" data-setting="requireNoWarnings"> 排除监控警告</label>
            <button class="asg-save" data-action="save-settings">保存设置</button>
          </details>
          <ul class="asg-list" data-field="list"></ul>
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
      this.syncSettingsInputs();
      this.setMinimized(this.minimized);
    }

    bindEvents() {
      this.panel.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'minimize') this.setMinimized(true);
        if (action === 'refresh') this.refresh();
        if (action === 'switch') this.switchToRecommendation(false);
        if (action === 'save-settings') this.saveSettings();
      });
      this.toggleButton.addEventListener('click', () => this.setMinimized(false));
      this.panel.querySelector('[data-field="key"]').addEventListener('change', (event) => {
        this.selectedKeyId = event.target.value || null;
        storageSet('selectedKeyId', this.selectedKeyId);
        this.renderActionState();
      });
      this.panel.querySelector('[data-field="auto"]').addEventListener('change', (event) => {
        if (event.target.checked && !window.confirm('自动切换会在检测通过后修改选中 API 密钥的分组，是否启用？')) {
          event.target.checked = false;
          return;
        }
        this.config.autoSwitch = event.target.checked;
        storageSet('config', this.config);
        this.refresh();
      });
    }

    setMinimized(value) {
      this.minimized = value === true;
      if (this.panel) this.panel.hidden = this.minimized;
      if (this.toggleButton) this.toggleButton.hidden = !this.minimized;
      storageSet('minimized', this.minimized);
    }

    syncSettingsInputs() {
      for (const input of this.panel.querySelectorAll('[data-setting]')) {
        const key = input.dataset.setting;
        if (input.type === 'checkbox') input.checked = this.config[key] === true;
        else input.value = this.config[key];
      }
      this.panel.querySelector('[data-field="auto"]').checked = this.config.autoSwitch;
    }

    saveSettings() {
      const next = {};
      for (const input of this.panel.querySelectorAll('[data-setting]')) {
        next[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
      }
      next.autoSwitch = this.config.autoSwitch;
      this.config = normalizeConfig(next);
      storageSet('config', this.config);
      this.syncSettingsInputs();
      if (this.timer) window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.refresh(), this.config.pollIntervalSeconds * 1000);
      this.setStatus('设置已保存');
      this.refresh();
    }

    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.authError = '';
      this.keyCount = null;
      this.setStatus('检测中...');
      try {
        const summary = await fetchMonitorSummary();
        let keys = null;
        try {
          keys = await fetchAllKeys();
        } catch (error) {
          this.authError = error?.status === 401
            ? (getAuthToken() ? '密钥接口返回 401：当前登录已失效，请重新登录后刷新' : '未找到页面登录令牌，请在此 Chrome 配置中重新登录后刷新')
            : (error instanceof Error ? `密钥读取失败：${error.message}` : '密钥读取失败');
        }
        this.rows = Array.isArray(summary?.apis) ? summary.apis : [];
        this.ranked = rankCandidates(this.rows, this.config);
        const winner = this.ranked[0] || null;
        this.stability = advanceStability(this.stability, winner?.groupId ?? null, this.config.consecutiveChecks);
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
        if (this.config.autoSwitch) await this.switchToRecommendation(true);
      } catch (error) {
        this.error = error instanceof Error ? error.message : '检测失败';
        this.setStatus(this.error, true);
        this.renderActionState();
      } finally {
        this.loading = false;
        this.renderActionState();
      }
    }

    selectedKey() {
      return this.keys.find((key) => String(key.id) === String(this.selectedKeyId)) || null;
    }

    async switchToRecommendation(fromAuto) {
      const winner = this.ranked[0];
      const key = this.selectedKey();
      if (!winner || !key || !this.stability.stable) return false;
      if (key.groupId === winner.groupId) {
        this.setStatus(`密钥“${key.name}”已经在 ${winner.name}`);
        return false;
      }
      if (fromAuto && !canAutoSwitch({
        now: Date.now(),
        lastSwitchAt: Number(this.lastSwitch.at),
        currentGroupId: key.groupId,
        targetGroupId: winner.groupId,
        stable: this.stability.stable,
        config: this.config,
      })) return false;
      if (!fromAuto && !window.confirm(`将密钥“${key.name}”切换到 ${winner.name}（${winner.price}x），是否继续？`)) return false;
      try {
        await updateKeyGroup(key.id, winner.groupId);
        key.groupId = winner.groupId;
        key.groupName = winner.name;
        this.lastSwitch = { at: Date.now(), keyId: key.id, groupId: winner.groupId };
        storageSet('lastSwitch', this.lastSwitch);
        this.setStatus(`已切换到 ${winner.name}`);
        this.renderData();
        return true;
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : '切换失败', true);
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
      recommend.replaceChildren();
      if (!winner) {
        const empty = document.createElement('div');
        empty.className = 'asg-muted';
        empty.textContent = '没有符合当前可靠性条件的分组';
        recommend.appendChild(empty);
      } else {
        const title = document.createElement('strong');
        title.textContent = `${winner.name} · ${winner.price}x`;
        const metrics = document.createElement('div');
        metrics.className = 'asg-metrics';
        metrics.textContent = `6h ${formatPercent(winner.success6h)} · 24h ${formatPercent(winner.success24h)} · 首Token ${formatLatency(winner.latency)}${this.stability.stable ? ' · 已稳定' : ` · ${this.stability.count}/${this.config.consecutiveChecks} 次`}`;
        recommend.append(title, metrics);
      }
      const keyInfo = this.authError || (this.keyCount !== null ? `已读取 ${this.keyCount} 个密钥` : '');
      this.setStatus(this.error || keyInfo || (this.lastUpdated ? `最近检测：${this.lastUpdated.toLocaleTimeString()}` : '准备检测'), Boolean(this.error || this.authError));
      this.renderKeys();
      this.renderCandidates();
      this.renderActionState();
    }

    renderKeys() {
      const select = this.panel.querySelector('[data-field="key"]');
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = this.keys.length
        ? '选择要切换的密钥'
        : (this.authError || (this.keyCount !== null ? `接口返回 ${this.keyCount} 个密钥` : '未读取到密钥'));
      select.appendChild(placeholder);
      for (const key of this.keys) {
        const option = document.createElement('option');
        option.value = key.id;
        option.textContent = `${key.name} · ${key.groupName}`;
        option.selected = String(key.id) === String(this.selectedKeyId);
        select.appendChild(option);
      }
      select.disabled = this.keys.length === 0;
    }

    renderCandidates() {
      const list = this.panel.querySelector('[data-field="list"]');
      list.replaceChildren();
      for (const candidate of this.ranked.slice(0, 5)) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = candidate.name;
        const metrics = document.createElement('span');
        metrics.textContent = `${candidate.price}x · ${formatPercent(candidate.success6h)}`;
        item.append(name, metrics);
        list.appendChild(item);
      }
    }

    renderActionState() {
      const button = this.panel.querySelector('[data-action="switch"]');
      const winner = this.ranked[0];
      const key = this.selectedKey();
      let reason = '';
      if (this.loading) reason = '正在检测';
      else if (!winner) reason = '暂无符合条件的推荐分组';
      else if (!key) reason = '请先读取并选择目标密钥';
      else if (!this.stability.stable) reason = `推荐尚未稳定（${this.stability.count}/${this.config.consecutiveChecks} 次）`;
      else if (key.groupId === winner.groupId) reason = '当前密钥已经在推荐分组';
      button.disabled = Boolean(reason);
      button.title = reason || `切换到 ${winner.name}`;
    }
  }

  function formatShuaiPercent(value) {
    return Number.isFinite(value) ? `${value.toFixed(2)}%` : '-';
  }

  function formatShuaiMetric(value, suffix = '') {
    if (!Number.isFinite(value)) return '-';
    if (suffix === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
    if (suffix === 'tps') return `${value.toFixed(value < 10 ? 2 : 1)} t/s`;
    return `${value}${suffix}`;
  }

  class ShuaiController {
    constructor() {
      this.config = normalizeShuaiConfig(storageGet('shuai-config', SHUAI_DEFAULT_CONFIG));
      this.groups = [];
      this.groupCatalog = [];
      this.tokens = [];
      this.modelFilter = storageGet('shuai-model-filter', 'all');
      this.selectedTokenId = storageGet('shuai-token-id', null);
      this.targetGroup = storageGet('shuai-target-group', '');
      this.loading = false;
      this.switching = false;
      this.error = '';
      this.tokenError = '';
      this.lastUpdated = null;
      this.minimized = storageGet('shuai-minimized', false) === true;
      this.timer = null;
      this.panel = null;
      this.toggleButton = null;
    }

    start() {
      const existing = document.getElementById(SHUAI_ROOT_ID);
      if (existing?.dataset.version === SCRIPT_VERSION) return;
      existing?.remove();
      document.getElementById(SHUAI_TOGGLE_ID)?.remove();
      addStyle(SHUAI_STYLE);
      this.renderShell();
      this.bindEvents();
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('显示帅API智能分组', () => this.setMinimized(false));
      }
      this.refresh();
      this.timer = window.setInterval(() => this.refresh(), this.config.pollIntervalSeconds * 1000);
    }

    renderShell() {
      const panel = document.createElement('section');
      panel.id = SHUAI_ROOT_ID;
      panel.dataset.version = SCRIPT_VERSION;
      panel.innerHTML = `
        <div class="ssg-head"><strong>帅API 智能分组</strong><button class="ssg-icon" data-action="minimize" title="最小化">−</button></div>
        <div class="ssg-body">
          <div class="ssg-status" data-field="status">准备读取性能数据</div>
          <div class="ssg-controls">
            <label>模型或类型<select data-field="model"><option value="all">全部模型</option></select></label>
            <label>时间窗<select data-field="hours"><option value="24">24h</option><option value="168">7d</option></select></label>
          </div>
          <div class="ssg-recommend" data-field="recommend"><div class="ssg-muted">正在读取性能数据...</div></div>
          <div class="ssg-options"><label><input type="checkbox" data-setting="excludeWarnings">排除不稳定分组</label><label><input type="checkbox" data-setting="requireRecentData">要求最近有数据</label><label>最低成功率 <input type="number" min="0" max="100" step="0.1" data-setting="minSuccessRate" style="width:72px"></label></div>
          <div class="ssg-actions"><button data-action="refresh">刷新</button><button data-action="save-settings">保存设置</button></div>
          <div class="ssg-switch">
            <div class="ssg-switch-grid">
              <label>目标密钥<select data-field="token"><option value="">未读取到密钥</option></select></label>
              <label>目标分组<select data-field="target-group"><option value="">暂无推荐</option></select></label>
            </div>
            <button data-action="switch" disabled>切换选中密钥分组</button>
          </div>
          <ul class="ssg-list" data-field="list"></ul>
        </div>`;
      document.body.appendChild(panel);
      this.panel = panel;
      const toggle = document.createElement('button');
      toggle.id = SHUAI_TOGGLE_ID;
      toggle.type = 'button';
      toggle.textContent = '帅';
      toggle.title = '打开帅API智能分组';
      toggle.setAttribute('aria-label', '打开帅API智能分组');
      document.body.appendChild(toggle);
      this.toggleButton = toggle;
      this.syncSettingsInputs();
      this.setMinimized(this.minimized);
    }

    bindEvents() {
      this.panel.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'minimize') this.setMinimized(true);
        if (action === 'refresh') this.refresh();
        if (action === 'save-settings') this.saveSettings();
        if (action === 'switch') this.switchSelectedToken();
      });
      this.toggleButton.addEventListener('click', () => this.setMinimized(false));
      this.panel.querySelector('[data-field="model"]').addEventListener('change', (event) => {
        this.modelFilter = event.target.value || 'all';
        storageSet('shuai-model-filter', this.modelFilter);
        this.renderData();
      });
      this.panel.querySelector('[data-field="hours"]').addEventListener('change', (event) => {
        this.config.hours = Number(event.target.value) === 168 ? 168 : 24;
        storageSet('shuai-config', this.config);
        this.refresh();
      });
      this.panel.querySelector('[data-field="token"]').addEventListener('change', (event) => {
        this.selectedTokenId = event.target.value || null;
        storageSet('shuai-token-id', this.selectedTokenId);
        this.renderActionState();
      });
      this.panel.querySelector('[data-field="target-group"]').addEventListener('change', (event) => {
        this.targetGroup = event.target.value || '';
        storageSet('shuai-target-group', this.targetGroup);
        this.renderActionState();
      });
    }

    setMinimized(value) {
      this.minimized = value === true;
      if (this.panel) this.panel.hidden = this.minimized;
      if (this.toggleButton) this.toggleButton.hidden = !this.minimized;
      storageSet('shuai-minimized', this.minimized);
    }

    syncSettingsInputs() {
      this.panel.querySelector('[data-field="hours"]').value = String(this.config.hours);
      this.panel.querySelector('[data-setting="minSuccessRate"]').value = this.config.minSuccessRate;
      this.panel.querySelector('[data-setting="excludeWarnings"]').checked = this.config.excludeWarnings;
      this.panel.querySelector('[data-setting="requireRecentData"]').checked = this.config.requireRecentData;
    }

    saveSettings() {
      const input = this.panel.querySelector('[data-setting="minSuccessRate"]');
      const excludeWarnings = this.panel.querySelector('[data-setting="excludeWarnings"]');
      const requireRecentData = this.panel.querySelector('[data-setting="requireRecentData"]');
      this.config = normalizeShuaiConfig({
        ...this.config,
        minSuccessRate: input.value,
        excludeWarnings: excludeWarnings.checked,
        requireRecentData: requireRecentData.checked,
      });
      storageSet('shuai-config', this.config);
      this.syncSettingsInputs();
      if (this.timer) window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.refresh(), this.config.pollIntervalSeconds * 1000);
      this.setStatus('设置已保存');
      this.renderData();
    }

    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.error = '';
      this.setStatus('读取性能数据中...');
      try {
        this.groups = await fetchShuaiGroups(this.config.hours);
        this.tokenError = '';
        try {
          [this.tokens, this.groupCatalog] = await Promise.all([
            fetchShuaiTokens(),
            fetchShuaiGroupCatalog(),
          ]);
          if (!this.tokens.some((token) => String(token.id) === String(this.selectedTokenId))) {
            this.selectedTokenId = this.tokens.length === 1 ? this.tokens[0].id : null;
            storageSet('shuai-token-id', this.selectedTokenId);
          }
        } catch (error) {
          this.tokens = [];
          this.groupCatalog = [];
          this.tokenError = error instanceof Error ? error.message : '密钥读取失败';
        }
        const models = buildShuaiModelOptions(this.groups);
        const valid = this.modelFilter === 'all'
          || this.modelFilter.startsWith('category:')
          || models.includes(this.modelFilter);
        if (!valid) this.modelFilter = 'all';
        storageSet('shuai-model-filter', this.modelFilter);
        this.lastUpdated = new Date();
        this.renderData();
      } catch (error) {
        this.error = error instanceof Error ? error.message : '性能数据读取失败';
        this.setStatus(this.error, true);
        this.renderData();
      } finally {
        this.loading = false;
      }
    }

    setStatus(text, error = false) {
      const node = this.panel?.querySelector('[data-field="status"]');
      if (node) {
        node.textContent = text;
        node.classList.toggle('ssg-error', error);
      }
    }

    renderModelOptions() {
      const select = this.panel.querySelector('[data-field="model"]');
      const current = this.modelFilter;
      select.replaceChildren();
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = '全部模型';
      select.appendChild(all);
      const models = buildShuaiModelOptions(this.groups);
      const categories = [...new Set(models.map(classifyShuaiModel))];
      const labels = { gpt: 'GPT 类型', claude: 'Claude 类型', grok: 'Grok 类型', codex: 'Codex 类型', gemini: 'Gemini 类型', deepseek: 'DeepSeek 类型', qwen: 'Qwen 类型', other: '其他类型' };
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = `category:${category}`;
        option.textContent = labels[category] || category;
        option.selected = current === option.value;
        select.appendChild(option);
      }
      for (const model of models) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        option.selected = current === model;
        select.appendChild(option);
      }
      select.value = current;
    }

    selectedToken() {
      return this.tokens.find((token) => String(token.id) === String(this.selectedTokenId)) || null;
    }

    renderTokenOptions() {
      const select = this.panel.querySelector('[data-field="token"]');
      const current = this.selectedTokenId;
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = this.tokens.length ? '选择要切换的密钥' : (this.tokenError || '未读取到密钥');
      select.appendChild(placeholder);
      for (const token of this.tokens) {
        const option = document.createElement('option');
        option.value = token.id;
        option.textContent = `${token.name} · ${token.group || '未分组'}`;
        option.selected = String(token.id) === String(current);
        select.appendChild(option);
      }
      select.disabled = this.tokens.length === 0;
    }

    renderTargetGroupOptions(recommendations) {
      const select = this.panel.querySelector('[data-field="target-group"]');
      const options = new Map();
      for (const group of this.groupCatalog) options.set(group.name, group);
      for (const group of this.groups) {
        if (!options.has(group.name)) options.set(group.name, { name: group.name, ratio: group.ratio, description: group.description });
      }
      const rows = [...options.values()].sort((left, right) => (
        (Number.isFinite(left.ratio) ? left.ratio : Number.POSITIVE_INFINITY)
          - (Number.isFinite(right.ratio) ? right.ratio : Number.POSITIVE_INFINITY)
        || left.name.localeCompare(right.name)
      ));
      const recommendedName = recommendations.recommended?.name || recommendations.cheapest?.name || '';
      if (!this.targetGroup || !options.has(this.targetGroup)) this.targetGroup = recommendedName;
      storageSet('shuai-target-group', this.targetGroup);
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = rows.length ? '选择目标分组' : '暂无可用分组';
      select.appendChild(placeholder);
      for (const row of rows) {
        const option = document.createElement('option');
        option.value = row.name;
        option.textContent = Number.isFinite(row.ratio) ? `${row.name} · ×${row.ratio}` : row.name;
        option.selected = row.name === this.targetGroup;
        select.appendChild(option);
      }
      select.disabled = rows.length === 0;
    }

    renderRecommendation(candidate, label, primary) {
      const box = document.createElement('div');
      box.className = `ssg-box${primary ? ' ssg-primary' : ''}`;
      const title = document.createElement('div');
      title.className = 'ssg-label';
      title.textContent = label;
      box.appendChild(title);
      if (!candidate) {
        const empty = document.createElement('div');
        empty.className = 'ssg-muted';
        empty.textContent = '没有符合条件的分组';
        box.appendChild(empty);
        return box;
      }
      const name = document.createElement('strong');
      name.textContent = `${candidate.name} · ×${candidate.ratio}`;
      box.appendChild(name);
      const metrics = document.createElement('div');
      metrics.className = 'ssg-metrics';
      metrics.textContent = `${formatShuaiPercent(candidate.successRate)} · TTFT ${formatShuaiMetric(candidate.avgTtftMs, 'ms')} · 延迟 ${formatShuaiMetric(candidate.avgLatencyMs, 'ms')}`;
      box.appendChild(metrics);
      if (candidate.warning) {
        const warning = document.createElement('div');
        warning.className = 'ssg-muted';
        warning.textContent = '页面标记为不稳定';
        box.appendChild(warning);
      }
      return box;
    }

    renderData() {
      this.renderModelOptions();
      const recommendations = getShuaiRecommendations(this.groups, this.modelFilter, this.config);
      this.renderTokenOptions();
      this.renderTargetGroupOptions(recommendations);
      const recommend = this.panel.querySelector('[data-field="recommend"]');
      recommend.replaceChildren(
        this.renderRecommendation(recommendations.cheapest, '最低倍率', false),
        this.renderRecommendation(recommendations.recommended, '可靠推荐', true),
      );
      const list = this.panel.querySelector('[data-field="list"]');
      list.replaceChildren();
      const candidates = recommendations.candidates.slice(0, 5);
      if (!candidates.length) {
        const empty = document.createElement('li');
        empty.className = 'ssg-muted';
        empty.textContent = '暂无达到可靠性条件的候选分组';
        list.appendChild(empty);
      }
      for (const candidate of candidates) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = candidate.modelName ? `${candidate.name} · ${candidate.modelName}` : candidate.name;
        const metrics = document.createElement('span');
        metrics.textContent = `×${candidate.ratio} · ${formatShuaiPercent(candidate.successRate)}`;
        item.append(name, metrics);
        list.appendChild(item);
      }
      if (!this.error) {
        const usable = this.groups.filter((group) => hasRecentShuaiActivity(group)).length;
        const tokenStatus = this.tokenError ? ` · 密钥读取失败：${this.tokenError}` : '';
        this.setStatus(this.lastUpdated
          ? `已读取 ${this.groups.length} 个分组，${usable} 个有数据 · ${this.lastUpdated.toLocaleTimeString()}${tokenStatus}`
          : `准备读取性能数据${tokenStatus}`, Boolean(this.tokenError));
      }
      this.renderActionState();
    }

    renderActionState() {
      const button = this.panel.querySelector('[data-action="switch"]');
      const token = this.selectedToken();
      let reason = '';
      if (this.loading || this.switching) reason = this.switching ? '正在切换' : '正在读取数据';
      else if (!token) reason = '请选择目标密钥';
      else if (!this.targetGroup) reason = '请选择目标分组';
      else if (token.group === this.targetGroup) reason = '密钥已经在该分组';
      button.disabled = Boolean(reason);
      button.textContent = this.switching ? '切换中...' : '切换选中密钥分组';
      button.title = reason || `切换到 ${this.targetGroup}`;
    }

    async switchSelectedToken() {
      const token = this.selectedToken();
      if (!token || !this.targetGroup || this.switching || token.group === this.targetGroup) return false;
      const catalogEntry = this.groupCatalog.find((group) => group.name === this.targetGroup);
      const crossGroupRetry = this.targetGroup === 'auto' || catalogEntry?.customChain === true;
      if (!window.confirm(`将密钥“${token.name}”从“${token.group || '未分组'}”切换到“${this.targetGroup}”，是否继续？`)) return false;
      this.switching = true;
      this.renderActionState();
      try {
        await updateShuaiTokenGroup(token.id, this.targetGroup, crossGroupRetry);
        token.group = this.targetGroup;
        token.crossGroupRetry = crossGroupRetry;
        this.setStatus(`已将“${token.name}”切换到 ${this.targetGroup}`);
        this.renderData();
        return true;
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : '分组切换失败', true);
        return false;
      } finally {
        this.switching = false;
        this.renderActionState();
      }
    }
  }

  return {
    DEFAULT_CONFIG,
    normalizeConfig,
    rankCandidates,
    createStabilityState,
    advanceStability,
    canAutoSwitch,
    projectKeys,
    buildAuthHeaders,
    buildApiHeaders,
    mergeKeyPages,
    SHUAI_DEFAULT_CONFIG,
    normalizeShuaiConfig,
    normalizeShuaiModel,
    normalizeShuaiSeriesPoint,
    normalizeShuaiGroup,
    extractShuaiGroups,
    normalizeShuaiToken,
    extractShuaiTokens,
    classifyShuaiModel,
    buildShuaiModelOptions,
    matchesShuaiModel,
    hasRecentShuaiActivity,
    rankShuaiGroups,
    getShuaiRecommendations,
    start() {
      if (location.hostname === 'aihub.top') {
        new Controller().start();
        return;
      }
      if (location.hostname === 'api.shuaiapi.com' && location.pathname.startsWith('/performance')) {
        new ShuaiController().start();
      }
    },
  };
});
