const BrowserService = require('./browserService');
const OrderService = require('./orderService');
const fs = require('fs').promises;
const path = require('path');
const companiesConfig = require('../../config/companies');

// Default order configuration (price comes from central config)
const firstCompany = Object.values(companiesConfig.companies)[0];
const DEFAULT_ORDER = {
  ORDER_QTY: 10,
  MAX_ORDER_QTY: 100,
  ORDER_PRICE: firstCompany ? firstCompany.targetPrice : 0,
  BELOW_PRICE: 0,
  COLLATERAL: 0
};

class PriceMonitor {
  constructor(wss) {
    this.wss = wss;
    this.subdomains = [];
    this.priceCheckScript = '';
    this.orderScript = '';
    this.priceTarget = null; // Legacy single target (fallback)
    this.priceCondition = 'lte'; // lte, gte, eq
    this.isMonitoring = false;
    this.browserOpen = false;
    this.browserService = new BrowserService();
    this.browserService.onDisconnected = () => {
      this.isMonitoring = false;
      this.browserOpen = false;
      this.log('Browser was closed manually', 'warning');
      this.broadcast({ type: 'browser_closed' });
    };
    this.orderService = new OrderService(this.browserService);
    this.logs = [];
    this.configFile = path.join(__dirname, '../../config/config.json');

    // Per-subdomain, per-stock order configurations
    this.orderQuantities = {};

    // Pre-orders configuration
    this.preOrders = {};


    this.loadConfig();
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(data);
      this.subdomains = config.subdomains || [];
      // Don't restore saved scripts — they are auto-generated from current company config
      this.priceCheckScript = '';
      this.orderScript = '';
      this.priceTarget = config.priceTarget || null;
      this.priceCondition = config.priceCondition || 'lte';
      this.orderQuantities = config.orderQuantities || {};
      this.preOrders = config.preOrders || {};
      this.log('✅ Configuration loaded', 'success');
    } catch (error) {
      this.log('⚠️  No existing config found, starting fresh', 'warning');
    }

