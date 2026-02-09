class PriceMonitorApp {
  constructor() {
    this.ws = null;
    this.subdomains = [];
    this.isMonitoring = false;
    this.companyConfig = {
      NLO: { enabled: true, targetPrice: 254.1 },
      SYPNL: { enabled: true, targetPrice: 684.8 },
      JHAPA: { enabled: false, targetPrice: 1073.6 },
      SWASTIK: { enabled: false, targetPrice: 2327.0 },
      SAIL: { enabled: false, targetPrice: 781.7 }
    };
    this.priceCheckCount = 0;
    this.orderPlaceCount = 0;
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.loadInitialData();
    this.loadCompanyConfig();
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
      case 'price_check':
        this.priceCheckCount++;
        this.updateCounts();
        break;
      case 'order_place':
        this.orderPlaceCount++;
        this.updateCounts();
        break;
    }
  }

  updateCounts() {
    document.getElementById('priceCheckCount').textContent = `Price Check: ${this.priceCheckCount}`;
    document.getElementById('orderPlaceCount').textContent = `Order Place: ${this.orderPlaceCount}`;
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
      this.updateStatus(status.isMonitoring);

      const logsRes = await fetch('/api/logs');
      const logs = await logsRes.json();
      logs.forEach(log => this.addLog(log.message, log.type, false));

    } catch (error) {
      console.error('Error loading initial data:', error);
      this.addLog('Error loading initial data', 'error');
    }
  }

  loadCompanyConfig() {
    const saved = localStorage.getItem('companyConfig');
    if (saved) {
      this.companyConfig = JSON.parse(saved);
    }
    this.renderCompanyConfig();
  }

  renderCompanyConfig() {
    Object.entries(this.companyConfig).forEach(([company, config]) => {
      const checkbox = document.getElementById(`chk_${company}`);
      const priceInput = document.getElementById(`price_${company}`);
      if (checkbox) checkbox.checked = config.enabled;
      if (priceInput) priceInput.value = config.targetPrice;
    });
  }

  saveCompanyConfig() {
    const companies = ['NLO', 'SYPNL', 'JHAPA', 'SWASTIK', 'SAIL'];
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
    const url = document.getElementById('subdomainUrl').value.trim();
    const name = document.getElementById('subdomainName').value.trim();
    const role = document.getElementById('subdomainRole').value;
    const type = document.getElementById('subdomainType').value;

    if (!url || !name) {
      alert('Please enter both URL and name');
      return;
    }

    // Auto-extract subdomain from URL (e.g., tms13 from https://tms13.nepsetms.com.np)
    let scriptId = '';
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split('.');
      if (parts.length > 2) {
        scriptId = parts[0]; // e.g., "tms13"
      }
    } catch (e) {
      scriptId = name.toLowerCase().replace(/\s+/g, '');
    }

    try {
      const res = await fetch('/api/subdomains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, scriptId, role, type, enabled: true })
      });

      const result = await res.json();
      if (result.success) {
        document.getElementById('subdomainUrl').value = '';
        document.getElementById('subdomainName').value = '';
        this.addLog(`Added subdomain: ${name} (${role}, ${type})`, 'success');
      }
    } catch (error) {
      console.error('Error adding subdomain:', error);
      this.addLog('Error adding subdomain', 'error');
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

  async setAllRole(role) {
    for (const subdomain of this.subdomains) {
      await this.updateSubdomainRole(subdomain.id, role);
    }
    this.addLog(`Set all subdomains to: ${role}`, 'success');
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

      const priceText = subdomain.lastPrice !== null ? `${subdomain.lastPrice}` : '-';
      const lastCheckText = subdomain.lastCheck ? new Date(subdomain.lastCheck).toLocaleTimeString() : '-';
      const companyText = subdomain.matchedCompany ? `[${subdomain.matchedCompany}]` : '';
      const typeBadge = `<span class="type-badge ${type}">${type}</span>`;

      return `
        <div class="subdomain-item ${roleClass} ${statusClass} ${subdomain.enabled ? '' : 'disabled'}">
          <div class="subdomain-role-indicator ${role}"></div>
          <div class="subdomain-info">
            <div class="subdomain-name">${statusEmoji} ${subdomain.name} ${companyText} ${typeBadge}</div>
            <div class="subdomain-url">${subdomain.url}</div>
            <div class="subdomain-meta">
              Price: ${priceText} | Last: ${lastCheckText}
            </div>
          </div>
          <select class="subdomain-role-select" onchange="app.updateSubdomainRole('${subdomain.id}', this.value)">
            <option value="both" ${role === 'both' ? 'selected' : ''}>Both</option>
            <option value="price" ${role === 'price' ? 'selected' : ''}>Price Only</option>
            <option value="order" ${role === 'order' ? 'selected' : ''}>Order Only</option>
          </select>
          <div class="subdomain-actions">
            <button class="btn btn-danger btn-small" onclick="app.removeSubdomain('${subdomain.id}')">X</button>
          </div>
        </div>
      `;
    }).join('');

    // Show/hide ATS config panel based on whether ATS subdomains exist
    this.updateAtsPanel();
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
                console.log(symbol + ': ' + ltp + ' (target: ' + config.target + ') [id:' + scrip.id + ']');

                if (ltp <= config.target) {
                    return JSON.stringify({
                        company: symbol,
                        price: ltp,
                        target: config.target,
                        scripId: scrip.id,
                        matched: true
                    });
                }
            }
        } catch (e) {
            console.error('Error checking ' + symbol + ':', e);
        }
    }

    // Return first company's info if no match
    var firstSymbol = Object.keys(COMPANIES)[0];
    var firstScrip = totalScripList.find(s => s.symbol === firstSymbol);
    return JSON.stringify({
        company: firstSymbol,
        price: 0,
        scripId: firstScrip ? firstScrip.id : null,
        matched: false
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
      this.updateStatus(false);
      this.addLog('Monitoring stopped', 'success');
    } catch (error) {
      this.addLog('Error stopping monitoring', 'error');
    }
  }

  updateStatus(isMonitoring) {
    this.isMonitoring = isMonitoring;
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (isMonitoring) {
      indicator.className = 'status-indicator monitoring';
      statusText.textContent = 'Monitoring';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      indicator.className = 'status-indicator';
      statusText.textContent = 'Idle';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
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

  async updateAtsPanel() {
    const atsSubdomains = this.subdomains.filter(s => s.type === 'ats');
    const panel = document.getElementById('atsPanel');

    if (atsSubdomains.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';

    // Load existing ATS config from server
    try {
      const res = await fetch('/api/ats-config');
      this.atsConfig = await res.json();
    } catch (e) {
      this.atsConfig = {};
    }

    const container = document.getElementById('atsConfigList');
    container.innerHTML = atsSubdomains.map(s => {
      const cfg = this.atsConfig[s.scriptId] || {};
      return `
        <div class="ats-config-item" data-script-id="${s.scriptId}">
          <h4>${s.name} (${s.scriptId})</h4>
          <div class="ats-field">
            <label>Broker:</label>
            <input type="text" class="ats-broker" value="${cfg.broker || ''}" placeholder="e.g., NSH">
          </div>
          <div class="ats-field">
            <label>Account ID:</label>
            <input type="text" class="ats-acntid" value="${cfg.acntid || ''}" placeholder="e.g., 60152">
          </div>
          <div class="ats-field">
            <label>Client Acc:</label>
            <input type="text" class="ats-clientacc" value="${cfg.clientAcc || ''}" placeholder="Client account">
          </div>
        </div>
      `;
    }).join('');
  }

  async saveAtsConfig() {
    const items = document.querySelectorAll('.ats-config-item');
    const atsConfig = {};

    items.forEach(item => {
      const scriptId = item.dataset.scriptId;
      const broker = item.querySelector('.ats-broker').value.trim();
      const acntid = item.querySelector('.ats-acntid').value.trim();
      const clientAcc = item.querySelector('.ats-clientacc').value.trim();

      if (broker || acntid || clientAcc) {
        atsConfig[scriptId] = { broker, acntid, clientAcc };
      }
    });

    try {
      await fetch('/api/ats-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atsConfig })
      });
      this.addLog(`ATS config saved for ${Object.keys(atsConfig).length} brokers`, 'success');
    } catch (error) {
      this.addLog('Error saving ATS config', 'error');
    }
  }

  handleOrdersComplete(results) {
    const successCount = results.filter(r => r.success).length;
    this.addLog(`Orders complete: ${successCount}/${results.length} successful`, successCount === results.length ? 'success' : 'warning');
  }
}

// Initialize
const app = new PriceMonitorApp();
