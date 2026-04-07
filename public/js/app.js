class PriceMonitorApp {
  constructor() {
    this.ws = null;
    this.subdomains = [];
    this.isMonitoring = false;
    this.companyConfig = {};
    this.priceCheckCount = 0;
    this.orderPlaceCount = 0;
    this.browserOpen = false;
    this.lastCycleTimeMs = 0;
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.loadInitialData();
    this.loadCompanyConfig();
    this.loadAccounts();
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.addLog('Connected to server', 'success');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.addLog('Disconnected from server', 'warning');
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'log':
        this.addLog(data.data.message, data.data.type);
        break;
      case 'subdomains':
        this.subdomains = data.data;
        this.renderSubdomains();
        break;
      case 'orders_complete':
        this.handleOrdersComplete(data.data);
        break;
      case 'browser_opened':
        this.browserOpen = true;
        this.updateButtonStates();
        break;
      case 'browser_closed':
        this.browserOpen = false;
        this.updateStatus(false);
        break;
      case 'price_check':
        this.priceCheckCount++;
        this.updateCounts();
        break;
      case 'order_place':
        this.orderPlaceCount++;
        this.updateCounts();
        break;
      case 'cycle_time':
        this.lastCycleTimeMs = data.data.timeMs;
        this.updateCounts();
        break;
    }
  }

  updateCounts() {
    document.getElementById('priceCheckCount').textContent = `P: ${this.priceCheckCount}`;
    document.getElementById('orderPlaceCount').textContent = `O: ${this.orderPlaceCount}`;
    const cycleEl = document.getElementById('cycleTime');
    if (cycleEl && this.lastCycleTimeMs > 0) {
      cycleEl.textContent = `Cycle: ${this.lastCycleTimeMs}ms`;
    }
  }

  async loadInitialData() {
    try {
      const subdomainsRes = await fetch('/api/subdomains');
      this.subdomains = await subdomainsRes.json();

      const oqRes = await fetch('/api/order-quantities');
      this.orderQuantities = await oqRes.json();

      this.renderSubdomains();

      const statusRes = await fetch('/api/monitor/status');
      const status = await statusRes.json();
      this.browserOpen = status.browserOpen || false;
      this.updateStatus(status.isMonitoring);

      const logsRes = await fetch('/api/logs');
      const logs = await logsRes.json();
      logs.forEach(log => this.addLog(log.message, log.type, false));

    } catch (error) {
      console.error('Error loading initial data:', error);
      this.addLog('Error loading initial data', 'error');
    }
  }

  async loadCompanyConfig() {
    try {
      const res = await fetch('/api/companies');
      const companies = await res.json();
      this.companyConfig = {};
      for (const [symbol, config] of Object.entries(companies)) {
        this.companyConfig[symbol] = {
          enabled: config.enabled,
          targetPrice: config.targetPrice,
          qty: config.qty || 10
        };
      }
    } catch (error) {
      console.error('Error loading companies from server:', error);
    }

    // Server config (companies.js) is the source of truth — clear stale localStorage
    localStorage.removeItem('companyConfig');

    this.renderCompanyConfig();

    // Auto-generate and push scripts to server on load
    const priceScript = this.generatePriceScript();
    document.getElementById('priceScript').value = priceScript;
    fetch('/api/price-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: priceScript })
    });

    const orderScript = this.generateOrderScript();
    document.getElementById('orderScript').value = orderScript;
    fetch('/api/order-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: orderScript })
    });
  }

  async loadAccounts() {
    try {
      const res = await fetch('/api/accounts');
      this.accounts = await res.json();
      this.populateDomainOptions();
    } catch (error) {
      console.error('Error loading accounts:', error);
      this.accounts = [];
    }
  }

  populateDomainOptions() {
    const domains = [...new Set((this.accounts || []).map(a => a.domain))];
    const domainSelect = document.getElementById('subdomainDomain');
    if (!domainSelect || domains.length === 0) return;

    domainSelect.innerHTML = domains.map(d => `<option value="${d}">${d}</option>`).join('');
    domainSelect.innerHTML += '<option value="__custom__">Custom...</option>';

    domainSelect.addEventListener('change', () => {
      const customInput = document.getElementById('subdomainDomainCustom');
      if (customInput) {
        customInput.style.display = domainSelect.value === '__custom__' ? '' : 'none';
      }
    });
  }

  renderCompanyConfig() {
    const container = document.getElementById('companiesConfig');
    if (!container) return;

    container.innerHTML = Object.entries(this.companyConfig).map(([company, config]) => `
      <div class="company-chip ${config.enabled ? '' : 'disabled'}">
        <label>
          <input type="checkbox" id="chk_${company}" ${config.enabled ? 'checked' : ''}
            onchange="app.quickSaveCompany()"> ${company}
        </label>
        <input type="number" id="price_${company}" value="${config.targetPrice}" step="0.1"
          onchange="app.quickSaveCompany()">
      </div>
    `).join('');
  }

  quickSaveCompany() {
    // Debounce saves
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveCompanyConfig(), 300);
  }

  saveCompanyConfig() {
    const companies = Object.keys(this.companyConfig);
    companies.forEach(company => {
      const checkbox = document.getElementById(`chk_${company}`);
      const priceInput = document.getElementById(`price_${company}`);
      this.companyConfig[company] = {
        enabled: checkbox ? checkbox.checked : false,
        targetPrice: priceInput ? parseFloat(priceInput.value) : 0
      };
    });

    fetch('/api/company-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.companyConfig)
    });

    companies.forEach(company => {
      const price = this.companyConfig[company].targetPrice;
      fetch(`/api/symbol-price/${company}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price })
      });
    });

    const newScript = this.generatePriceScript();
    document.getElementById('priceScript').value = newScript;
    fetch('/api/price-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: newScript })
    });

    this.renderCompanyConfig();
    this.renderSubdomains();
    this.addLog('Config saved', 'success');
  }

  toggleAddForm() {
    const form = document.getElementById('addAccountForm');
    form.style.display = form.style.display === 'none' ? '' : 'none';
  }

  async addSubdomain() {
    const tms = document.getElementById('subdomainTms').value.trim();
    const name = document.getElementById('subdomainName').value.trim();
    const role = document.getElementById('subdomainRole').value;
    const type = document.getElementById('subdomainType').value;

    const domainSelect = document.getElementById('subdomainDomain');
    const customDomainInput = document.getElementById('subdomainDomainCustom');
    let domain = domainSelect.value;
    if (domain === '__custom__' && customDomainInput) {
      domain = customDomainInput.value.trim();
    }

    if (!tms || !name || !domain) {
      alert('Please enter TMS subdomain, name, and domain');
      return;
    }

    const url = `https://${tms}.${domain}/`;
    const scriptId = tms;
    const accountId = name;

    const broker = document.getElementById('subdomainBroker')?.value.trim() || '';
    const acntid = document.getElementById('subdomainAcntid')?.value.trim() || '';
    const clientAcc = document.getElementById('subdomainClientAcc')?.value.trim() || '';

    const body = { url, name, scriptId, accountId, domain, role, type, enabled: true };
    if (type === 'ats') {
      body.broker = broker;
      body.acntid = acntid;
      body.clientAcc = clientAcc;
    }

    try {
      const res = await fetch('/api/subdomains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await res.json();
      if (result.success) {
        document.getElementById('subdomainTms').value = '';
        document.getElementById('subdomainName').value = '';
        if (document.getElementById('subdomainBroker')) document.getElementById('subdomainBroker').value = '';
        if (document.getElementById('subdomainAcntid')) document.getElementById('subdomainAcntid').value = '';
        if (document.getElementById('subdomainClientAcc')) document.getElementById('subdomainClientAcc').value = '';
        this.addLog(`Added: ${name}`, 'success');
      }
    } catch (error) {
      this.addLog('Error adding account', 'error');
    }
  }

  toggleAtsFields() {
    const type = document.getElementById('subdomainType').value;
    const atsFields = document.getElementById('atsInlineFields');
    if (atsFields) {
      atsFields.style.display = type === 'ats' ? '' : 'none';
    }
  }

  async syncSubdomains() {
    try {
      const res = await fetch('/api/subdomains/sync', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        this.addLog(`Synced: +${result.added} (${result.total} total)`, 'success');
      }
    } catch (error) {
      this.addLog('Error syncing', 'error');
    }
  }

  async openSingleAccount(accountId) {
    try {
      const res = await fetch(`/api/browser/open/${encodeURIComponent(accountId)}`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        this.browserOpen = true;
        this.updateButtonStates();
        this.addLog(`Opened ${accountId}`, 'success');
      } else {
        this.addLog(`Error: ${result.error}`, 'error');
      }
    } catch (error) {
      this.addLog(`Error opening ${accountId}`, 'error');
    }
  }

  async removeSubdomain(id) {
    if (!confirm('Remove this account?')) return;
    try {
      await fetch(`/api/subdomains/${id}`, { method: 'DELETE' });
      this.addLog('Account removed', 'success');
    } catch (error) {
      console.error('Error removing:', error);
    }
  }

  async updateSubdomainRole(id, role) {
    const subdomain = this.subdomains.find(s => s.id === id);
    if (!subdomain) return;
    try {
      await fetch('/api/subdomains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...subdomain, role })
      });
    } catch (error) {
      console.error('Error updating role:', error);
    }
  }

  async toggleSubdomainRole(id, aspect, checked) {
    const subdomain = this.subdomains.find(s => s.id === id);
    if (!subdomain) return;

    const currentRole = subdomain.role || 'both';
    let hasPrice = currentRole === 'price' || currentRole === 'both';
    let hasOrder = currentRole === 'order' || currentRole === 'both';

    if (aspect === 'price') hasPrice = checked;
    if (aspect === 'order') hasOrder = checked;

    let newRole;
    if (hasPrice && hasOrder) newRole = 'both';
    else if (hasPrice) newRole = 'price';
    else if (hasOrder) newRole = 'order';
    else newRole = 'none';

    await this.updateSubdomainRole(id, newRole);
  }

  async checkAll(aspect, checked) {
    for (const subdomain of this.subdomains) {
      await this.toggleSubdomainRole(subdomain.id, aspect, checked);
    }
    this.addLog(`${checked ? 'Enabled' : 'Disabled'} all ${aspect}`, 'success');
  }

  async checkAllSymbol(symbol, checked) {
    // Toggle a symbol across ALL accounts
    const promises = this.subdomains.map(async (subdomain) => {
      const orderKey = this.getOrderKey(subdomain);
      await this.toggleSymbol(orderKey, symbol, checked);
    });
    // toggleSymbol already reloads orderQuantities, but we batch here
    for (const subdomain of this.subdomains) {
      const orderKey = this.getOrderKey(subdomain);
      if (checked) {
        const accountSymbols = (this.orderQuantities || {})[orderKey] || {};
        const existing = accountSymbols[symbol];
        const company = this.companyConfig[symbol] || {};
        const config = {
          ORDER_QTY: (existing && existing.ORDER_QTY) || company.qty || 10,
          MAX_ORDER_QTY: (existing && existing.MAX_ORDER_QTY) || 1000,
          ORDER_PRICE: (existing && existing.ORDER_PRICE) || company.targetPrice || 0,
          BELOW_PRICE: (existing && existing.BELOW_PRICE) || 0,
          COLLATERAL: (existing && existing.COLLATERAL) || 0
        };
        await fetch(`/api/order-quantities/${orderKey}/${symbol}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
      } else {
        await fetch(`/api/order-quantities/${orderKey}/${symbol}`, { method: 'DELETE' });
      }
    }
    const oqRes = await fetch('/api/order-quantities');
    this.orderQuantities = await oqRes.json();
    this.renderSubdomains();
    this.addLog(`${checked ? 'Enabled' : 'Disabled'} ${symbol} on all accounts`, 'success');
  }

  getOrderKey(subdomain) {
    return subdomain.type === 'ats' ? subdomain.accountId : subdomain.scriptId;
  }

  renderSubdomains() {
    const container = document.getElementById('subdomainsList');

    if (this.subdomains.length === 0) {
      container.innerHTML = '<div class="empty-state">No accounts configured</div>';
      return;
    }

    // Check-all bar: one checkbox per symbol to toggle across all accounts
    const checkAllItems = Object.entries(this.companyConfig).map(([sym]) => {
      // Check if this symbol is enabled on ALL accounts
      const allEnabled = this.subdomains.every(s => {
        const key = this.getOrderKey(s);
        const syms = (this.orderQuantities || {})[key] || {};
        return sym in syms && syms[sym].enabled !== false;
      });
      return `<label class="check-all-item">
        <input type="checkbox" ${allEnabled ? 'checked' : ''}
          onchange="app.checkAllSymbol('${sym}', this.checked)"> ${sym}
      </label>`;
    }).join('');

    // Check if all accounts are enabled
    const allAccountsEnabled = this.subdomains.every(s => s.enabled);

    const checkAllBar = `<div class="check-all-bar">
      <label class="check-all-item" style="margin-right: 8px; border-right: 1px solid #334155; padding-right: 12px;">
        <input type="checkbox" ${allAccountsEnabled ? 'checked' : ''}
          onchange="app.toggleAllAccounts(this.checked)"> All Accounts
      </label>
      ${checkAllItems}
    </div>`;

    // Account cards
    const cards = this.subdomains.map(subdomain => {
      const role = subdomain.role || 'both';
      const type = subdomain.type || 'nepse';
      const status = subdomain.status || 'idle';

      const orderKey = this.getOrderKey(subdomain);
      const accountSymbols = (this.orderQuantities || {})[orderKey] || {};
      const prices = subdomain.prices || {};

      // Timing
      const fetchMs = subdomain.fetchTimeMs;
      const fetchClass = fetchMs != null ? (fetchMs < 500 ? 'fast' : fetchMs < 2000 ? 'medium' : 'slow') : '';
      const fetchText = fetchMs != null ? `${fetchMs}ms` : '';

      // Detail rows — always visible
      const detailRows = Object.entries(this.companyConfig).map(([sym, cfg]) => {
        const isEnabled = sym in accountSymbols && accountSymbols[sym].enabled !== false;
        const symCfg = accountSymbols[sym] || {};
        const p = prices[sym];
        const ltp = p ? p.ltp : '-';
        const target = symCfg.ORDER_PRICE || cfg.targetPrice || '-';
        const ltpClass = p ? (p.matched ? 'price-match' : 'price-above') : '';
        const qtyText = isEnabled ? `${symCfg.ORDER_QTY || '-'} / max ${symCfg.MAX_ORDER_QTY || '-'}` : '';

        return `<div class="detail-row">
          <label class="detail-check">
            <input type="checkbox" ${isEnabled ? 'checked' : ''}
              onchange="app.toggleSymbol('${orderKey}', '${sym}', this.checked)"> ${sym}
          </label>
          <span class="detail-ltp ${ltpClass}">${ltp}</span>
          <span class="detail-target">/ ${target}</span>
          <span class="detail-qty">${qtyText}</span>
        </div>`;
      }).join('');

      // ATS info
      const atsInfo = type === 'ats' && subdomain.broker
        ? `<span class="badge broker">${subdomain.broker}</span>` : '';

      return `
        <div class="account-card ${status} ${subdomain.enabled ? '' : 'disabled'}">
          <div class="account-header">
            <input type="checkbox" class="account-enable-cb" ${subdomain.enabled ? 'checked' : ''}
              onchange="app.toggleAccountEnabled('${subdomain.id}', this.checked)" title="Enable/Disable account">
            <span class="account-type-dot ${type}"></span>
            <span class="account-name">${subdomain.name}</span>
            <div class="account-badges">
              <span class="badge ${type}">${type}</span>
              <span class="badge domain">${subdomain.domain || ''}</span>
              ${atsInfo}
            </div>
            <div class="account-role-checks">
              <label class="role-mini price">
                <input type="checkbox" ${role === 'price' || role === 'both' ? 'checked' : ''}
                  onchange="app.toggleSubdomainRole('${subdomain.id}', 'price', this.checked)"> P
              </label>
              <label class="role-mini order">
                <input type="checkbox" ${role === 'order' || role === 'both' ? 'checked' : ''}
                  onchange="app.toggleSubdomainRole('${subdomain.id}', 'order', this.checked)"> O
              </label>
            </div>
            <div class="account-timing">
              <span class="timing-sm ${fetchClass}">${fetchText}</span>
            </div>
            <div class="account-actions">
              <button class="btn btn-xs" onclick="app.openSingleAccount('${subdomain.accountId}')">Open</button>
              <button class="btn btn-xs btn-danger" onclick="app.removeSubdomain('${subdomain.id}')">X</button>
            </div>
          </div>
          <div class="account-detail">
            ${detailRows}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = checkAllBar + cards;
  }

  loadDefaultPriceScript() {
    const script = this.generatePriceScript();
    document.getElementById('priceScript').value = script;
    this.setPriceScript();
    this.addLog('Price script loaded', 'success');
  }

  loadDefaultOrderScript() {
    const script = this.generateOrderScript();
    document.getElementById('orderScript').value = script;
    this.setOrderScript();
    this.addLog('Order script loaded', 'success');
  }

  generatePriceScript() {
    const enabledCompanies = Object.entries(this.companyConfig)
      .filter(([_, config]) => config.enabled)
      .map(([company, config]) => `'${company}': { enabled: true, target: ${config.targetPrice} }`)
      .join(',\n    ');

    return `// Auto-generated Price Check Script
// Uses full TMS headers from localStorage for authentication

const COMPANIES = {
    ${enabledCompanies}
};

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

var xsref_token = getCookie("XSRF-TOKEN");
var auth_token = localStorage.getItem("id_token");
var host = document.location.origin;
var referral = host + "/tms/me/memberclientorderentry";

// Extract membercode from hostname (e.g. tms93 → 93)
var memberCode = (document.location.hostname.match(/tms(\\d+)/) || [])[1] || '';

var hostSessionId = '';
try { hostSessionId = btoa(localStorage.getItem("suid")); } catch(e) {}

var requestOwner = '';
try { requestOwner = JSON.parse(localStorage.getItem("__usrsession__")).user.id; } catch(e) {}

var header = {
    "accept": "application/json, text/plain, */*",
    "host-session-id": hostSessionId,
    "request-owner": requestOwner,
    "membercode": memberCode,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
};

if (xsref_token) {
    header["x-xsrf-token"] = xsref_token;
} else if (auth_token) {
    header["Authorization"] = "Bearer " + auth_token;
}

var httpFetchGet = {
    "credentials": "include",
    "headers": header,
    "referrer": referral,
    "method": "GET",
    "mode": "cors"
};

async function refreshToken() {
    try {
        var refreshHeader = Object.assign({}, header);
        refreshHeader["content-type"] = "application/json";
        var res = await fetch(host + "/tmsapi/authApi/authenticate/refresh", {
            method: "POST",
            headers: refreshHeader,
            referrer: host + "/tms/me/memberclientorderentry",
            referrerPolicy: "strict-origin-when-cross-origin",
            body: null,
            mode: "cors",
            credentials: "include"
        });
        var data = await res.json();
        if (data.status === 200 && data.data) {
            localStorage.setItem("id_token", data.data.access_token);
            if (data.data.refresh_token) localStorage.setItem("refresh_token", data.data.refresh_token);
            auth_token = data.data.access_token;
            if (data.data.xsrf_token) xsref_token = data.data.xsrf_token;
            header["x-xsrf-token"] = xsref_token;
            header["Authorization"] = "Bearer " + auth_token;
            return true;
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function checkPrices() {
    var totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;

    var lastSymbol = null;
    var lastLtp = 0;
    var allPrices = {};

    for (const [symbol, config] of Object.entries(COMPANIES)) {
        if (!config.enabled) continue;

        var scrip = totalScripList.find(s => s.symbol === symbol);
        if (!scrip) {
            console.warn('Scrip not found:', symbol);
            continue;
        }

        try {
            var url = host + "/tmsapi/rtApi/stock/validation/ohlc/" + scrip.id + "/" + scrip.isin;
            var res = await fetch(url, httpFetchGet);
            var data = await res.json();

            // Handle 401 — refresh token and retry once
            if (data.status === "401" || data.status === 401) {
                var refreshed = await refreshToken();
                if (refreshed) {
                    res = await fetch(url, httpFetchGet);
                    data = await res.json();
                }
            }

            // Handle 500 OAUTH — refresh token and retry once
            if (data.status === "500" && data.level === "OAUTH") {
                var refreshed = await refreshToken();
                if (refreshed) {
                    res = await fetch(url, httpFetchGet);
                    data = await res.json();
                }
            }

            if (data.status === "200" && data.data && data.data.ltp) {
                var ltp = parseFloat(data.data.ltp);
                lastSymbol = symbol;
                lastLtp = ltp;
                allPrices[symbol] = { ltp: ltp, target: config.target, matched: ltp <= config.target };
                console.log(symbol + ': ' + ltp + ' (target: ' + config.target + ') [id:' + scrip.id + ']');

                if (ltp <= config.target) {
                    return JSON.stringify({
                        company: symbol,
                        price: ltp,
                        target: config.target,
                        scripId: scrip.id,
                        matched: true,
                        allPrices: allPrices
                    });
                }
            }
        } catch (e) {
            console.error('Error checking ' + symbol + ':', e);
        }
    }

    var reportSymbol = lastSymbol || Object.keys(COMPANIES)[0];
    return JSON.stringify({
        company: reportSymbol,
        price: lastLtp,
        matched: false,
        allPrices: allPrices
    });
}

return await checkPrices();`;
  }

  generateOrderScript() {
    return `// Auto-generated Order Script
// Full HTTP POST order placement matching working TMS script

var company = window.MATCHED_COMPANY || 'HFIN';
var orderQty = window.ORDER_QTY || 10;
var orderPrice = window.ORDER_PRICE || 0;
var maxOrderQty = window.MAX_ORDER_QTY || 100;

console.log('Placing order for: ' + company + ' qty=' + orderQty + ' price=' + orderPrice);

// --- Auth & Headers (same as working script) ---
function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

var xsref_token = getCookie("XSRF-TOKEN");
var auth_token = localStorage.getItem("id_token");
var host = document.location.origin;
var referral = host + "/tms/me/memberclientorderentry";
var orderBook_url = host + "/tmsapi/orderApi/order/";

var hostSessionId = '';
try { hostSessionId = btoa(localStorage.getItem("suid")); } catch(e) {}
var requestOwner = '';
try { requestOwner = JSON.parse(localStorage.getItem("__usrsession__")).user.id; } catch(e) {}

var header = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "host-session-id": hostSessionId,
    "request-owner": requestOwner,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
};
if (xsref_token) {
    header["x-xsrf-token"] = xsref_token;
} else if (auth_token) {
    header["Authorization"] = "Bearer " + auth_token;
}

async function refreshToken() {
    try {
        var res = await fetch(host + "/tmsapi/authApi/authenticate/refresh", {
            method: "POST", headers: header, referrer: referral,
            referrerPolicy: "strict-origin-when-cross-origin",
            body: null, mode: "cors", credentials: "include"
        });
        var data = await res.json();
        if (data.status === 200 && data.data) {
            localStorage.setItem("id_token", data.data.access_token);
            auth_token = data.data.access_token;
            if (data.data.xsrf_token) xsref_token = data.data.xsrf_token;
            header["x-xsrf-token"] = xsref_token;
            header["Authorization"] = "Bearer " + auth_token;
            return true;
        }
        return true;
    } catch(e) { return false; }
}

// --- Get scrip & client data ---
var totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
var scrip = totalScripList.find(function(s) { return s.symbol === company; });
if (!scrip) {
    return { success: false, message: 'Scrip not found: ' + company };
}

var sessionData = JSON.parse(localStorage.getItem("__usrsession__"));
var clientData = sessionData.clientDealerMember.client;

// --- Build order body (matching working script structure) ---
var orderBody = {
    orderBook: {
        orderBookExtensions: [{
            orderTypes: { id: 1, orderTypeCode: "LMT" },
            disclosedQuantity: 0,
            orderValidity: { id: 1, orderValidityCode: "DAY" },
            triggerPrice: 0,
            orderPrice: parseFloat((orderPrice * 1.02).toFixed(3).slice(0, -2)),
            orderQuantity: orderQty,
            remainingOrderQuantity: orderQty,
            marketType: { id: 2, marketType: "Continuous" }
        }],
        exchange: { id: 1 },
        dnaConnection: {},
        dealer: {},
        member: {},
        productType: { id: 1, productCode: "CNC" },
        instrumentType: { id: 1, code: "EQ" },
        buyOrSell: 1,
        client: clientData,
        security: {
            id: scrip.id,
            exchangeSecurityId: scrip.exchangeSecurityId,
            marketProtectionPercentage: 0,
            divisor: 100,
            boardLotQuantity: 1,
            tickSize: 0.1
        },
        accountType: 1,
        cpMemberId: 0
    },
    orderPlacedBy: 2,
    exchangeOrderId: null
};

// --- Place order ---
async function placeOrder(body) {
    var res = await fetch(orderBook_url, {
        credentials: "include",
        headers: header,
        referrer: referral,
        body: JSON.stringify(body),
        method: "POST",
        mode: "cors"
    });
    return res.json();
}

try {
    var result = await placeOrder(orderBody);

    // Handle 401 - refresh and retry
    if (result.status === "401" || result.status === 401) {
        await refreshToken();
        result = await placeOrder(orderBody);
    }

    if (result.status === "200") {
        console.log('Order placed successfully for ' + company);
        return { success: true, company: company, scripId: scrip.id, response: result };
    } else {
        console.error('Order failed:', result);
        return { success: false, company: company, message: result.message || result.statusMessage || JSON.stringify(result).substring(0, 300), response: result };
    }
} catch(e) {
    console.error('Order error:', e);
    return { success: false, company: company, message: e.message };
}`;
  }

  async setPriceScript() {
    const script = document.getElementById('priceScript').value.trim();
    if (!script) return;

    try {
      await fetch('/api/price-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      });
      this.addLog('Price script saved', 'success');
    } catch (error) {
      this.addLog('Error saving price script', 'error');
    }
  }

  async setOrderScript() {
    const script = document.getElementById('orderScript').value.trim();
    if (!script) return;

    try {
      await fetch('/api/order-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      });
      this.addLog('Order script saved', 'success');
    } catch (error) {
      this.addLog('Error saving order script', 'error');
    }
  }

  async openTMS() {
    this.saveCompanyConfig();

    const openTmsBtn = document.getElementById('openTmsBtn');
    openTmsBtn.disabled = true;
    openTmsBtn.textContent = 'Opening...';

    try {
      const res = await fetch('/api/browser/open', { method: 'POST' });
      const result = await res.json();

      if (result.success) {
        this.browserOpen = true;
        this.updateButtonStates();
        this.addLog('TMS opened - log in, then Start', 'success');
      } else {
        openTmsBtn.disabled = false;
        openTmsBtn.textContent = '1. Open TMS';
        this.addLog(`Error: ${result.error}`, 'error');
        alert(result.error);
      }
    } catch (error) {
      openTmsBtn.disabled = false;
      openTmsBtn.textContent = '1. Open TMS';
      this.addLog('Error opening TMS', 'error');
    }
  }

  async startMonitoring() {
    this.saveCompanyConfig();

    try {
      const res = await fetch('/api/monitor/start', { method: 'POST' });
      const result = await res.json();

      if (result.success) {
        this.updateStatus(true);
        this.priceCheckCount = 0;
        this.orderPlaceCount = 0;
        this.updateCounts();
        this.addLog('Monitoring started', 'success');
      } else {
        this.addLog(`Error: ${result.error}`, 'error');
        alert(result.error);
      }
    } catch (error) {
      this.addLog('Error starting monitoring', 'error');
    }
  }

  async stopMonitoring() {
    try {
      await fetch('/api/monitor/stop', { method: 'POST' });
      this.browserOpen = false;
      this.updateStatus(false);
      this.addLog('Stopped', 'success');
    } catch (error) {
      this.addLog('Error stopping', 'error');
    }
  }

  async closeBrowser() {
    try {
      await fetch('/api/browser/close', { method: 'POST' });
      this.browserOpen = false;
      this.updateStatus(false);
      this.addLog('Browser closed', 'success');
    } catch (error) {
      this.addLog('Error closing browser', 'error');
    }
  }

  async toggleAllAccounts(enabled) {
    for (const subdomain of this.subdomains) {
      subdomain.enabled = enabled;
      await fetch(`/api/subdomains/${subdomain.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
    }
    this.renderSubdomains();
    this.addLog(`${enabled ? 'Enabled' : 'Disabled'} all accounts`, 'success');
  }

  async toggleAccountEnabled(id, enabled) {
    try {
      await fetch(`/api/subdomains/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      // Update local state
      const s = this.subdomains.find(s => s.id === id);
      if (s) s.enabled = enabled;
      this.renderSubdomains();
    } catch (error) {
      this.addLog('Error toggling account', 'error');
    }
  }

  updateButtonStates() {
    const openTmsBtn = document.getElementById('openTmsBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (this.isMonitoring) {
      openTmsBtn.disabled = true;
      openTmsBtn.textContent = '1. Open TMS';
      startBtn.disabled = true;
      stopBtn.disabled = false;
      closeBtn.disabled = false;
    } else if (this.browserOpen) {
      openTmsBtn.disabled = true;
      openTmsBtn.textContent = 'TMS Opened';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      closeBtn.disabled = false;
    } else {
      openTmsBtn.disabled = false;
      openTmsBtn.textContent = '1. Open TMS';
      startBtn.disabled = true;
      stopBtn.disabled = true;
      closeBtn.disabled = true;
    }
  }

  updateStatus(isMonitoring) {
    this.isMonitoring = isMonitoring;
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    if (isMonitoring) {
      indicator.className = 'status-indicator monitoring';
      statusText.textContent = 'Monitoring';
    } else {
      indicator.className = 'status-indicator';
      statusText.textContent = this.browserOpen ? 'Ready' : 'Idle';
    }

    this.updateButtonStates();
  }

  addLog(message, type = 'info', scroll = true) {
    const logsList = document.getElementById('logsList');
    const timestamp = new Date().toLocaleTimeString();

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="log-timestamp">${timestamp}</span>${message}`;

    logsList.appendChild(logEntry);

    if (scroll) {
      logsList.scrollTop = logsList.scrollHeight;
    }

    while (logsList.children.length > 500) {
      logsList.removeChild(logsList.firstChild);
    }
  }

  async clearLogs() {
    await fetch('/api/logs', { method: 'DELETE' });
    document.getElementById('logsList').innerHTML = '';
    this.priceCheckCount = 0;
    this.orderPlaceCount = 0;
    this.updateCounts();
  }

  async toggleSymbol(orderKey, symbol, checked) {
    if (checked) {
      const accountSymbols = (this.orderQuantities || {})[orderKey] || {};
      const existing = accountSymbols[symbol];
      const company = this.companyConfig[symbol] || {};
      const config = {
        ORDER_QTY: (existing && existing.ORDER_QTY) || company.qty || 10,
        MAX_ORDER_QTY: (existing && existing.MAX_ORDER_QTY) || 1000,
        ORDER_PRICE: (existing && existing.ORDER_PRICE) || company.targetPrice || 0,
        BELOW_PRICE: (existing && existing.BELOW_PRICE) || 0,
        COLLATERAL: (existing && existing.COLLATERAL) || 0
      };
      await fetch(`/api/order-quantities/${orderKey}/${symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    } else {
      await fetch(`/api/order-quantities/${orderKey}/${symbol}`, { method: 'DELETE' });
    }
    const oqRes = await fetch('/api/order-quantities');
    this.orderQuantities = await oqRes.json();
    this.renderSubdomains();
  }

  handleOrdersComplete(results) {
    const successCount = results.filter(r => r.success).length;
    this.addLog(`Orders: ${successCount}/${results.length} OK`, successCount === results.length ? 'success' : 'warning');
  }
}

const app = new PriceMonitorApp();
