# How The Price Monitor Bot Works

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR COMPUTER                           │
│                                                                 │
│  ┌─────────────┐     ┌─────────────────────────────────────┐   │
│  │             │     │           BOT (Node.js)              │   │
│  │  Dashboard  │◄───►│  - Opens 17 browser tabs             │   │
│  │  (Browser)  │     │  - Checks prices in rotation         │   │
│  │             │     │  - Places orders automatically       │   │
│  └─────────────┘     └─────────────────────────────────────┘   │
│        │                           │                            │
│        │                           │ Opens                      │
│        ▼                           ▼                            │
│  http://localhost:3000      17 Browser Windows                  │
│                              (for manual login)                 │
└─────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Connects to
                                     ▼
                    ┌─────────────────────────────────────┐
                    │         TMS WEBSITES                │
                    │                                     │
                    │  tms13.nepsetms.com.np             │
                    │  tms17.nepsetms.com.np             │
                    │  tms18.nepsetms.com.np             │
                    │  ... (17 subdomains)               │
                    └─────────────────────────────────────┘
```

## Step-by-Step Workflow

### STEP 1: Start the Bot

```bash
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
npm start
```

**What happens:**
- Bot server starts on your computer
- Dashboard becomes available at http://localhost:3000

### STEP 2: Open Dashboard

Open your browser and go to: **http://localhost:3000**

**What you see:**
- Configuration panel (left)
- Subdomains list (right)
- Logs panel (bottom)

### STEP 3: Add Your Subdomains

In the dashboard, add all 17 TMS URLs:

| URL | Name | Script ID |
|-----|------|-----------|
| https://tms13.nepsetms.com.np | TMS 13 | tms13 |
| https://tms17.nepsetms.com.np | TMS 17 | tms17 |
| ... | ... | ... |

**Or use the auto-setup script** (see below)

### STEP 4: Configure Scripts

1. **Price Check Script**: Copy from `scripts/multi-company-price-check.js`
2. **Order Placement Script**: Copy from `scripts/multi-company-order-placement.js`
3. **Set Target Price**: Enter the lowest target price (e.g., 254.1)

### STEP 5: Click "Start Monitoring"

**What happens next:**

1. **Bot opens 17 browser windows** (one for each subdomain)
2. **You manually login** to each TMS site
3. **After login, bot starts checking prices**

### STEP 6: Manual Login (One-Time)

When the 17 browser windows open:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ TMS 13          │  │ TMS 17          │  │ TMS 18          │
│                 │  │                 │  │                 │
│  Login Page     │  │  Login Page     │  │  Login Page     │
│                 │  │                 │  │                 │
│  [Username]     │  │  [Username]     │  │  [Username]     │
│  [Password]     │  │  [Password]     │  │  [Password]     │
│  [LOGIN]        │  │  [LOGIN]        │  │  [LOGIN]        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
       ▲                    ▲                    ▲
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                   YOU LOGIN MANUALLY
                   (one time per session)
```

**Login to each site manually. The bot keeps these sessions active.**

### STEP 7: Monitoring Begins

After you're logged in, the bot:

```
🔄 Cycle #1: Checking 17 subdomains in rotation

🔍 [1/17] TMS 13
   └─ Check NLO: 255.0 (Target: ≤254.1) ❌
   └─ Check SYPNL: 685.0 (Target: ≤684.8) ❌

🔍 [2/17] TMS 17
   └─ Check NLO: 254.0 (Target: ≤254.1) ✅ MATCH!

📦 PLACING ORDERS ON ALL 17 SUBDOMAINS FOR NLO...
   └─ TMS 13: ✅ Order placed
   └─ TMS 17: ✅ Order placed
   └─ TMS 18: ✅ Order placed
   └─ ... (all 17)

⏹️ Monitoring stopped
```

## Where Do Sites Open?

### Browser Windows

When you click "Start Monitoring":

1. **Bot opens Chrome/Chromium browser**
2. **Creates 17 separate tabs/windows**
3. **Each window goes to one TMS subdomain**
4. **Windows stay VISIBLE so you can login**

```
Your Screen:
┌────────────────────────────────────────────────────────────┐
│ Chrome Browser (controlled by bot)                         │
├────────────────────────────────────────────────────────────┤
│ Tab 1: tms13.nepsetms.com.np                              │
│ Tab 2: tms17.nepsetms.com.np                              │
│ Tab 3: tms18.nepsetms.com.np                              │
│ Tab 4: tms32.nepsetms.com.np                              │
│ ... (17 tabs total)                                        │
└────────────────────────────────────────────────────────────┘
```