    // Build/merge subdomains from accounts in central config
    this.buildSubdomainsFromAccounts();
  }

  buildSubdomainsFromAccounts() {
    const accounts = companiesConfig.accounts || [];
    let added = 0;

    // Remove stale subdomains not in companies.js accounts
    const accountNames = new Set(accounts.map(a => a.name));
    const before = this.subdomains.length;
    this.subdomains = this.subdomains.filter(s => accountNames.has(s.accountId));
    const removed = before - this.subdomains.length;
    if (removed > 0) {
      this.log(`🧹 Removed ${removed} stale account(s) not in companies.js`, 'info');
    }

    for (const account of accounts) {
      const accountId = account.name;
      const type = account.type || 'nepse';
      // ATS accounts use /atsweb path; NEPSE TMS uses root
      const url = type === 'ats'
        ? `https://${account.tms}.${account.domain}/atsweb`
        : `https://${account.tms}.${account.domain}/`;

      // Check if this account already exists in saved subdomains
      const existing = this.subdomains.find(s => s.accountId === accountId);
      if (existing) {
        // Update URL and account properties in case config changed, preserve runtime state
        existing.url = url;
        existing.scriptId = account.tms;
        existing.type = type;
        existing.domain = account.domain;
        existing.role = account.role || 'both';
        // Carry over ATS fields from account config
        if (account.broker) existing.broker = account.broker;
        if (account.acntid) existing.acntid = account.acntid;
        if (account.clientAcc) existing.clientAcc = account.clientAcc;
        // Carry over credentials
        if (account.username) existing.username = account.username;
        if (account.password) existing.password = account.password;

        // Merge scriptList into orderQuantities (overwrite with latest from companies.js)
        if (account.scriptList && account.scriptList.length > 0) {
          const orderKey = type === 'ats' ? accountId : account.tms;
          if (!this.orderQuantities[orderKey]) {
            this.orderQuantities[orderKey] = {};
          }
          for (const script of account.scriptList) {
            this.orderQuantities[orderKey][script.symbol] = {
              ORDER_QTY: script.ORDER_QTY,
              MAX_ORDER_QTY: script.MAX_ORDER_QTY,
              ORDER_PRICE: script.ORDER_PRICE,
              BELOW_PRICE: (this.orderQuantities[orderKey][script.symbol] || {}).BELOW_PRICE || 0,
              COLLATERAL: (this.orderQuantities[orderKey][script.symbol] || {}).COLLATERAL || 0,
              enabled: true
            };
          }
        }
        continue;
      }

      // Create new subdomain entry from account
      const newSubdomain = {
        id: accountId,
        accountId,
        url,
        scriptId: account.tms,
        name: account.name,
        domain: account.domain,
        enabled: true,
        role: account.role || 'both',
        type,
        status: 'idle',
        lastPrice: null,
        lastCheck: null
      };

      // ATS-specific fields
      if (account.broker) newSubdomain.broker = account.broker;
      if (account.acntid) newSubdomain.acntid = account.acntid;
      if (account.clientAcc) newSubdomain.clientAcc = account.clientAcc;

      // Auto-login credentials
      if (account.username) newSubdomain.username = account.username;
      if (account.password) newSubdomain.password = account.password;

      this.subdomains.push(newSubdomain);
      added++;

      // Load scriptList into orderQuantities
      // Key must match getOrderKey(): ATS uses accountId, NEPSE uses scriptId (tms slug)
      if (account.scriptList && account.scriptList.length > 0) {
        const orderKey = type === 'ats' ? accountId : account.tms;
        if (!this.orderQuantities[orderKey]) {
          this.orderQuantities[orderKey] = {};
        }
        for (const script of account.scriptList) {
          if (!this.orderQuantities[orderKey][script.symbol]) {
            this.orderQuantities[orderKey][script.symbol] = {
              ORDER_QTY: script.ORDER_QTY,
              MAX_ORDER_QTY: script.MAX_ORDER_QTY,
              ORDER_PRICE: script.ORDER_PRICE,
              BELOW_PRICE: 0,
              COLLATERAL: 0
            };
          }
        }
      }
    }

    // Disable subdomains whose scriptList has no enabled companies
    this.syncSubdomainEnabledState();

    if (added > 0) {
      this.log(`🔄 Built ${added} subdomains from accounts config (${accounts.length} total accounts)`, 'success');
      this.saveConfig();
    }
  }

  // Sync subdomain enabled state: only AUTO-DISABLE accounts with no enabled symbols.
  // Never auto-enable — respect manual disable from the user.
  syncSubdomainEnabledState() {
    const enabledCompanies = new Set(
      Object.entries(companiesConfig.companies)
        .filter(([_, config]) => config.enabled)
        .map(([symbol]) => symbol)
    );

    for (const subdomain of this.subdomains) {
      const orderKey = subdomain.type === 'ats' ? subdomain.accountId : subdomain.scriptId;
      const symbols = Object.keys(this.orderQuantities[orderKey] || {});

      if (symbols.length > 0) {
        const hasEnabledSymbol = symbols.some(s => enabledCompanies.has(s));
        // Only disable if no enabled symbols — never force-enable
        if (!hasEnabledSymbol) {
          subdomain.enabled = false;
        }
      }
    }
  }

  async saveConfig() {
    try {
      // Strip credentials before saving - they live in companies.js only
      const safeSubdomains = this.subdomains.map(s => {
        const { username, password, ...rest } = s;
        return rest;
      });
      const config = {
        subdomains: safeSubdomains,
        priceCheckScript: this.priceCheckScript,
        orderScript: this.orderScript,
        priceTarget: this.priceTarget,
        priceCondition: this.priceCondition,
        orderQuantities: this.orderQuantities,
        preOrders: this.preOrders,
      };
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
      this.log('💾 Configuration saved', 'info');
    } catch (error) {
      this.log(`❌ Error saving config: ${error.message}`, 'error');
    }
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type };
    this.logs.push(logEntry);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    console.log(`[${timestamp}] ${message}`);

    // Broadcast to all connected WebSocket clients
    this.broadcast({ type: 'log', data: logEntry });
  }

  broadcast(data) {
    if (this.wss) {
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(JSON.stringify(data));
        }
      });
    }
  }

  addSubdomain(subdomain) {
    const id = subdomain.id || Date.now().toString();
    const accountId = subdomain.accountId || subdomain.name;
    const index = this.subdomains.findIndex(s => s.id === id);

    const newSubdomain = {
      id,
      accountId,
      url: subdomain.url,
      scriptId: subdomain.scriptId || '',
      name: subdomain.name,
      domain: subdomain.domain || '',
      enabled: subdomain.enabled !== false,
      role: subdomain.role || 'both',
      type: subdomain.type || 'nepse',
      status: 'idle',
      lastPrice: null,
      lastCheck: null
    };

    // ATS-specific fields
    if (subdomain.broker) newSubdomain.broker = subdomain.broker;
    if (subdomain.acntid) newSubdomain.acntid = subdomain.acntid;
    if (subdomain.clientAcc) newSubdomain.clientAcc = subdomain.clientAcc;

    if (index >= 0) {
      this.subdomains[index] = newSubdomain;
      this.log(`📝 Updated subdomain: ${subdomain.name}`, 'info');
    } else {
      this.subdomains.push(newSubdomain);
      this.log(`➕ Added subdomain: ${subdomain.name}`, 'info');
    }

    this.saveConfig();
    this.broadcast({ type: 'subdomains', data: this.subdomains });
  }

  removeSubdomain(id) {
    const index = this.subdomains.findIndex(s => s.id === id);
    if (index >= 0) {
      const name = this.subdomains[index].name;
      this.subdomains.splice(index, 1);
      this.log(`➖ Removed subdomain: ${name}`, 'info');
      this.saveConfig();
      this.broadcast({ type: 'subdomains', data: this.subdomains });
    }
  }

  getSubdomains() {
    // Strip credentials from API responses
    return this.subdomains.map(s => {
      const { username, password, ...rest } = s;
      return rest;
    });
  }

  setPriceCheckScript(script) {
    this.priceCheckScript = script;
    this.log('📜 Price check script updated', 'info');
    this.saveConfig();
  }

  setOrderScript(script) {
    this.orderScript = script;
    this.log('📜 Order script updated', 'info');
    this.saveConfig();
  }

  setPriceTarget(target, condition = 'lte') {
    this.priceTarget = parseFloat(target);
    this.priceCondition = condition;
    this.log(`🎯 Global price target set: ${condition.toUpperCase()} ${target}`, 'info');
    this.saveConfig();
  }

  // Set order quantities for a specific subdomain and symbol
  setOrderQuantity(subdomainId, symbol, config) {
    if (!this.orderQuantities[subdomainId]) {
      this.orderQuantities[subdomainId] = {};
    }
    // If symbol already exists, just enable it and update config; otherwise create new
    const existing = this.orderQuantities[subdomainId][symbol];
    this.orderQuantities[subdomainId][symbol] = {
      ORDER_QTY: config.ORDER_QTY || (existing ? existing.ORDER_QTY : DEFAULT_ORDER.ORDER_QTY),
      MAX_ORDER_QTY: config.MAX_ORDER_QTY || (existing ? existing.MAX_ORDER_QTY : DEFAULT_ORDER.MAX_ORDER_QTY),
      ORDER_PRICE: config.ORDER_PRICE || (existing ? existing.ORDER_PRICE : DEFAULT_ORDER.ORDER_PRICE),
      BELOW_PRICE: config.BELOW_PRICE ?? (existing ? existing.BELOW_PRICE : DEFAULT_ORDER.BELOW_PRICE),
      COLLATERAL: config.COLLATERAL ?? (existing ? existing.COLLATERAL : DEFAULT_ORDER.COLLATERAL),
      enabled: true
    };
    this.log(`🎯 Order config set for ${subdomainId}/${symbol}: Price=${this.orderQuantities[subdomainId][symbol].ORDER_PRICE}, Qty=${this.orderQuantities[subdomainId][symbol].ORDER_QTY}`, 'info');
    this.saveConfig();
  }

  // Disable order quantity for a specific subdomain and symbol (preserves config)
  removeOrderQuantity(subdomainId, symbol) {
    if (this.orderQuantities[subdomainId] && this.orderQuantities[subdomainId][symbol]) {
      this.orderQuantities[subdomainId][symbol].enabled = false;
    }
    this.log(`🎯 Disabled ${symbol} on ${subdomainId}`, 'info');
    this.saveConfig();
  }

  // Update ORDER_PRICE for a symbol across ALL subdomains in orderQuantities
  updateSymbolPrice(symbol, price) {
    const parsed = parseFloat(price);
    let updated = 0;
    for (const subdomainId of Object.keys(this.orderQuantities)) {
      if (this.orderQuantities[subdomainId][symbol]) {
        this.orderQuantities[subdomainId][symbol].ORDER_PRICE = parsed;
        updated++;
      }
    }
    this.log(`🎯 Updated ${symbol} ORDER_PRICE → ${parsed} across ${updated} account(s)`, 'info');
    if (updated > 0) this.saveConfig();
    return updated;
  }

  // Bulk set order quantities (from the orderQuantities object format)
  setOrderQuantities(orderQuantities) {
    this.orderQuantities = orderQuantities;
    this.log(`🎯 Order quantities configured for ${Object.keys(orderQuantities).length} subdomains`, 'info');
    this.saveConfig();
  }

  // Get order config for a subdomain and symbol
  getOrderConfig(subdomainId, symbol) {
    const subdomainConfig = this.orderQuantities[subdomainId] || {};
    const symbolConfig = subdomainConfig[symbol] || {};

    return {
      ORDER_QTY: symbolConfig.ORDER_QTY ?? DEFAULT_ORDER.ORDER_QTY,
      MAX_ORDER_QTY: symbolConfig.MAX_ORDER_QTY ?? DEFAULT_ORDER.MAX_ORDER_QTY,
      ORDER_PRICE: symbolConfig.ORDER_PRICE ?? DEFAULT_ORDER.ORDER_PRICE,
      BELOW_PRICE: symbolConfig.BELOW_PRICE ?? DEFAULT_ORDER.BELOW_PRICE,
      COLLATERAL: symbolConfig.COLLATERAL ?? DEFAULT_ORDER.COLLATERAL
    };
  }

  // Get price target for a specific subdomain and symbol
  getPriceTarget(subdomainId, symbol) {
    const config = this.getOrderConfig(subdomainId, symbol);
    return config.ORDER_PRICE;
  }

  // Check if symbol is enabled for a subdomain
  isSymbolEnabled(subdomainId, symbol) {
    const subdomainConfig = this.orderQuantities[subdomainId] || {};
    const symbolConfig = subdomainConfig[symbol];
    if (!symbolConfig) return false;
    return symbolConfig.enabled !== false; // enabled by default if flag missing
  }

  // Get all enabled symbols for a subdomain
  getEnabledSymbols(subdomainId) {
    const subdomainConfig = this.orderQuantities[subdomainId] || {};
    return Object.keys(subdomainConfig).filter(sym => subdomainConfig[sym].enabled !== false);
  }

  // Get the orderQuantities key for a subdomain
  // ATS accounts use accountId (unique per user); NEPSE uses scriptId (e.g., tms13)
  getOrderKey(subdomain) {
    return subdomain.type === 'ats' ? subdomain.accountId : subdomain.scriptId;
  }

  checkPriceCondition(price, subdomainId = null, symbol = null) {
    // If subdomain and symbol provided, use per-stock target
    if (subdomainId && symbol) {
      const targetPrice = this.getPriceTarget(subdomainId, symbol);
      const belowPrice = this.getOrderConfig(subdomainId, symbol).BELOW_PRICE;

      // If BELOW_PRICE is set and > 0, check if price is at or below it
      if (belowPrice > 0) {
        return price <= belowPrice;
      }

      // Otherwise use ORDER_PRICE as target
      switch (this.priceCondition) {
        case 'lte': return price <= targetPrice;
        case 'gte': return price >= targetPrice;
        case 'eq': return price === targetPrice;
        default: return false;
      }
    }

    // Fallback to global priceTarget
    if (this.priceTarget === null) return false;

    switch (this.priceCondition) {
      case 'lte': return price <= this.priceTarget;
      case 'gte': return price >= this.priceTarget;
      case 'eq': return price === this.priceTarget;
      default: return false;
    }
  }

  // Set pre-orders configuration
  setPreOrders(preOrders) {
    this.preOrders = preOrders;
    this.log(`📋 Pre-orders configured for ${Object.keys(preOrders).length} symbols`, 'info');
    this.saveConfig();
  }

  // Calculate max order quantity based on collateral
  calculateMaxOrderQty(config) {
    if (config.COLLATERAL === 0) {
      return config.MAX_ORDER_QTY;
    }

    let remainingCollateral = config.COLLATERAL;
    let currentPrice = config.ORDER_PRICE;

    // Simulate 4 orders at 2% increments
    for (let i = 0; i < 4; i++) {
      currentPrice *= 1.02;
      remainingCollateral -= config.ORDER_QTY * currentPrice;
    }

    const finalPrice = config.ORDER_PRICE * 1.1;
    let maxOrderQty = Math.floor(remainingCollateral / finalPrice);
    maxOrderQty = Math.floor(maxOrderQty / 10) * 10;

    return maxOrderQty > 0 ? maxOrderQty : 0;
  }

  // Auto-sync: create subdomain entries for all keys in orderQuantities
  syncSubdomainsFromOrderQuantities() {
    const keys = Object.keys(this.orderQuantities);
    let added = 0;

    for (const scriptId of keys) {
      // Check if subdomain already exists (by scriptId or accountId)
      const existing = this.subdomains.find(s => s.scriptId === scriptId || s.accountId === scriptId);
      if (existing) continue;

      // Only auto-create for tmsXX pattern (NEPSE TMS)
      const tmsMatch = scriptId.match(/^tms(\d+)$/);
      if (!tmsMatch) {
        this.log(`⏭️  Skipping ${scriptId} (non-TMS pattern, add manually)`, 'info');
        continue;
      }

      // Try to find matching account for domain info
      const accounts = companiesConfig.accounts || [];
      const account = accounts.find(a => a.tms === scriptId);
      const domain = account ? account.domain : 'nepsetms.com.np';
      const url = `https://${scriptId}.${domain}/`;
      const accountId = account ? account.name : scriptId;

      this.addSubdomain({
        url,
        scriptId,
        name: accountId,
        accountId,
        domain,
        enabled: true,
        role: 'order',
        type: 'nepse'
      });
      added++;
    }

    this.log(`🔄 Sync complete: ${added} new subdomains added (${keys.length} total in orderQuantities)`, 'success');
    return { added, total: keys.length };
  }

  async closeBrowser() {
    // Stop monitoring first if running
    if (this.isMonitoring) {
      this.isMonitoring = false;
      if (this._monitorPromise) {
        await this._monitorPromise;
        this._monitorPromise = null;
      }
    }

    await this.browserService.close();
    this.browserOpen = false;
    this.log('Browser closed', 'success');
    this.broadcast({ type: 'browser_closed' });
  }

  async openBrowser() {
    // If browser reference is stale (user manually closed window), reset state
    if (this.browserOpen && this.browserService.browser) {
      try {
        // Check if browser is still connected
        if (!this.browserService.browser.isConnected()) {
          this.browserOpen = false;
          this.browserService.browser = null;
          this.browserService.pages.clear();
          this.browserService.contexts.clear();
        }
      } catch (e) {
        this.browserOpen = false;
        this.browserService.browser = null;
        this.browserService.pages.clear();
        this.browserService.contexts.clear();
      }
    }

    if (this.browserOpen) {
      throw new Error('Browser is already open');
    }

    if (this.subdomains.length === 0) {
      throw new Error('No subdomains configured');
    }

    await this.browserService.initialize();
    this.log('🌐 Browser initialized', 'success');

    // Pre-open ALL enabled subdomain pages so user can log in
    const allEnabledSubdomains = this.subdomains.filter(s => s.enabled);
    if (allEnabledSubdomains.length > 0) {
      this.log(`📂 Opening ${allEnabledSubdomains.length} TMS pages...`, 'info');
      for (const subdomain of allEnabledSubdomains) {
        try {
          await this.browserService.getPage(subdomain.accountId, subdomain.url);
          this.log(`  📄 Opened ${subdomain.name}`, 'info');

          // Attempt auto-login if credentials are configured
          if (subdomain.username && subdomain.password) {
            await this.autoLogin(subdomain);
          }
        } catch (error) {
          this.log(`  ⚠️  Failed to open ${subdomain.name}: ${error.message}`, 'warning');
        }
      }
      this.log(`📂 All pages opened. Log in to each tab (or wait for auto-login), then click Start.`, 'success');
    }

    this.browserOpen = true;
    this.broadcast({ type: 'browser_opened' });
  }

  // Open a single new account's browser tab (works while monitoring is running)
  async openSingleAccount(accountId) {
    const subdomain = this.subdomains.find(s => s.accountId === accountId);
    if (!subdomain) throw new Error(`Account not found: ${accountId}`);

    // Ensure browser is initialized
    await this.browserService.initialize();

    try {
      await this.browserService.getPage(subdomain.accountId, subdomain.url);
      this.log(`📄 Opened ${subdomain.name} — log in manually`, 'success');

      if (subdomain.username && subdomain.password) {
        await this.autoLogin(subdomain);
      }
    } catch (error) {
      this.log(`⚠️ Failed to open ${subdomain.name}: ${error.message}`, 'warning');
      throw error;
    }

    if (!this.browserOpen) {
      this.browserOpen = true;
      this.broadcast({ type: 'browser_opened' });
    }
  }

  async autoLogin(subdomain) {
    try {
      const page = await this.browserService.getPage(subdomain.accountId, subdomain.url);

      // Wait for a password field to appear (indicates login page is loaded)
      const passwordField = await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => null);
      if (!passwordField) {
        this.log(`  🔐 ${subdomain.name}: No login form found (may already be logged in)`, 'info');
        return;
      }

      // Fill username - try multiple common selectors
      const usernameSelectors = [
        'input[name="username"]',
        'input#username',
        'input[formcontrolname="username"]',
        'input[placeholder*="user" i]',
        'input[placeholder*="User" i]',
        'input[name="uid"]',
        'input[name="clientCode"]',
      ];

      let usernameFilled = false;
      for (const selector of usernameSelectors) {
        const el = await page.$(selector);
        if (el) {
          await el.fill(subdomain.username);
          usernameFilled = true;
          break;
        }
      }

      if (!usernameFilled) {
        // Fallback: fill the first visible text input before the password field
        const firstTextInput = await page.$('input[type="text"]');
        if (firstTextInput) {
          await firstTextInput.fill(subdomain.username);
          usernameFilled = true;
        }
      }

      // Fill password
      await passwordField.fill(subdomain.password);

      // Click login/submit button
      const buttonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Log In")',
        'button:has-text("Sign In")',
        'button:has-text("Sign in")',
        '#loginBtn',
        '.login-btn',
        'button.btn-primary',
      ];

      let clicked = false;
      for (const selector of buttonSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          clicked = true;
          break;
        }
      }

      if (usernameFilled && clicked) {
        this.log(`  🔐 ${subdomain.name}: Auto-login submitted`, 'success');
      } else {
        this.log(`  ⚠️  ${subdomain.name}: Auto-login partial (user=${usernameFilled}, click=${clicked})`, 'warning');
      }

      // Brief wait for login to process
      await page.waitForTimeout(2000);

    } catch (error) {
      this.log(`  ⚠️  ${subdomain.name}: Auto-login failed - ${error.message}`, 'warning');
    }
  }

  async start() {
    if (this.isMonitoring) {
      throw new Error('Monitoring is already running');
    }

    if (this.subdomains.length === 0) {
      throw new Error('No subdomains configured');
    }

    // Price check script required for NEPSE subdomains; ATS uses built-in price check
    const hasNepsePrice = this.subdomains.some(s => s.enabled && s.type !== 'ats' && (s.role === 'price' || s.role === 'both'));
    if (hasNepsePrice && !this.priceCheckScript) {
      throw new Error('Price check script not configured (required for NEPSE TMS subdomains)');
    }

    // Check if either global priceTarget or orderQuantities are configured
    const hasOrderQuantities = Object.keys(this.orderQuantities).length > 0;
    if (this.priceTarget === null && !hasOrderQuantities) {
      throw new Error('Price target not set. Configure either global priceTarget or orderQuantities');
    }

    // If browser not opened yet, open it first
    if (!this.browserOpen) {
      await this.openBrowser();
    }

    this.isMonitoring = true;
    this.log('🚀 Starting price monitoring & order placement...', 'success');

    // Log configuration summary
    if (hasOrderQuantities) {
      const totalSubdomains = Object.keys(this.orderQuantities).length;
      const totalSymbols = Object.values(this.orderQuantities).reduce(
        (sum, sub) => sum + Object.keys(sub).length, 0
      );
      this.log(`📊 Using per-subdomain config: ${totalSubdomains} subdomains, ${totalSymbols} symbol configs`, 'info');
    } else {
      this.log(`📊 Using global price target: ${this.priceCondition.toUpperCase()} ${this.priceTarget}`, 'info');
    }

    this._monitorPromise = this.monitorLoop();
  }

  async stop(closeBrowser = true) {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.log('⏹️  Stopping price monitoring...', 'warning');

    // Wait for the monitor loop to finish its current iteration
    if (this._monitorPromise) {
      await this._monitorPromise;
      this._monitorPromise = null;
    }

    if (closeBrowser) {
      await this.browserService.close();
      this.browserOpen = false;
      this.log('✅ Monitoring stopped, browser closed', 'success');
    } else {
      this.log('✅ Monitoring stopped, browser left open', 'success');
    }
  }

  async monitorLoop() {
    const getPriceCheckSubdomains = () => this.subdomains.filter(s => s.enabled && (s.role === 'price' || s.role === 'both'));
    const getOrderPlaceSubdomains = () => this.subdomains.filter(s => s.enabled && (s.role === 'order' || s.role === 'both'));

    // Per-subdomain lock to prevent concurrent API requests (keepalive vs order)
    this.busySubdomains = new Set();

    const priceCheckCount = getPriceCheckSubdomains().length;
    const orderPlaceCount = getOrderPlaceSubdomains().length;

    this.log(`🔄 Starting monitoring:`, 'info');
    this.log(`   📊 Price Check: ${priceCheckCount} subdomains`, 'info');
    this.log(`   📦 Order Place: ${orderPlaceCount} subdomains`, 'info');

    const truncatePrice = (val) => parseFloat((val).toFixed(3).slice(0, -2));

    // Per-scrip order state: tracks 2% levels, circuit, etc.
    // Key: symbol, Value: { currentOrderPrice, nextOrderPrice, circuitAmount, pricesPlaced, done }
    const scripStates = {};

    // Sync scripStates with live config — adds new symbols, updates changed prices, removes disabled ones
    const syncScripStates = () => {
      const priceSubdomains = getPriceCheckSubdomains();
      const liveSymbols = new Set();

      for (const sub of priceSubdomains) {
        const orderKey = this.getOrderKey(sub);
        const enabledScrips = this.getEnabledSymbols(orderKey);
        for (const symbol of enabledScrips) {
          liveSymbols.add(symbol);
          const config = this.getOrderConfig(orderKey, symbol);
          const circuitAmount = truncatePrice(config.ORDER_PRICE * 1.1);

          if (!scripStates[symbol]) {
            // New symbol added from UI
            scripStates[symbol] = {
              config,
              circuitAmount,
              currentOrderPrice: null,
              nextOrderPrice: null,
              pricesPlaced: [],
              done: false
            };
            this.log(`📊 ${symbol}: ORDER_PRICE=${config.ORDER_PRICE}, circuit=${circuitAmount}`, 'info');
          } else if (scripStates[symbol].config.ORDER_PRICE !== config.ORDER_PRICE) {
            // ORDER_PRICE changed from UI — reset tracking for this symbol
            const old = scripStates[symbol].config.ORDER_PRICE;
            scripStates[symbol].config = config;
            scripStates[symbol].circuitAmount = circuitAmount;
            scripStates[symbol].currentOrderPrice = null;
            scripStates[symbol].nextOrderPrice = null;
            scripStates[symbol].pricesPlaced = [];
            scripStates[symbol].done = false;
            this.log(`🔄 ${symbol}: ORDER_PRICE changed ${old} → ${config.ORDER_PRICE}, circuit=${circuitAmount}`, 'info');
          } else {
            // Update qty fields (ORDER_QTY, MAX_ORDER_QTY) without resetting state
            scripStates[symbol].config = config;
          }
        }
      }

      // Remove symbols that were disabled from UI
      for (const symbol of Object.keys(scripStates)) {
        if (!liveSymbols.has(symbol)) {
          delete scripStates[symbol];
          this.log(`🗑️ ${symbol}: removed (disabled from UI)`, 'info');
        }
      }
    };

    // Initial sync
    syncScripStates();

    this.log(`🚀 Monitoring ${Object.keys(scripStates).length} scrips, placing on ${getOrderPlaceSubdomains().length} order subdomains`, 'info');

    // Order-only NEPSE subdomains — fetch NLO price on them to keep session alive
    const getOrderOnlyNepseSubdomains = () => getOrderPlaceSubdomains().filter(s => s.role === 'order' && s.type === 'nepse');

    const keepaliveCheck = async (subdomain) => {
      if (this.busySubdomains.has(subdomain.accountId)) return; // skip if order in progress
      try {
        this.busySubdomains.add(subdomain.accountId);
        const page = await this.browserService.getPage(subdomain.accountId, subdomain.url);
        await page.evaluate(async () => {
          var host = document.location.origin;
          var referral = host + "/tms/me/memberclientorderentry";
          function getCookie(name) {
            var nameEQ = name + "=";
            var ca = document.cookie.split(';');
            for (var i = 0; i < ca.length; i++) {
              var c = ca[i].trim();
              if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
            }
            return null;
          }
          function getHeader() {
            var xsrfToken = getCookie("XSRF-TOKEN") || "";
            var authToken = localStorage.getItem("id_token");
            var h = { "accept": "application/json, text/plain, */*" };
            if (xsrfToken) h["x-xsrf-token"] = xsrfToken;
            else if (authToken) h["Authorization"] = "Bearer " + authToken;
            return h;
          }
          async function refreshToken() {
            try {
              var res = await fetch(host + "/tmsapi/authApi/authenticate/refresh", {
                method: "POST", headers: getHeader(), referrer: referral,
                referrerPolicy: "strict-origin-when-cross-origin", body: null, mode: "cors", credentials: "include"
              });
              var data = await res.json();
              if (data.status === 200 && data.data) {
                localStorage.setItem("id_token", data.data.access_token);
                if (data.data.refresh_token) localStorage.setItem("refresh_token", data.data.refresh_token);
              }
              return true;
            } catch(e) { return false; }
          }
          var securities = localStorage.getItem("__securities__");
          if (!securities) return;
          var scripList = JSON.parse(securities).data;
          // Use first available scrip for keepalive ping
          var scrip = scripList[0];
          if (!scrip) return;
          var header = getHeader();
          var res = await fetch(host + "/tmsapi/rtApi/stock/validation/ohlc/" + scrip.id + "/" + scrip.isin, {
            credentials: "include", headers: header, method: "GET"
          });
          var data = await res.json();
          if (data.status === "401" || data.status === 401 || (data.status === "500" && data.level === "OAUTH")) {
            await refreshToken();
          }
        });
      } catch(e) {
      } finally {
        this.busySubdomains.delete(subdomain.accountId);
      }
    };

    // Keepalive runs every 2 seconds, not every loop iteration
    let lastKeepalive = 0;
    const KEEPALIVE_INTERVAL = 2000;

    // Main loop: price check on DYNAMIC44 (or other P subdomains), order on O subdomains
    while (this.isMonitoring) {
      // Re-sync scripStates with live config (picks up UI changes without restart)
      syncScripStates();

      // Re-read order subdomains each iteration (picks up role changes from UI)
      const orderSubdomains = getOrderPlaceSubdomains();

      // Fetch NLO price on order-only NEPSE TMS every 2s to keep sessions alive
      const now = Date.now();
      if (now - lastKeepalive >= KEEPALIVE_INTERVAL) {
        lastKeepalive = now;
        for (const subdomain of getOrderOnlyNepseSubdomains()) {
          keepaliveCheck(subdomain);
        }
      }

      const subdomainsToCheck = getPriceCheckSubdomains();

      if (subdomainsToCheck.length === 0) {
        this.log('⚠️  No subdomains configured for price checking', 'warning');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      // Check all done (but not if scripStates is empty — user may add symbols from UI)
      const allDone = Object.keys(scripStates).length > 0 && Object.values(scripStates).every(s => s.done);
      if (allDone) {
        this.log('✅ All scrips reached circuit. Monitoring stopped.', 'success');
        this.broadcast({ type: 'orders_complete', data: [] });
        this.isMonitoring = false;
        return;
      }

      for (const subdomain of subdomainsToCheck) {
        if (!this.isMonitoring) break;

        try {
          subdomain.status = 'checking';
          const price = await this.checkPrice(subdomain);
          subdomain.lastPrice = price;
          subdomain.lastCheck = new Date().toISOString();
          subdomain.status = 'idle';

          // Process each scrip's LTP from the price check
          const prices = subdomain.prices || {};

          for (const [symbol, priceInfo] of Object.entries(prices)) {
            const state = scripStates[symbol];
            if (!state || state.done) continue;

            const ltp = priceInfo.ltp;
            if (!ltp) continue;

            if (state.currentOrderPrice === null) {
              // First LTP → place order at LTP * 1.02
              state.currentOrderPrice = truncatePrice(ltp * 1.02);

              if (state.currentOrderPrice >= state.circuitAmount) {
                // Already at circuit
                await this.placeOrderOnAllSubdomains(symbol, state.circuitAmount, state.config.MAX_ORDER_QTY, orderSubdomains);
                state.pricesPlaced.push(state.circuitAmount);
                state.done = true;
                this.log(`[Circuit] ${symbol} @ ${state.circuitAmount} qty=${state.config.MAX_ORDER_QTY} → DONE`, 'success');
                continue;
              }

              await this.placeOrderOnAllSubdomains(symbol, state.currentOrderPrice, state.config.ORDER_QTY, orderSubdomains);
              state.pricesPlaced.push(state.currentOrderPrice);
              state.nextOrderPrice = truncatePrice(state.currentOrderPrice * 1.02);
              this.log(`[Order] ${symbol} @ ${state.currentOrderPrice} qty=${state.config.ORDER_QTY} → next: ${state.nextOrderPrice}`, 'info');

            } else if (ltp >= state.currentOrderPrice) {
              // LTP reached our order → place next

              if (state.nextOrderPrice >= state.circuitAmount) {
                // Place circuit order
                await this.placeOrderOnAllSubdomains(symbol, state.circuitAmount, state.config.MAX_ORDER_QTY, orderSubdomains);
                state.pricesPlaced.push(state.circuitAmount);
                state.done = true;
                this.log(`[Circuit] ${symbol} @ ${state.circuitAmount} qty=${state.config.MAX_ORDER_QTY} → DONE`, 'success');
                continue;
              }

              state.currentOrderPrice = state.nextOrderPrice;
              await this.placeOrderOnAllSubdomains(symbol, state.currentOrderPrice, state.config.ORDER_QTY, orderSubdomains);
              state.pricesPlaced.push(state.currentOrderPrice);
              state.nextOrderPrice = truncatePrice(state.currentOrderPrice * 1.02);
              this.log(`[Order] ${symbol} @ ${state.currentOrderPrice} qty=${state.config.ORDER_QTY} → next: ${state.nextOrderPrice}`, 'info');
            }
          }

          this.broadcast({ type: 'subdomains', data: this.subdomains });

        } catch (error) {
          if (!this.isMonitoring) break;
          subdomain.status = 'error';

          if (error.message.includes('Waiting for login')) {
            if (!subdomain._loginWarned) {
              this.log(`⏳ ${subdomain.name}: Not logged in yet, skipping...`, 'warning');
              subdomain._loginWarned = true;
            }
            continue;
          }
          this.log(`❌ Error checking ${subdomain.name}: ${error.message}`, 'error');
        }
      }

      // No delay — loop immediately for fastest LTP polling
    }
  }

  // Place order on ALL order subdomains for a symbol at a specific price
  async placeOrderOnAllSubdomains(symbol, price, qty, orderSubdomains) {
    const promises = orderSubdomains.map(async (subdomain) => {
      const orderKey = this.getOrderKey(subdomain);
      if (!this.isSymbolEnabled(orderKey, symbol)) return null;

      // Wait for any in-flight keepalive to finish before placing order
      while (this.busySubdomains && this.busySubdomains.has(subdomain.accountId)) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      try {
        if (this.busySubdomains) this.busySubdomains.add(subdomain.accountId);
        const result = await this.orderService.placeOrder(subdomain, { symbol, price, qty });
        if (result.success) {
          this.log(`✅ ${subdomain.name}: ${symbol} @ ${price} qty=${qty}`, 'success');
        } else {
          const errMsg = result.message || (result.response && (result.response.message || result.response.statusMessage || JSON.stringify(result.response).substring(0, 200))) || 'failed';
          this.log(`⚠️  ${subdomain.name}: ${symbol} @ ${price} - ${errMsg}`, 'warning');
        }
        return result;
      } catch (err) {
        this.log(`❌ ${subdomain.name}: ${symbol} @ ${price} - ${err.message}`, 'error');
        return null;
      } finally {
        if (this.busySubdomains) this.busySubdomains.delete(subdomain.accountId);
      }
    });

    await Promise.allSettled(promises);
  }

  async checkPrice(subdomain) {
    // Dispatch to ATS-specific price check
    if (subdomain.type === 'ats') {
      return this.checkAtsPrice(subdomain);
    }

    const page = await this.browserService.getPage(subdomain.accountId, subdomain.url);

    // Check if user is logged in (securities data available)
    const isLoggedIn = await page.evaluate(() => {
      const securities = localStorage.getItem("__securities__");
      return securities !== null && securities !== undefined;
    });

    if (!isLoggedIn) {
      throw new Error('Waiting for login... Please log in to the TMS portal');
    }

    // Execute the user's price check script (script builds its own headers from localStorage)
    const result = await page.evaluate(async ({ script, scriptId }) => {
      // Create an async function from the script and execute it
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const checkPriceFunc = new AsyncFunction('scriptId', script);
      return await checkPriceFunc(scriptId);
    }, { script: this.priceCheckScript, scriptId: subdomain.scriptId });

    // Check if result is JSON (multi-company format)
    try {
      if (typeof result === 'string' && (result.startsWith('{') || result.startsWith('['))) {
        const parsed = JSON.parse(result);
        if (parsed.company && parsed.price !== undefined) {
          // Store matched company info for order placement
          subdomain.matchedCompany = parsed.company;
          subdomain.matched = parsed.matched || false;
          if (parsed.allPrices) subdomain.prices = parsed.allPrices;
          return parseFloat(parsed.price);
        }
      }
    } catch (e) {
      // Not JSON, treat as simple price value
    }

    // Simple price format
    return parseFloat(result);
  }

  // ATS-specific price check using /atsweb/watch API
  async checkAtsPrice(subdomain) {
    const page = await this.browserService.getPage(subdomain.accountId, subdomain.url);

    // Build list from orderQuantities for this subdomain (only enabled symbols)
    const orderKey = this.getOrderKey(subdomain);
    const subdomainOrderConfig = this.orderQuantities[orderKey] || {};
    let companies = Object.entries(subdomainOrderConfig)
      .filter(([_, config]) => config.enabled !== false)
      .map(([symbol, config]) => ({
        symbol,
        target: config.ORDER_PRICE
      }));

    // Fallback to central config if no per-subdomain config
    if (companies.length === 0) {
      for (const [symbol, config] of Object.entries(companiesConfig.companies)) {
        if (config.enabled) {
          companies.push({ symbol, target: config.targetPrice });
        }
      }
    }

    const result = await page.evaluate(async (companies) => {
      var baseUrl = document.location.origin + '/atsweb';

      var lastSymbol = null;
      var lastLtp = 0;
      var allPrices = {};

      for (var i = 0; i < companies.length; i++) {
        var company = companies[i];
        try {
          var url = baseUrl + '/watch?action=getWatchForSecurity&format=json&securityid=' + company.symbol + '&exchange=NEPSE&bookDefId=1&dojo.preventCache=' + Date.now();
          var res = await fetch(url, {
            method: 'GET',
            headers: { 'x-requested-with': 'XMLHttpRequest' },
            referrer: baseUrl + '/home?action=showHome&format=html&reqid=' + Date.now(),
            referrerPolicy: 'strict-origin-when-cross-origin',
            credentials: 'include'
          });

          if (!res.ok) continue;

          var text = await res.text();
          var match = text.match(/['"]tradeprice['"]\s*:\s*['"]([^'"]+)['"]/);
          if (match && match[1]) {
            var ltp = parseFloat(match[1]);
            lastSymbol = company.symbol;
            lastLtp = ltp;
            allPrices[company.symbol] = { ltp: ltp, target: company.target, matched: ltp <= company.target };

            if (ltp <= company.target) {
              return JSON.stringify({
                company: company.symbol,
                price: ltp,
                target: company.target,
                matched: true,
                allPrices: allPrices
              });
            }
          }
        } catch(e) {
          console.error('Error checking ' + company.symbol + ':', e);
        }
      }

      if (!lastSymbol) {
        throw new Error('Waiting for login... Please log in to the ATS portal');
      }

      return JSON.stringify({
        company: lastSymbol,
        price: lastLtp,
        matched: false,
        allPrices: allPrices
      });
    }, companies);

    // Parse result (same format as NEPSE price check)
    try {
      const parsed = JSON.parse(result);
      if (parsed.company && parsed.price !== undefined) {
        subdomain.matchedCompany = parsed.company;
        subdomain.matched = parsed.matched || false;
        if (parsed.allPrices) subdomain.prices = parsed.allPrices;
        return parseFloat(parsed.price);
      }
    } catch (e) {
      // Not JSON
    }

    return parseFloat(result);
  }

  // Legacy: place orders on ALL subdomains (not role-filtered)
  async placeOrdersOnAllSubdomains(matchedCompany = null) {
    const companyInfo = matchedCompany ? ` for ${matchedCompany}` : '';
    this.log(`📦 Starting order placement${companyInfo} on all subdomains...`, 'info');

    const results = [];
    for (const subdomain of this.subdomains) {
      if (!subdomain.enabled) continue;

      try {
        subdomain.status = 'ordering';
        subdomain.matchedCompany = matchedCompany || subdomain.matchedCompany;
        this.broadcast({ type: 'subdomains', data: this.subdomains });

        const symbol = matchedCompany || subdomain.matchedCompany;
        const orderKey = this.getOrderKey(subdomain);

        // Skip if symbol not explicitly configured for this account
        if (!this.isSymbolEnabled(orderKey, symbol)) {
          subdomain.status = 'idle';
          this.log(`⏭️  ${subdomain.name}: ${symbol} not configured, skipping`, 'info');
          results.push({ subdomain: subdomain.name, company: matchedCompany, success: false, skipped: true });
          this.broadcast({ type: 'subdomains', data: this.subdomains });
          continue;
        }

        const orderConfig = this.getOrderConfig(orderKey, symbol);

        await this.orderService.placeOrder(subdomain, { ...orderConfig, symbol });

        subdomain.status = 'order_placed';
        this.log(`✅ Order placed on ${subdomain.name}${companyInfo}`, 'success');
        results.push({ subdomain: subdomain.name, company: matchedCompany, success: true });

      } catch (error) {
        subdomain.status = 'order_failed';
        this.log(`❌ Order failed on ${subdomain.name}: ${error.message}`, 'error');
        results.push({ subdomain: subdomain.name, company: matchedCompany, success: false, error: error.message });
      }

      this.broadcast({ type: 'subdomains', data: this.subdomains });
    }

    this.broadcast({ type: 'orders_complete', data: results });
    return results;
  }

  // Place orders ONLY on subdomains with role 'order' or 'both' - PARALLEL
  async placeOrdersOnOrderSubdomains(matchedCompany = null) {
    const orderSubdomains = this.subdomains.filter(s => s.enabled && (s.role === 'order' || s.role === 'both'));
    const companyInfo = matchedCompany ? ` for ${matchedCompany}` : '';

    this.log(`📦 Firing orders${companyInfo} in PARALLEL on ${orderSubdomains.length} subdomains...`, 'order');
    this.broadcast({ type: 'order_place' });

    // Mark all as ordering
    orderSubdomains.forEach(s => {
      s.status = 'ordering';
      s.matchedCompany = matchedCompany || s.matchedCompany;
    });
    this.broadcast({ type: 'subdomains', data: this.subdomains });

    // Build order promises for all subdomains simultaneously
    const orderPromises = orderSubdomains.map(async (subdomain) => {
      const symbol = matchedCompany;
      if (!symbol) {
        return { subdomain: subdomain.name, success: false, error: 'No matched symbol' };
      }

      // Skip if symbol not explicitly configured for this account
      const orderKey = this.getOrderKey(subdomain);
      if (!this.isSymbolEnabled(orderKey, symbol)) {
        subdomain.status = 'idle';
        this.log(`⏭️  ${subdomain.name}: ${symbol} not configured, skipping`, 'info');
        return { subdomain: subdomain.name, company: symbol, success: false, skipped: true };
      }

      // Get per-subdomain order config for this specific symbol
      const orderConfig = this.getOrderConfig(orderKey, symbol);

      const orderStart = Date.now();
      try {
        const result = await this.orderService.placeOrder(
          subdomain,
          { ...orderConfig, symbol }
        );
        subdomain.orderTimeMs = Date.now() - orderStart;

        subdomain.status = result.success ? 'order_placed' : 'order_failed';
        const msg = result.success
          ? `✅ ${subdomain.name}: Order placed${companyInfo} (${orderConfig.ORDER_QTY} @ ${orderConfig.ORDER_PRICE}) [${subdomain.orderTimeMs}ms]`
          : `⚠️  ${subdomain.name}: Order response - ${result.message || JSON.stringify(result.response)} [${subdomain.orderTimeMs}ms]`;
        this.log(msg, result.success ? 'success' : 'warning');

        return { subdomain: subdomain.name, company: symbol, success: result.success, result };
      } catch (error) {
        subdomain.orderTimeMs = Date.now() - orderStart;
        subdomain.status = 'order_failed';
        this.log(`❌ ${subdomain.name}: Order failed - ${error.message} [${subdomain.orderTimeMs}ms]`, 'error');
        return { subdomain: subdomain.name, company: symbol, success: false, error: error.message };
      }
    });

    // Fire all simultaneously
    const settled = await Promise.allSettled(orderPromises);
    const results = settled.map(s => s.status === 'fulfilled' ? s.value : { success: false, error: s.reason?.message });

    this.broadcast({ type: 'subdomains', data: this.subdomains });

    const successCount = results.filter(r => r.success).length;
    this.log(`📦 Parallel order complete: ${successCount}/${orderSubdomains.length} successful`, successCount === orderSubdomains.length ? 'success' : 'warning');
    this.broadcast({ type: 'orders_complete', data: results });
    return results;
  }

  getStatus() {
    const orderQuantitiesSubdomains = Object.keys(this.orderQuantities).length;
    const orderQuantitiesSymbols = Object.values(this.orderQuantities).reduce(
      (sum, sub) => sum + Object.keys(sub).length, 0
    );

    return {
      isMonitoring: this.isMonitoring,
      browserOpen: this.browserOpen,
      subdomainCount: this.subdomains.length,
      enabledCount: this.subdomains.filter(s => s.enabled).length,
      priceTarget: this.priceTarget,
      priceCondition: this.priceCondition,
      hasScripts: {
        priceCheck: !!this.priceCheckScript,
        order: !!this.orderScript
      },
      orderQuantities: {
        subdomains: orderQuantitiesSubdomains,
        symbols: orderQuantitiesSymbols,
        configured: orderQuantitiesSubdomains > 0
      },
      preOrders: Object.keys(this.preOrders).length
    };
  }

  getOrderQuantities() {
    return this.orderQuantities;
  }

  getPreOrders() {
    return this.preOrders;
  }

  getAccounts() {
    return companiesConfig.accounts || [];
  }

  getCompanies() {
    return companiesConfig.companies;
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this.log('🗑️  Logs cleared', 'info');
  }
}

module.exports = PriceMonitor;
