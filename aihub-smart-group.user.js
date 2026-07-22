// ==UserScript==
// @name         AIHub Smart Group
// @name:zh-CN   AIHub 智能分组
// @namespace    local.aihub.smart-group
// @version      0.3.2
// @description  Recommend reliable low-cost groups on AIHub.
// @description:zh-CN 按价格、速度和可用性推荐 AIHub 分组
// @license      MIT
// @homepageURL   https://github.com/jwwsjlm/AIHub-Smart-Group
// @supportURL    https://github.com/jwwsjlm/AIHub-Smart-Group/issues
// @match        https://aihub.top/providers*
// @match        https://aihub.top/keys*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

/* global module */

(function (factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') exported.start();
})(function () {
  'use strict';

  const ROOT_ID = 'aihub-smart-group-panel';
  const TOGGLE_ID = 'aihub-smart-group-toggle';
  const SCRIPT_VERSION = '0.3.2';
  const STORAGE_PREFIX = 'aihub-smart-group:';
  const GROUP_MODE_LABELS = Object.freeze({
    price: '价格',
    balance: '平衡',
    speed: '速度',
  });
  const DEFAULT_CONFIG = Object.freeze({
    minSuccess6h: 0.95,
    minSuccess24h: 0.90,
    requireNoWarnings: true,
    consecutiveChecks: 2,
    pollIntervalSeconds: 30,
    cooldownMinutes: 10,
    autoSwitch: false,
    mode: 'price',
    balancePricePercent: 20,
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
      mode: normalizeGroupMode(source.mode),
      balancePricePercent: clamp(numberOr(source.balancePricePercent, DEFAULT_CONFIG.balancePricePercent), 0, 500),
    };
  }

  function normalizeGroupMode(value) {
    return Object.prototype.hasOwnProperty.call(GROUP_MODE_LABELS, value) ? value : 'price';
  }

  function rankCandidates(rows, config = DEFAULT_CONFIG) {
    const normalizedConfig = normalizeConfig(config);
    const candidates = (Array.isArray(rows) ? rows : [])
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
      }));
    const comparePrice = (left, right) => (
      left.price - right.price
      || right.success6h - left.success6h
      || right.success24h - left.success24h
      || left.latency - right.latency
      || left.name.localeCompare(right.name)
    );
    const compareSpeed = (left, right) => (
      left.latency - right.latency
      || left.price - right.price
      || right.success6h - left.success6h
      || right.success24h - left.success24h
      || left.name.localeCompare(right.name)
    );
    if (normalizedConfig.mode === 'speed') return candidates.sort(compareSpeed);
    const cheapest = [...candidates].sort(comparePrice)[0];
    if (normalizedConfig.mode === 'balance' && cheapest) {
      const maxPrice = cheapest.price * (1 + normalizedConfig.balancePricePercent / 100);
      return candidates.sort((left, right) => {
        const leftInRange = left.price <= maxPrice;
        const rightInRange = right.price <= maxPrice;
        if (leftInRange !== rightInRange) return leftInRange ? -1 : 1;
        return leftInRange ? compareSpeed(left, right) : comparePrice(left, right);
      });
    }
    return candidates.sort(comparePrice);
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
    return getAutoSwitchBlockReason({ now, lastSwitchAt, currentGroupId, targetGroupId, stable, config }) === '';
  }

  function getAutoSwitchBlockReason({ now, lastSwitchAt, currentGroupId, targetGroupId, stable, config }) {
    if (!stable) return '推荐尚未稳定';
    if (targetGroupId == null) return '暂无推荐分组';
    if (currentGroupId === targetGroupId) return '当前密钥已经在推荐分组';
    const cooldownMs = normalizeConfig(config).cooldownMinutes * 60 * 1000;
    if (Number.isFinite(lastSwitchAt) && Number(now) - lastSwitchAt < cooldownMs) return '切换冷却中';
    return '';
  }

  function shouldLogTransition(previous, current, forced = false) {
    return forced || previous !== current;
  }

  function getSwitchBlockReason({ loading, allowWhileLoading, error, authError, winner, key, stability, requiredChecks }) {
    if (loading && !allowWhileLoading) return '正在检测';
    if (error) return String(error);
    if (authError) return String(authError);
    if (!winner) return '暂无符合条件的推荐分组';
    if (!key) return '请先读取并选择目标密钥';
    if (!stability?.stable) return `推荐尚未稳定（${Number(stability?.count) || 0}/${requiredChecks} 次）`;
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
    #${ROOT_ID} .asg-recommend{padding:9px;background:#f4f8ff;border:1px solid #cfe0ff;border-radius:6px;margin:9px 0}
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
    #${ROOT_ID} .asg-guide{margin-top:8px;color:#475467;font-size:12px}
    #${ROOT_ID} .asg-guide ol{margin:6px 0 0;padding-left:20px}
    #${ROOT_ID} details{margin-top:9px;border-top:1px solid #e4e7ec;padding-top:7px}
    #${ROOT_ID} summary{cursor:pointer;color:#475467}
    #${ROOT_ID} .asg-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px;margin-top:7px}
    #${ROOT_ID} .asg-grid label{margin:0}
    #${ROOT_ID} .asg-grid input{margin-top:3px}
    #${ROOT_ID} .asg-save{margin-top:8px}
    #${ROOT_ID} .asg-log-details{margin-top:9px;border-top:1px solid #e4e7ec;padding-top:7px}
    #${ROOT_ID} .asg-log-actions{display:flex;justify-content:flex-end;margin-top:6px}
    #${ROOT_ID} .asg-logs{margin:6px 0 0;padding:0;list-style:none;max-height:150px;overflow:auto;border-top:1px solid #eef0f3}
    #${ROOT_ID} .asg-logs li{padding:5px 0;border-bottom:1px solid #eef0f3;font-size:11px;overflow-wrap:anywhere}
    #${ROOT_ID} .asg-logs .asg-log-error{color:#b42318}
    #${ROOT_ID} .asg-list{margin:8px 0 0;padding:0;list-style:none;max-height:132px;overflow:auto;border-top:1px solid #eef0f3}
    #${ROOT_ID} .asg-list li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eef0f3}
    #${ROOT_ID} .asg-list li span:last-child{text-align:right;color:#475467;white-space:nowrap}
    #${ROOT_ID} .asg-error{color:#b42318;background:#fff4f2;border-color:#fecdca}
    #${TOGGLE_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:42px;height:42px;padding:0;border:1px solid #1456d9;border-radius:50%;background:#1456d9;color:#fff;box-shadow:0 8px 24px rgba(16,24,40,.2);font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
    #${TOGGLE_ID}[hidden]{display:none}
    #${TOGGLE_ID}:hover{background:#0f46b6}
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
      this.lastDetectionLogSignature = null;
      this.lastAuthLogSignature = '';
      this.lastErrorLogSignature = '';
      this.lastAutoSkipLogSignature = '';
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
          <label for="asg-mode-select">模式</label>
          <select id="asg-mode-select" data-field="mode"><option value="price">价格（最低价格）</option><option value="balance">平衡（低价范围内最快首字）</option><option value="speed">速度（最快首字）</option></select>
          <div class="asg-recommend" data-field="recommend"><div class="asg-muted">正在读取监控数据...</div></div>
          <label for="asg-key-select">目标密钥</label>
          <select id="asg-key-select" data-field="key"></select>
          <div class="asg-actions"><button data-action="refresh">检测</button><button data-action="switch" disabled>切换到推荐分组</button></div>
          <label class="asg-auto"><input type="checkbox" data-field="auto"> 自动切换（默认关闭）</label>
          <details class="asg-guide"><summary>快速开始</summary><ol><li>选择价格、平衡或速度模式。</li><li>选择目标密钥并点击“检测”。</li><li>确认推荐分组后点击切换；自动切换可在设置中开启。</li></ol></details>
          <details><summary>设置</summary>
            <div class="asg-grid">
              <label>6h 最低可用率<input type="number" min="0" max="1" step="0.01" data-setting="minSuccess6h"></label>
              <label>24h 最低可用率<input type="number" min="0" max="1" step="0.01" data-setting="minSuccess24h"></label>
              <label>连续通过次数<input type="number" min="1" max="5" step="1" data-setting="consecutiveChecks"></label>
              <label>检测间隔（秒）<input type="number" min="10" max="3600" step="1" data-setting="pollIntervalSeconds"></label>
              <label>切换冷却（分钟）<input type="number" min="0" max="1440" step="1" data-setting="cooldownMinutes"></label>
              <label>平衡价格范围（%）<input type="number" min="0" max="500" step="1" data-setting="balancePricePercent"></label>
            </div>
            <label class="asg-auto"><input type="checkbox" data-setting="requireNoWarnings"> 排除监控警告</label>
            <button class="asg-save" data-action="save-settings">保存设置</button>
          </details>
          <details class="asg-log-details"><summary>使用日志</summary><div class="asg-log-actions"><button data-action="clear-logs">清空日志</button></div><ul class="asg-logs" data-field="logs"></ul></details>
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
        if (action === 'refresh') this.refresh(true);
        if (action === 'switch') this.switchToRecommendation(false);
        if (action === 'save-settings') this.saveSettings();
        if (action === 'clear-logs') this.clearLogs();
      });
      this.toggleButton.addEventListener('click', () => this.setMinimized(false));
      this.panel.querySelector('[data-field="key"]').addEventListener('change', (event) => {
        this.selectedKeyId = event.target.value || null;
        storageSet('selectedKeyId', this.selectedKeyId);
        this.renderActionState();
      });
      this.panel.querySelector('[data-field="mode"]').addEventListener('change', (event) => {
        this.config.mode = normalizeGroupMode(event.target.value);
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
      this.panel.querySelector('[data-field="mode"]').value = this.config.mode;
    }

    saveSettings() {
      const next = {};
      for (const input of this.panel.querySelectorAll('[data-setting]')) {
        next[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
      }
      next.autoSwitch = this.config.autoSwitch;
      next.mode = this.config.mode;
      this.config = normalizeConfig(next);
      storageSet('config', this.config);
      this.syncSettingsInputs();
      if (this.timer) window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.refresh(), this.config.pollIntervalSeconds * 1000);
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
      this.loading = true;
      this.authError = '';
      this.keyCount = null;
      this.setStatus('检测中...');
      this.renderActionState();
      try {
        const summary = await fetchMonitorSummary();
        let keys = null;
        try {
          keys = await fetchAllKeys();
        } catch (error) {
          this.keys = [];
          this.authError = error?.status === 401
            ? (getAuthToken() ? '密钥接口返回 401：当前登录已失效，请重新登录后刷新' : '未找到页面登录令牌，请在此 Chrome 配置中重新登录后刷新')
            : (error instanceof Error ? `密钥读取失败：${error.message}` : '密钥读取失败');
        }
        if (this.authError && shouldLogTransition(this.lastAuthLogSignature, this.authError, forceLog)) {
          this.log('error', this.authError);
        } else if (!this.authError && this.lastAuthLogSignature) {
          this.log('info', '密钥读取已恢复');
        }
        this.lastAuthLogSignature = this.authError;
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
        const detectionSignature = `${this.config.mode}:${winner?.groupId ?? 'none'}`;
        if (shouldLogTransition(this.lastDetectionLogSignature, detectionSignature, forceLog)) {
          this.log('info', `检测完成，推荐${winner?.name || '暂无分组'}`);
        }
        this.lastDetectionLogSignature = detectionSignature;
        if (this.lastErrorLogSignature) this.log('info', '监控检测已恢复');
        this.lastErrorLogSignature = '';
        if (this.config.autoSwitch) await this.switchToRecommendation(true);
      } catch (error) {
        this.error = error instanceof Error ? error.message : '检测失败';
        if (shouldLogTransition(this.lastErrorLogSignature, this.error, forceLog)) this.log('error', this.error);
        this.lastErrorLogSignature = this.error;
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
      const blockReason = getSwitchBlockReason({
        loading: this.loading,
        allowWhileLoading: fromAuto,
        error: this.error,
        authError: this.authError,
        winner,
        key,
        stability: this.stability,
        requiredChecks: this.config.consecutiveChecks,
      });
      if (blockReason) {
        if (fromAuto) {
          if (shouldLogTransition(this.lastAutoSkipLogSignature, blockReason)) this.log('info', `自动切换跳过：${blockReason}`);
          this.lastAutoSkipLogSignature = blockReason;
        } else {
          this.setStatus(blockReason, Boolean(this.error || this.authError));
        }
        return false;
      }
      const now = Date.now();
      if (fromAuto && !canAutoSwitch({
        now,
        lastSwitchAt: Number(this.lastSwitch.at),
        currentGroupId: key.groupId,
        targetGroupId: winner.groupId,
        stable: this.stability.stable,
        config: this.config,
      })) {
        const reason = getAutoSwitchBlockReason({
          now,
          lastSwitchAt: Number(this.lastSwitch.at),
          currentGroupId: key.groupId,
          targetGroupId: winner.groupId,
          stable: this.stability.stable,
          config: this.config,
        });
        if (shouldLogTransition(this.lastAutoSkipLogSignature, reason)) this.log('info', `自动切换跳过：${reason}`);
        this.lastAutoSkipLogSignature = reason;
        return false;
      }
      if (!fromAuto && !window.confirm(`将密钥“${key.name}”切换到 ${winner.name}（${winner.price}x），是否继续？`)) return false;
      try {
        await updateKeyGroup(key.id, winner.groupId);
        key.groupId = winner.groupId;
        key.groupName = winner.name;
        this.lastSwitch = { at: Date.now(), keyId: key.id, groupId: winner.groupId };
        this.lastAutoSkipLogSignature = '';
        storageSet('lastSwitch', this.lastSwitch);
        this.setStatus(`已切换到 ${winner.name}`);
        this.log('info', `已切换到${winner.name}`);
        this.renderData();
        return true;
      } catch (error) {
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
      recommend.replaceChildren();
      if (!winner) {
        const empty = document.createElement('div');
        empty.className = 'asg-muted';
        empty.textContent = '没有符合当前可靠性条件的分组';
        recommend.appendChild(empty);
      } else {
        const title = document.createElement('strong');
        title.textContent = `${GROUP_MODE_LABELS[this.config.mode]}模式 · ${winner.name} · ${winner.price}x`;
        const metrics = document.createElement('div');
        metrics.className = 'asg-metrics';
        metrics.textContent = `6h ${formatPercent(winner.success6h)} · 24h ${formatPercent(winner.success24h)} · 首Token ${formatLatency(winner.latency)}${this.stability.stable ? ' · 已稳定' : ` · ${this.stability.count}/${this.config.consecutiveChecks} 次`}`;
        recommend.append(title, metrics);
      }
      const keyInfo = this.authError || (this.keyCount !== null ? `已读取 ${this.keyCount} 个密钥` : '');
      this.setStatus(this.error || keyInfo || (this.lastUpdated ? `最近检测：${this.lastUpdated.toLocaleTimeString()}` : '准备检测'), Boolean(this.error || this.authError));
      this.renderKeys();
      this.renderCandidates();
      this.renderLogs();
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
      const reason = getSwitchBlockReason({
        loading: this.loading,
        error: this.error,
        authError: this.authError,
        winner,
        key,
        stability: this.stability,
        requiredChecks: this.config.consecutiveChecks,
      });
      button.disabled = Boolean(reason);
      button.title = reason || `切换到 ${winner.name}`;
    }
  }

  return {
    DEFAULT_CONFIG,
    GROUP_MODE_LABELS,
    normalizeConfig,
    normalizeGroupMode,
    rankCandidates,
    createStabilityState,
    advanceStability,
    canAutoSwitch,
    getAutoSwitchBlockReason,
    shouldLogTransition,
    getSwitchBlockReason,
    projectKeys,
    buildAuthHeaders,
    buildApiHeaders,
    mergeKeyPages,
    appendLogEntries,
    formatLogLine,
    start() {
      if (location.hostname === 'aihub.top') new Controller().start();
    },
  };
});
