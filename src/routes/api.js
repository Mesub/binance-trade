const express = require('express');
const router = express.Router();

// Get companies from central config (config/companies.js)
router.get('/companies', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getCompanies());
});

// Get accounts from central config (config/companies.js)
router.get('/accounts', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getAccounts());
});

// Get all subdomains configuration
router.get('/subdomains', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getSubdomains());
});

// Add or update subdomain
router.post('/subdomains', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { id, url, scriptId, name, accountId, domain, enabled, role, type, broker, acntid, clientAcc } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL and name are required' });
  }

  const subdomain = {
    id,
    url,
    scriptId,
    name,
    accountId: accountId || name,
    domain: domain || '',
    enabled: enabled !== false,
    role: role || 'both',
    type: type || 'nepse'
  };

  // ATS-specific fields
  if (broker) subdomain.broker = broker;
  if (acntid) subdomain.acntid = acntid;
  if (clientAcc) subdomain.clientAcc = clientAcc;

  priceMonitor.addSubdomain(subdomain);
  res.json({ success: true, message: 'Subdomain added/updated' });
});

// Sync subdomains from orderQuantities config
router.post('/subdomains/sync', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const result = priceMonitor.syncSubdomainsFromOrderQuantities();
  res.json({ success: true, ...result });
});

// Remove subdomain
router.delete('/subdomains/:id', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  priceMonitor.removeSubdomain(req.params.id);
  res.json({ success: true, message: 'Subdomain removed' });
});

// Set price checking script
router.post('/price-script', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { script } = req.body;

  if (!script) {
    return res.status(400).json({ error: 'Script is required' });
  }

  priceMonitor.setPriceCheckScript(script);
  res.json({ success: true, message: 'Price check script updated' });
});

// Set order placement script
router.post('/order-script', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { script } = req.body;

  if (!script) {
    return res.status(400).json({ error: 'Script is required' });
  }

  priceMonitor.setOrderScript(script);
  res.json({ success: true, message: 'Order script updated' });
});

// Set price target
router.post('/price-target', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { target, condition } = req.body;

  if (target === undefined) {
    return res.status(400).json({ error: 'Target price is required' });
  }

  priceMonitor.setPriceTarget(target, condition || 'lte');
  res.json({ success: true, message: 'Price target set' });
});

// Open browser and TMS pages (for login)
router.post('/browser/open', async (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  try {
    await priceMonitor.openBrowser();
    res.json({ success: true, message: 'Browser opened, log in to all tabs' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start monitoring
router.post('/monitor/start', async (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  try {
    await priceMonitor.start();
    res.json({ success: true, message: 'Monitoring started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop monitoring
router.post('/monitor/stop', async (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  try {
    await priceMonitor.stop();
    res.json({ success: true, message: 'Monitoring stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monitoring status
router.get('/monitor/status', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getStatus());
});

// Get logs
router.get('/logs', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getLogs());
});

// Clear logs
router.delete('/logs', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  priceMonitor.clearLogs();
  res.json({ success: true, message: 'Logs cleared' });
});

// Save company configuration
router.post('/company-config', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  priceMonitor.companyConfig = req.body;
  priceMonitor.saveConfig();
  res.json({ success: true, message: 'Company config saved' });
});

// Get company configuration
router.get('/company-config', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.companyConfig || {});
});

// ============================================
// ORDER QUANTITIES (Per-subdomain, per-stock)
// ============================================

// Get all order quantities configuration
router.get('/order-quantities', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getOrderQuantities());
});

// Set all order quantities (bulk update)
router.post('/order-quantities', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { orderQuantities } = req.body;

  if (!orderQuantities || typeof orderQuantities !== 'object') {
    return res.status(400).json({ error: 'orderQuantities object is required' });
  }

  priceMonitor.setOrderQuantities(orderQuantities);
  res.json({ success: true, message: 'Order quantities configured' });
});

// Set order quantity for specific subdomain/symbol
router.post('/order-quantities/:subdomainId/:symbol', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { subdomainId, symbol } = req.params;
  const config = req.body;

  if (!config.ORDER_PRICE) {
    return res.status(400).json({ error: 'ORDER_PRICE is required' });
  }

  priceMonitor.setOrderQuantity(subdomainId, symbol, config);
  res.json({ success: true, message: `Order config set for ${subdomainId}/${symbol}` });
});

// Remove order config for specific subdomain/symbol
router.delete('/order-quantities/:subdomainId/:symbol', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { subdomainId, symbol } = req.params;
  priceMonitor.removeOrderQuantity(subdomainId, symbol);
  res.json({ success: true, message: `Removed ${symbol} from ${subdomainId}` });
});

// Get order config for specific subdomain/symbol
router.get('/order-quantities/:subdomainId/:symbol', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { subdomainId, symbol } = req.params;
  res.json(priceMonitor.getOrderConfig(subdomainId, symbol));
});

// Get enabled symbols for a subdomain
router.get('/order-quantities/:subdomainId/symbols', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { subdomainId } = req.params;
  res.json(priceMonitor.getEnabledSymbols(subdomainId));
});

// ============================================
// PRE-ORDERS
// ============================================

// Get pre-orders configuration
router.get('/pre-orders', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  res.json(priceMonitor.getPreOrders());
});

// Set pre-orders configuration
router.post('/pre-orders', (req, res) => {
  const priceMonitor = req.app.get('priceMonitor');
  const { preOrders } = req.body;

  if (!preOrders || typeof preOrders !== 'object') {
    return res.status(400).json({ error: 'preOrders object is required' });
  }

  priceMonitor.setPreOrders(preOrders);
  res.json({ success: true, message: 'Pre-orders configured' });
});

module.exports = router;
