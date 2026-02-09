# Price Monitor Bot

Automated price monitoring and order placement system for multiple subdomains with rate limiting.

## Features

- **Multi-Subdomain Support**: Monitor 16+ subdomains simultaneously
- **Rate Limiting**: Built-in 2 requests per second rate limiter
- **Custom Scripts**: Use your own JavaScript code for price checking and order placement
- **Real-time Dashboard**: Web-based interface with live updates via WebSocket
- **Browser Automation**: Powered by Playwright for reliable browser control
- **Manual Login**: Opens visible browsers for manual authentication
- **Flexible Price Matching**: Support for various price conditions (≤, ≥, =)
- **Automatic Order Placement**: Places orders on all enabled subdomains when price matches

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

1. Navigate to the project directory:
```bash
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

## Usage

### 1. Start the Server

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

### 2. Open the Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

### 3. Configure Your Bot

#### A. Add Subdomains

1. In the "Subdomains" panel, enter:
   - **URL**: Full URL of the subdomain (e.g., `https://sub1.example.com`)
   - **Name**: A friendly name for identification
   - **Script ID**: (Optional) A unique identifier if different per subdomain

2. Click "Add" to add the subdomain

3. Repeat for all your subdomains (16+)

#### B. Set Price Target

1. Enter your target price
2. Select the condition:
   - **Less than or equal (≤)**: Trigger when price drops to or below target
   - **Greater than or equal (≥)**: Trigger when price rises to or above target
   - **Equal (=)**: Trigger when price exactly matches target

3. Click "Set Target"

#### C. Configure Price Check Script

This is the JavaScript code that will run in the browser to extract the price.

**Example:**
```javascript
// scriptId parameter is available
return parseFloat(
  document.querySelector('.price').textContent.replace('$', '')
);
```

Or if using scriptId:
```javascript
// Use the scriptId to find specific elements
return parseFloat(
  document.querySelector(`#item-${scriptId} .price`).textContent.replace('$', '')
);
```

Paste your script in the "Price Check Script" textarea and click "Save Script".

#### D. Configure Order Placement Script

This is the JavaScript code that will run to place an order when price matches.

**Example:**
```javascript
// Simple click
document.querySelector('.buy-now-button').click();
return true;
```

Or with scriptId:
```javascript
// Use scriptId for specific items
document.querySelector(`#item-${scriptId} .buy-button`).click();

// Wait for confirmation
await new Promise(resolve => setTimeout(resolve, 1000));

// Confirm purchase
document.querySelector('.confirm-purchase').click();

return true;
```

Paste your script in the "Order Placement Script" textarea and click "Save Script".

### 4. Manual Login

Before starting monitoring:

1. The system will open browser windows for each subdomain
2. **Manually log in** to each subdomain in the opened browser windows
3. The sessions will be maintained throughout the monitoring

### 5. Start Monitoring

1. Click the "▶️ Start Monitoring" button
2. The bot will:
   - Check prices on each enabled subdomain sequentially
   - Respect the 2 requests/second rate limit
   - Display real-time price updates in the dashboard
   - When a price matches your target, automatically place orders on ALL enabled subdomains
   - Stop monitoring after successful order placement

### 6. Monitor Progress

- **Status Indicator**: Shows current state (Idle/Monitoring)
- **Subdomains Panel**: Shows each subdomain's status, current price, and last check time
- **Logs Panel**: Real-time logs of all activities

**What Happens During Monitoring:**

```
[Cycle 1]
🔍 Checking Store 1... → 💰 Price = $105 (Target: ≤ $99) ❌
   ⏱️  Wait 0.5s (rate limit)
🔍 Checking Store 2... → 💰 Price = $102 (Target: ≤ $99) ❌
   ⏱️  Wait 0.5s (rate limit)