### Dashboard (Separate)

Keep the dashboard open in your **regular browser**:

```
Your Regular Browser (Firefox/Edge/Chrome):
┌────────────────────────────────────────────────────────────┐
│ http://localhost:3000 - Price Monitor Dashboard            │
├────────────────────────────────────────────────────────────┤
│ [Configuration Panel]    [Subdomains List]                 │
│                                                            │
│ Price Target: [254.1]    TMS 13: Checking... NLO=255      │
│ Condition: [≤]           TMS 17: Idle                      │
│                          TMS 18: Idle                      │
│ [Start] [Stop]           ...                               │
│                                                            │
│ [LOGS]                                                     │
│ 10:30:15 Checking TMS 13...                               │
│ 10:30:15 NLO: 255.0 (Target: ≤254.1)                      │
│ 10:30:16 Checking TMS 17...                               │
└────────────────────────────────────────────────────────────┘
```

## Where to Change Prices?

### Option 1: In the Script (Recommended)

Edit `scripts/multi-company-price-check.js`:

```javascript
// Line 15-21: Change target prices here
const TARGET_PRICES = {
    'NLO': 254.1,        // ← CHANGE THIS
    'SYPNL': 684.8,      // ← CHANGE THIS
    'JHAPA': 1073.6,     // ← CHANGE THIS
    'SWASTIK': 2327.0,   // ← CHANGE THIS
    'SAIL': 781.7        // ← CHANGE THIS
};
```

### Option 2: In the Config File

Edit `config/companies.js`:

```javascript
companies: {
    'NLO': {
        enabled: true,
        targetPrice: 254.1,  // ← CHANGE THIS
    },
    'SYPNL': {
        enabled: true,
        targetPrice: 684.8,  // ← CHANGE THIS
    },
    // ...
}
```

### Option 3: In the Dashboard

After copying the script to dashboard:
- Change the `TARGET_PRICES` values directly in the textarea
- Click "Save Script"

## Complete Flow Diagram

```
YOU                          BOT                         TMS SITES
 │                            │                              │
 │  1. npm start              │                              │
 │ ─────────────────────────► │                              │
 │                            │                              │
 │  2. Open localhost:3000    │                              │
 │ ─────────────────────────► │                              │
 │                            │                              │
 │  3. Add subdomains         │                              │
 │ ─────────────────────────► │                              │
 │                            │                              │
 │  4. Paste scripts          │                              │
 │ ─────────────────────────► │                              │
 │                            │                              │
 │  5. Set target price       │                              │
 │ ─────────────────────────► │                              │
 │                            │                              │
 │  6. Click "Start"          │                              │
 │ ─────────────────────────► │  Opens 17 browsers           │
 │                            │ ────────────────────────────►│
 │                            │                              │
 │  7. Login to each site     │                              │
 │ ──────────────────────────────────────────────────────────►
 │                            │                              │
 │                            │  8. Check prices (rotation)  │
 │                            │ ◄───────────────────────────►│
 │                            │                              │
 │  9. Watch dashboard        │  10. Price matches!          │
 │ ◄──────────────────────────│                              │
 │                            │                              │
 │                            │  11. Place orders            │
 │                            │ ────────────────────────────►│
 │                            │                              │
 │  12. See results           │  13. Orders complete         │
 │ ◄──────────────────────────│ ◄────────────────────────────│
 │                            │                              │
```

## Summary

| What | Where |
|------|-------|
| **Dashboard** | http://localhost:3000 (your regular browser) |
| **TMS Sites** | Opens automatically in Chromium (17 windows) |
| **Login** | YOU login manually to each TMS window |
| **Price Config** | `scripts/multi-company-price-check.js` or `config/companies.js` |
| **Start/Stop** | Dashboard buttons |
| **Logs** | Dashboard (bottom panel) |

## Quick Commands

```bash
# Start everything
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
npm start

# Open dashboard
# Go to: http://localhost:3000

# Then:
# 1. Add subdomains (or use auto-setup)
# 2. Paste scripts
# 3. Set target price
# 4. Click Start
# 5. Login to TMS sites
# 6. Watch prices!
```

**That's it!** The bot handles everything else automatically. 🚀
