const BrowserService = require('./browserService');
const OrderService = require('./orderService');
const RateLimiter = require('../utils/rateLimiter');
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
    this.orderService = new OrderService(this.browserService);
    this.rateLimiter = new RateLimiter(2, 1000); // 2 requests per second
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
      this.priceCheckScript = config.priceCheckScript || '';
      this.orderScript = config.orderScript || '';
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
        // Carry over ATS fields from account config
        if (account.broker) existing.broker = account.broker;
        if (account.acntid) existing.acntid = account.acntid;
        if (account.clientAcc) existing.clientAcc = account.clientAcc;
        // Carry over credentials
        if (account.username) existing.username = account.username;
        if (account.password) existing.password = account.password;
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

      // Load scriptList into orderQuantities (keyed by accountId for ATS)
      if (account.scriptList && account.scriptList.length > 0) {
        const orderKey = accountId;
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

    if (added > 0) {
      this.log(`🔄 Built ${added} subdomains from accounts config (${accounts.length} total accounts)`, 'success');
      this.saveConfig();
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
    this.orderQuantities[subdomainId][symbol] = {
      ORDER_QTY: config.ORDER_QTY || DEFAULT_ORDER.ORDER_QTY,
      MAX_ORDER_QTY: config.MAX_ORDER_QTY || DEFAULT_ORDER.MAX_ORDER_QTY,
      ORDER_PRICE: config.ORDER_PRICE || DEFAULT_ORDER.ORDER_PRICE,
      BELOW_PRICE: config.BELOW_PRICE || DEFAULT_ORDER.BELOW_PRICE,
      COLLATERAL: config.COLLATERAL || DEFAULT_ORDER.COLLATERAL
    };
    this.log(`🎯 Order config set for ${subdomainId}/${symbol}: Price=${config.ORDER_PRICE}, Qty=${config.ORDER_QTY}`, 'info');
    this.saveConfig();
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
    return symbol in subdomainConfig;
  }

  // Get all enabled symbols for a subdomain
  getEnabledSymbols(subdomainId) {
    const subdomainConfig = this.orderQuantities[subdomainId] || {};
    return Object.keys(subdomainConfig);
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

  async openBrowser() {
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
    let cycleCount = 0;
    const loggedInOnce = new Set(); // Track which subdomains we've seen logged in

    // Get subdomains by role
    const getPriceCheckSubdomains = () => this.subdomains.filter(s => s.enabled && (s.role === 'price' || s.role === 'both'));
    const getOrderPlaceSubdomains = () => this.subdomains.filter(s => s.enabled && (s.role === 'order' || s.role === 'both'));

    const priceCheckCount = getPriceCheckSubdomains().length;
    const orderPlaceCount = getOrderPlaceSubdomains().length;

    this.log(`🔄 Starting monitoring:`, 'info');
    this.log(`   📊 Price Check: ${priceCheckCount} subdomains`, 'info');
    this.log(`   📦 Order Place: ${orderPlaceCount} subdomains`, 'info');

    while (this.isMonitoring) {
      cycleCount++;
      const startTime = Date.now();

      // Get subdomains for price checking only
      const subdomainsToCheck = getPriceCheckSubdomains();

      if (subdomainsToCheck.length === 0) {
        this.log('⚠️  No subdomains configured for price checking', 'warning');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      this.log(`🔄 Cycle #${cycleCount}: Checking ${subdomainsToCheck.length} price-check subdomains`, 'info');
      this.broadcast({ type: 'price_check' });

      // Round-robin: Check each price-check subdomain one by one
      for (let i = 0; i < subdomainsToCheck.length; i++) {
        const subdomain = subdomainsToCheck[i];

        if (!this.isMonitoring) break;

        try {
          // Wait for rate limiter (respects 2 req/sec)
          await this.rateLimiter.waitForSlot();

          subdomain.status = 'checking';
          this.broadcast({ type: 'subdomains', data: this.subdomains });

          // Check price on this subdomain (with timing)
          const fetchStart = Date.now();
          const price = await this.checkPrice(subdomain);
          const fetchTimeMs = Date.now() - fetchStart;

          // First successful check - log it
          if (!loggedInOnce.has(subdomain.id)) {
            loggedInOnce.add(subdomain.id);
            this.log(`✅ ${subdomain.name} logged in and active`, 'success');
          }

          subdomain.lastPrice = price;
          subdomain.lastCheck = new Date().toISOString();
          subdomain.fetchTimeMs = fetchTimeMs;
          subdomain.status = 'idle';

          // Attach target price from company config for the matched company
          const company = subdomain.matchedCompany;
          if (company && companiesConfig.companies[company]) {
            subdomain.targetPrice = companiesConfig.companies[company].targetPrice;
          }

          const companyInfo = company ? ` [${company}]` : '';
          this.log(`💰 ${subdomain.name}${companyInfo}: ${price} (target: ${subdomain.targetPrice || '-'}) [${fetchTimeMs}ms]`, 'info');
          this.broadcast({ type: 'subdomains', data: this.subdomains });

          // Check if price matches target
          if (this.checkPriceCondition(price) || subdomain.matched) {
            const company = subdomain.matchedCompany || 'stock';
            this.log(`🎯 PRICE MATCH on ${subdomain.name} for ${company}!`, 'success');

            // Store the matched company globally for all subdomains to use
            this.matchedCompany = subdomain.matchedCompany;

            // Place orders ONLY on order-place subdomains
            const orderSubdomains = this.subdomains.filter(s => s.enabled && (s.role === 'order' || s.role === 'both'));
            if (orderSubdomains.length === 0) {
              this.log(`⚠️  No order-enabled subdomains configured. Continuing to monitor...`, 'warning');
            } else {
              await this.placeOrdersOnOrderSubdomains(subdomain.matchedCompany);
              // Stop monitoring after orders complete
              this.isMonitoring = false;
              this._monitorPromise = null;
              this.log('✅ Orders complete, monitoring stopped. Browser left open for inspection.', 'success');
              return;
            }
          }

        } catch (error) {
          // If monitoring was stopped mid-check, exit silently
          if (!this.isMonitoring) break;

          subdomain.status = 'error';

          // If waiting for login, skip quickly (no delay) - just move to next subdomain
          if (error.message.includes('Waiting for login')) {
            // Only log once per subdomain to avoid spam
            if (!subdomain._loginWarned) {
              this.log(`⏳ ${subdomain.name}: Not logged in yet, skipping...`, 'warning');
              subdomain._loginWarned = true;
            }
            this.broadcast({ type: 'subdomains', data: this.subdomains });
            continue;
          }

          this.log(`❌ Error checking ${subdomain.name}: ${error.message}`, 'error');
          this.broadcast({ type: 'subdomains', data: this.subdomains });
        }
      }

      const cycleTimeMs = Date.now() - startTime;
      this.log(`✅ Cycle #${cycleCount} complete in ${cycleTimeMs}ms (${(cycleTimeMs / 1000).toFixed(1)}s)`, 'info');
      this.broadcast({ type: 'cycle_time', data: { cycle: cycleCount, timeMs: cycleTimeMs } });

      // No delay - immediately start next rotation cycle
    }
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

    // Extract TMS session headers from localStorage for API authentication
    // (suid → host-session-id, __usrsession__.user.id → request-owner)
    const sessionHeaders = await page.evaluate(() => {
      var memberCode = (document.location.hostname.match(/tms(\d+)/) || [])[1] || '';
      var hostSessionId = '';
      var requestOwner = '';
      try {
        var suid = localStorage.getItem("suid");
        if (suid) hostSessionId = btoa(suid);
      } catch(e) {}
      try {
        var session = JSON.parse(localStorage.getItem("__usrsession__"));
        if (session && session.user) requestOwner = session.user.id.toString();
      } catch(e) {}
      return { memberCode, hostSessionId, requestOwner };
    });

    if (sessionHeaders.hostSessionId) {
      page.__tmsHeaders = {
        'membercode': sessionHeaders.memberCode,
        'host-session-id': sessionHeaders.hostSessionId,
        'request-owner': sessionHeaders.requestOwner
      };
    }

    // Execute the user's price check script
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

    // Build list of enabled companies with targets from central config
    const companies = [];
    for (const [symbol, config] of Object.entries(companiesConfig.companies)) {
      if (config.enabled) {
        companies.push({ symbol, target: config.targetPrice });
      }
    }

    const result = await page.evaluate(async (companies) => {
      var baseUrl = document.location.origin + '/atsweb';

      var lastSymbol = null;
      var lastLtp = 0;

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

            if (ltp <= company.target) {
              return JSON.stringify({
                company: company.symbol,
                price: ltp,
                target: company.target,
                matched: true
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
        matched: false
      });
    }, companies);

    // Parse result (same format as NEPSE price check)
    try {
      const parsed = JSON.parse(result);
      if (parsed.company && parsed.price !== undefined) {
        subdomain.matchedCompany = parsed.company;
        subdomain.matched = parsed.matched || false;
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