🔍 Checking Store 3... → 💰 Price = $98 (Target: ≤ $99) ✅
   🎯 PRICE MATCH!
   📦 Placing orders on ALL stores...
   ✅ Order placed on Store 1
   ✅ Order placed on Store 2
   ✅ Order placed on Store 3
   ⏹️  Monitoring stopped
```

If no match is found, it continues rotating:
```
[Cycle 1] Store 1 → Store 2 → ... → Store 16 (8 seconds)
[Cycle 2] Store 1 → Store 2 → ... → Store 16 (8 seconds)
[Cycle 3] Store 1 → Store 2 → ... (until match found)
```

## How It Works

### Round-Robin Rotation System

The bot uses a **continuous rotation** strategy to check prices:

1. **Subdomain 1** → Wait (rate limit) → **Subdomain 2** → Wait → **Subdomain 3** → ... → **Subdomain N**
2. Immediately rotate back to **Subdomain 1** and repeat
3. Continues cycling through all enabled subdomains until price matches

**Example with 16 subdomains:**
- Check Site 1 (0.5s wait) → Site 2 (0.5s wait) → Site 3 (0.5s wait)... → Site 16
- **Total cycle time**: ~8 seconds (16 subdomains ÷ 2 req/sec)
- Immediately start next cycle: Site 1 → Site 2 → Site 3...

### Process Flow

1. **Rate-Limited Checking**: Checks one subdomain at a time, respecting the 2 req/sec limit
2. **Price Monitoring**: Each check executes your custom price script to extract the price
3. **Continuous Rotation**: After checking all subdomains, immediately starts over from the first one
4. **Price Matching**: When a price meets your condition on ANY subdomain, triggers order placement
5. **Order Placement**: Orders are placed on ALL enabled subdomains (each with its own scriptId if needed)
6. **Auto-Stop**: Monitoring stops after orders are placed

## API Endpoints

The bot exposes a REST API:

- `GET /api/subdomains` - Get all subdomains
- `POST /api/subdomains` - Add/update subdomain
- `DELETE /api/subdomains/:id` - Remove subdomain
- `POST /api/price-script` - Set price check script
- `POST /api/order-script` - Set order placement script
- `POST /api/price-target` - Set price target
- `POST /api/monitor/start` - Start monitoring
- `POST /api/monitor/stop` - Stop monitoring
- `GET /api/monitor/status` - Get current status
- `GET /api/logs` - Get logs
- `DELETE /api/logs` - Clear logs

## Configuration Persistence

All configuration (subdomains, scripts, targets) is saved to `config/config.json` and automatically loaded on restart.

## Troubleshooting

### Browser doesn't open
- Make sure Playwright browsers are installed: `npx playwright install chromium`

### Price check fails
- Verify your price check script syntax
- Open browser console to test your script manually
- Ensure the price element exists on the page

### Order placement fails
- Test your order script manually in the browser console
- Add delays if needed: `await new Promise(r => setTimeout(r, 1000))`
- Check for confirmation dialogs or multi-step flows

### Rate limit issues
- The bot enforces 2 req/sec automatically
- If you see 429 errors, the site may have stricter limits
- Adjust the rate in `src/utils/rateLimiter.js`

## Advanced Configuration

### Change Rate Limit

Edit `src/services/priceMonitor.js`:
```javascript
this.rateLimiter = new RateLimiter(2, 1000); // 2 requests per 1000ms
```

Change to:
```javascript
this.rateLimiter = new RateLimiter(1, 1000); // 1 request per second
```

### Save/Load Cookies

The BrowserService supports cookie persistence:
```javascript
await browserService.saveCookies(url, './cookies/site.json');
await browserService.loadCookies(url, './cookies/site.json');
```

## Security Notes

- The bot runs browsers in visible mode for manual login
- Sessions are maintained in browser contexts
- No passwords are stored
- Scripts are executed in the browser context (use with caution)

## Support

For issues or questions, check:
1. Browser console for errors
2. Server logs in terminal
3. Dashboard logs panel

## License

MIT
