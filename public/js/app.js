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
    document.getElementById('priceCheckCount').textContent = `Price Check: ${this.priceCheckCount}`;
    document.getElementById('orderPlaceCount').textContent = `Order Place: ${this.orderPlaceCount}`;
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
      // Load companies from central config (config/companies.js) via API
      const res = await fetch('/api/companies');
      const companies = await res.json();
      // Convert to frontend format: { SYMBOL: { enabled, targetPrice } }
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

    // Override with localStorage if user has saved custom settings
    const saved = localStorage.getItem('companyConfig');
    if (saved) {
      const savedConfig = JSON.parse(saved);
      for (const [symbol, config] of Object.entries(savedConfig)) {
        if (this.companyConfig[symbol]) {
          this.companyConfig[symbol] = config;
        }
      }
    }

    this.renderCompanyConfig();
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
    // Extract unique domains from accounts
    const domains = [...new Set((this.accounts || []).map(a => a.domain))];
    const domainSelect = document.getElementById('subdomainDomain');
    if (!domainSelect || domains.length === 0) return;

    domainSelect.innerHTML = domains.map(d => `<option value="${d}">${d}</option>`).join('');
    // Add "other" option for custom domains
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
      <div class="company-row">
        <label><input type="checkbox" id="chk_${company}" ${config.enabled ? 'checked' : ''}> ${company}</label>
        <input type="number" id="price_${company}" value="${config.targetPrice}" step="0.1" placeholder="Target Price">
      </div>
    `).join('');
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
    localStorage.setItem('companyConfig', JSON.stringify(this.companyConfig));

    // Update server config
    fetch('/api/company-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.companyConfig)
    });

    this.addLog('Company config saved', 'success');
  }

  async addSubdomain() {
    const tms = document.getElementById('subdomainTms').value.trim();
    const name = document.getElementById('subdomainName').value.trim();
    const role = document.getElementById('subdomainRole').value;
    const type = document.getElementById('subdomainType').value;

    // Get domain from select or custom input
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

    // Collect ATS fields if type is 'ats'
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
        this.addLog(`Added account: ${name} (${tms}.${domain}, ${role}, ${type})`, 'success');
      }
    } catch (error) {
      console.error('Error adding subdomain:', error);
      this.addLog('Error adding subdomain', 'error');
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
        this.addLog(`Sync complete: ${result.added} new subdomains (${result.total} in config)`, 'success');
      }
    } catch (error) {
      console.error('Error syncing subdomains:', error);
      this.addLog('Error syncing subdomains', 'error');
    }
  }

  async removeSubdomain(id) {
    if (!confirm('Remove this subdomain?')) return;

    try {
      await fetch(`/api/subdomains/${id}`, { method: 'DELETE' });
      this.addLog('Subdomain removed', 'success');
    } catch (error) {
      console.error('Error removing subdomain:', error);
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
      this.addLog(`Updated ${subdomain.name} role to: ${role}`, 'info');
    } catch (error) {
      console.error('Error updating subdomain role:', error);
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
    const label = aspect === 'price' ? 'Price' : 'Order';
    this.addLog(`${checked ? 'Checked' : 'Unchecked'} all ${label}`, 'success');
  }

  renderOrderSummary() {
    const el = document.getElementById('orderSummary');
    if (!el) return;

    const oq = this.orderQuantities || {};
    // Collect unique symbols with their config (same price across all subdomains)
    const symbols = {};
    for (const sub of Object.values(oq)) {
      for (const [sym, cfg] of Object.entries(sub)) {
        if (!symbols[sym]) symbols[sym] = cfg;
      }
    }

    if (Object.keys(symbols).length === 0) {
      el.innerHTML = '<span class="order-tag none">No order config</span>';
      return;
    }

    el.innerHTML = Object.entries(symbols).map(([sym, cfg]) =>
      `<span class="order-tag">${sym}: Rs${cfg.ORDER_PRICE} x${cfg.ORDER_QTY}</span>`
    ).join('');
  }

  renderSubdomains() {
    const container = document.getElementById('subdomainsList');

    // Render global order config summary
    this.renderOrderSummary();

    if (this.subdomains.length === 0) {
      container.innerHTML = '<div class="empty-state">No subdomains added yet.</div>';
      return;
    }

    container.innerHTML = this.subdomains.map(subdomain => {
      const role = subdomain.role || 'both';
      const type = subdomain.type || 'nepse';
      const roleClass = `role-${role}`;
      const statusClass = subdomain.status || 'idle';

      const statusEmoji = {
        idle: '',
        checking: '🔍',
        ordering: '📦',
        order_placed: '✅',
        order_failed: '❌',
        error: '⚠️'
      }[subdomain.status] || '';

      const lastCheckText = subdomain.lastCheck ? new Date(subdomain.lastCheck).toLocaleTimeString() : '-';
      const typeBadge = `<span class="type-badge ${type}">${type}</span>`;
      const domainText = subdomain.domain ? `<span class="domain-badge">${subdomain.domain}</span>` : '';

      // Timing
      const fetchMs = subdomain.fetchTimeMs != null ? `${subdomain.fetchTimeMs}ms` : '-';

      // Order time badge (only show after order)
      const orderTimeBadge = subdomain.orderTimeMs != null
        ? `<span class="timing-badge order-time">Order: ${subdomain.orderTimeMs}ms</span>` : '';

      // ATS info (shown inline when type is 'ats')
      const atsInfo = type === 'ats' && subdomain.broker
        ? `<div class="ats-info-row">ATS: ${subdomain.broker} / ${subdomain.acntid || '-'}</div>` : '';

      // Build scriptList: show all companies with checkboxes + per-symbol LTP
      const orderKey = this.getOrderKey(subdomain);
      const accountSymbols = (this.orderQuantities || {})[orderKey] || {};
      const prices = subdomain.prices || {};

      const scriptListHtml = Object.entries(this.companyConfig).map(([sym, cfg]) => {
        const isEnabled = sym in accountSymbols;
        const symCfg = accountSymbols[sym] || {};
        const p = prices[sym];
        const ltp = p ? p.ltp : '-';
        const target = symCfg.ORDER_PRICE || cfg.targetPrice || '-';
        const isMatch = p && p.matched;
        const ltpClass = p ? (p.matched ? 'price-match' : 'price-above') : '';
        const itemClass = isEnabled ? (isMatch ? 'matched' : '') : 'unchecked';
        const qtyText = isEnabled ? `${symCfg.ORDER_QTY || '-'}|${symCfg.MAX_ORDER_QTY || '-'}` : '';

        return `<div class="script-item ${itemClass}">
          <label class="script-check">
            <input type="checkbox" ${isEnabled ? 'checked' : ''}
              onchange="app.toggleSymbol('${orderKey}', '${sym}', this.checked)"> ${sym}
          </label>
          <span class="script-ltp ${ltpClass}">${ltp}</span>
          <span class="script-target">/ ${target}</span>
          <span class="script-qty">${qtyText}</span>
        </div>`;
      }).join('');

      return `
        <div class="subdomain-item ${roleClass} ${statusClass} ${subdomain.enabled ? '' : 'disabled'}">
          <div class="subdomain-role-indicator ${role}"></div>
          <div class="subdomain-info">
            <div class="subdomain-name">${statusEmoji} ${subdomain.name} ${typeBadge} ${domainText}</div>
            ${atsInfo}
            <div class="script-list">${scriptListHtml}</div>
            <div class="subdomain-timing-row">
              <span class="timing-badge fetch-time">Fetch: ${fetchMs}</span>
              ${orderTimeBadge}
              <span class="timing-badge last-check">Last: ${lastCheckText}</span>
            </div>
          </div>
          <div class="subdomain-role-checkboxes">
            <label class="role-checkbox price-cb" title="Price Check">
              <input type="checkbox" ${role === 'price' || role === 'both' ? 'checked' : ''}
                onchange="app.toggleSubdomainRole('${subdomain.id}', 'price', this.checked)"> P
            </label>
            <label class="role-checkbox order-cb" title="Order Place">
              <input type="checkbox" ${role === 'order' || role === 'both' ? 'checked' : ''}
                onchange="app.toggleSubdomainRole('${subdomain.id}', 'order', this.checked)"> O
            </label>
          </div>
          <div class="subdomain-actions">
            <button class="btn btn-danger btn-small" onclick="app.removeSubdomain('${subdomain.id}')">X</button>
          </div>
        </div>
      `;
    }).join('');
  }

  loadDefaultPriceScript() {
    const script = this.generatePriceScript();
    document.getElementById('priceScript').value = script;
    this.setPriceScript();
    this.addLog('Default price check script loaded', 'success');
  }

  loadDefaultOrderScript() {
    const script = this.generateOrderScript();
    document.getElementById('orderScript').value = script;
    this.setOrderScript();
    this.addLog('Default order script loaded', 'success');
  }

  generatePriceScript() {
    const enabledCompanies = Object.entries(this.companyConfig)
      .filter(([_, config]) => config.enabled)
      .map(([company, config]) => `'${company}': { enabled: true, target: ${config.targetPrice} }`)
      .join(',\n    ');

    return `// Auto-generated Price Check Script
