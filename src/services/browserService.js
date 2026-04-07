const { chromium } = require('playwright');

class BrowserService {
  constructor() {
    this.browser = null;
    this.contexts = new Map(); // Store browser contexts keyed by accountId
    this.pages = new Map(); // Store pages keyed by accountId
  }

  async initialize() {
    if (this.browser) {
      return;
    }

    // Launch browser in non-headless mode so user can login manually
    this.browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });

    // Detect when user manually closes the browser window
    this.browser.on('disconnected', () => {
      console.log('Browser disconnected (manually closed or crashed)');
      this.browser = null;
      this.pages.clear();
      this.contexts.clear();
      if (this.onDisconnected) this.onDisconnected();
    });

    console.log('✅ Browser launched (visible mode for manual login)');
  }

  async getContext(accountId) {
    if (this.contexts.has(accountId)) {
      return this.contexts.get(accountId);
    }

    // Create new browser context (isolated session per account)
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.contexts.set(accountId, context);
    return context;
  }

  async getPage(accountId, url) {
    if (this.pages.has(accountId)) {
      const page = this.pages.get(accountId);
      // Check if page is still open
      if (!page.isClosed()) {
        return page;
      }
    }

    const context = await this.getContext(accountId);
    const page = await context.newPage();

    // Navigate to the URL
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
      console.error(`❌ Error navigating to ${url}:`, error.message);
      throw error;
    }

    // Store page reference (no route interception — scripts build their own headers)
    this.pages.set(accountId, page);
    return page;
  }

  async closePage(accountId) {
    if (this.pages.has(accountId)) {
      const page = this.pages.get(accountId);
      try {
        await page.close();
      } catch (error) {
        // Page might already be closed
      }
      this.pages.delete(accountId);
    }
  }

  async close() {
    // Close all pages
    for (const [accountId, page] of this.pages.entries()) {
      try {
        await page.close();
      } catch (error) {
        // Ignore errors
      }
    }
    this.pages.clear();

    // Close all contexts
    for (const [accountId, context] of this.contexts.entries()) {
      try {
        await context.close();
      } catch (error) {
        // Ignore errors
      }
    }
    this.contexts.clear();

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        // Ignore errors
      }
      this.browser = null;
    }

    console.log('✅ Browser closed');
  }

  async saveCookies(accountId, filepath) {
    const context = await this.getContext(accountId);
    const cookies = await context.cookies();
    const fs = require('fs').promises;
    await fs.writeFile(filepath, JSON.stringify(cookies, null, 2));
    console.log(`💾 Cookies saved for ${accountId}`);
  }

  async loadCookies(accountId, filepath) {
    try {
      const fs = require('fs').promises;
      const cookies = JSON.parse(await fs.readFile(filepath, 'utf8'));
      const context = await this.getContext(accountId);
      await context.addCookies(cookies);
      console.log(`✅ Cookies loaded for ${accountId}`);
    } catch (error) {
      console.log(`⚠️  Could not load cookies for ${accountId}:`, error.message);
    }
  }
}

module.exports = BrowserService;
