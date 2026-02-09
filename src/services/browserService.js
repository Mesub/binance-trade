const { chromium } = require('playwright');

class BrowserService {
  constructor() {
    this.browser = null;
    this.contexts = new Map(); // Store browser contexts for each subdomain
    this.pages = new Map(); // Store pages for each URL
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

    console.log('✅ Browser launched (visible mode for manual login)');
  }

  async getContext(url) {
    const domain = new URL(url).origin;

    if (this.contexts.has(domain)) {
      return this.contexts.get(domain);
    }

    // Create new browser context (isolated session)
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.contexts.set(domain, context);
    return context;
  }

  async getPage(url) {
    if (this.pages.has(url)) {
      const page = this.pages.get(url);
      // Check if page is still open
      if (!page.isClosed()) {
        return page;
      }
    }

    const context = await this.getContext(url);
    const page = await context.newPage();

    // Intercept /tmsapi/ requests to inject TMS session headers.
    // Headers are populated by priceMonitor.checkPrice() from localStorage
    // (suid → host-session-id, __usrsession__ → request-owner).
    page.__tmsHeaders = {};
    await page.route('**/tmsapi/**', async (route) => {
      const reqHeaders = route.request().headers();

      // If request already has session headers (Angular app), just pass through
      if (reqHeaders['host-session-id']) {
        await route.continue();
        return;
      }

      // Inject stored headers into requests that don't have them (our scripts)
      if (page.__tmsHeaders['host-session-id']) {
        const headers = { ...reqHeaders, ...page.__tmsHeaders };
        await route.continue({ headers });
      } else {
        await route.continue();
      }
    });

    // Navigate to the URL
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
      console.error(`❌ Error navigating to ${url}:`, error.message);
      throw error;
    }

    this.pages.set(url, page);
    return page;
  }

  async closePage(url) {
    if (this.pages.has(url)) {
      const page = this.pages.get(url);
      try {
        await page.close();
      } catch (error) {
        // Page might already be closed
      }
      this.pages.delete(url);
    }
  }

  async close() {
    // Close all pages
    for (const [url, page] of this.pages.entries()) {
      try {
        await page.close();
      } catch (error) {
        // Ignore errors
      }
    }
    this.pages.clear();

    // Close all contexts
    for (const [domain, context] of this.contexts.entries()) {
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

  async saveCookies(url, filepath) {
    const context = await this.getContext(url);
    const cookies = await context.cookies();
    const fs = require('fs').promises;
    await fs.writeFile(filepath, JSON.stringify(cookies, null, 2));
    console.log(`💾 Cookies saved for ${url}`);
  }

  async loadCookies(url, filepath) {
    try {
      const fs = require('fs').promises;
      const cookies = JSON.parse(await fs.readFile(filepath, 'utf8'));
      const context = await this.getContext(url);
      await context.addCookies(cookies);
      console.log(`✅ Cookies loaded for ${url}`);
    } catch (error) {
      console.log(`⚠️  Could not load cookies for ${url}:`, error.message);
    }
  }
}

module.exports = BrowserService;