// Gets scrip ID from localStorage.__securities__

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

async function checkPrices() {
    var host = document.location.origin;

    // Get scrip list from localStorage (same as your original code)
    var totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;

    var lastSymbol = null;
    var lastLtp = 0;
    var allPrices = {};

    for (const [symbol, config] of Object.entries(COMPANIES)) {
        if (!config.enabled) continue;

        // Find scrip by symbol to get its ID and ISIN
        var scrip = totalScripList.find(s => s.symbol === symbol);
        if (!scrip) {
            console.warn('Scrip not found:', symbol);
            continue;
        }

        try {
            // Use scrip.id and scrip.isin from localStorage
            var url = host + "/tmsapi/rtApi/stock/validation/ohlc/" + scrip.id + "/" + scrip.isin;

            var res = await fetch(url, {
                credentials: "include",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "x-xsrf-token": getCookie("XSRF-TOKEN") || ""
                }
            });

            var data = await res.json();

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

    // No match - return last fetched price so dashboard shows actual LTP
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
// Gets scrip ID from localStorage.__securities__

var company = window.MATCHED_COMPANY || 'NLO';
console.log('Placing order for: ' + company + ' on subdomain: ' + scriptId);

// Get scrip data from localStorage
var totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
var scrip = totalScripList.find(function(s) { return s.symbol === company; });

if (!scrip) {
    console.error('Scrip not found in localStorage: ' + company);
    return { success: false, message: 'Scrip not found: ' + company };
}

console.log('Found scrip - ID: ' + scrip.id + ', Symbol: ' + scrip.symbol);

// Try your existing functions (if loaded in browser)
if (typeof upMultipleScrips === 'function') {
    console.log('Using upMultipleScrips()');
    upMultipleScrips([company]);
    return { success: true, company: company, scripId: scrip.id };
}

if (typeof getProcessedScrips === 'function' && typeof processScriptsSequentially === 'function') {
    console.log('Using processScriptsSequentially()');
    var processedScrips = getProcessedScrips([company]);
    processScriptsSequentially(processedScrips);
    return { success: true, company: company, scripId: scrip.id };
}

if (typeof processScripUntilCircuit === 'function') {
    console.log('Using processScripUntilCircuit()');
    processScripUntilCircuit(scrip);
    return { success: true, company: company, scripId: scrip.id };
}

// If no functions found, log the scrip info for manual handling
console.log('No order functions found. Scrip info:', JSON.stringify({
    id: scrip.id,
    symbol: scrip.symbol,
    isin: scrip.isin,
    exchangeSecurityId: scrip.exchangeSecurityId
}));

return { success: false, message: 'Order functions not loaded. Load your trading script first.' };`;
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
      this.addLog('Price check script saved', 'success');
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
    // Save config first
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
        this.addLog('TMS pages opened - log in to all tabs, then click Start', 'success');
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
    // Save config first
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
      this.addLog('Monitoring stopped', 'success');
    } catch (error) {
      this.addLog('Error stopping monitoring', 'error');
    }
  }

  updateButtonStates() {
    const openTmsBtn = document.getElementById('openTmsBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (this.isMonitoring) {
      openTmsBtn.disabled = true;
      openTmsBtn.textContent = '1. Open TMS';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else if (this.browserOpen) {
      openTmsBtn.disabled = true;
      openTmsBtn.textContent = 'TMS Opened';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    } else {
      openTmsBtn.disabled = false;
      openTmsBtn.textContent = '1. Open TMS';
      startBtn.disabled = true;
      stopBtn.disabled = true;
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
      statusText.textContent = this.browserOpen ? 'Ready - Log in & Start' : 'Idle';
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

  getOrderKey(subdomain) {
    return subdomain.type === 'ats' ? subdomain.accountId : subdomain.scriptId;
  }

  async toggleSymbol(orderKey, symbol, checked) {
    if (checked) {
      // Add symbol with defaults from company config
      const company = this.companyConfig[symbol] || {};
      const config = {
        ORDER_QTY: company.qty || 10,
        MAX_ORDER_QTY: 1000,
        ORDER_PRICE: company.targetPrice || 0,
        BELOW_PRICE: 0,
        COLLATERAL: 0
      };
      await fetch(`/api/order-quantities/${orderKey}/${symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    } else {
      await fetch(`/api/order-quantities/${orderKey}/${symbol}`, { method: 'DELETE' });
    }
    // Reload order quantities and re-render
    const oqRes = await fetch('/api/order-quantities');
    this.orderQuantities = await oqRes.json();
    this.renderSubdomains();
  }

  handleOrdersComplete(results) {
    const successCount = results.filter(r => r.success).length;
    this.addLog(`Orders complete: ${successCount}/${results.length} successful`, successCount === results.length ? 'success' : 'warning');
  }
}

// Initialize
const app = new PriceMonitorApp();
