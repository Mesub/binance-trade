# ✅ Multi-Company Monitoring - READY!

You can now monitor **1 to 5 companies simultaneously** across all 17 subdomains!

## Companies Available

| Company | Target Price | Status |
|---------|-------------|--------|
| **NLO** | 254.1 | ✅ Ready |
| **SYPNL** | 684.8 | ✅ Ready |
| **JHAPA** | 1073.6 | ✅ Ready |
| **SWASTIK** | 2327.0 | ✅ Ready |
| **SAIL** | 781.7 | ✅ Ready |

## Quick Start (4 Steps)

### 1️⃣ Start Server

```bash
npm start
```

Open: **http://localhost:3000**

### 2️⃣ Configure Companies

Edit `scripts/multi-company-price-check.js`:

```javascript
// Enable/Disable companies you want to monitor
const COMPANIES_TO_MONITOR = {
    'NLO': true,        // ✅ Enabled
    'SYPNL': true,      // ✅ Enabled
    'JHAPA': false,     // ❌ Disabled
    'SWASTIK': true,    // ✅ Enabled
    'SAIL': false       // ❌ Disabled
};
```

### 3️⃣ Copy Scripts to Dashboard

**Price Check:**
- Copy `scripts/multi-company-price-check.js`
- Paste in dashboard → "Price Check Script"
- Click "Save Script"

**Order Placement:**
- Copy `scripts/multi-company-order-placement.js`
- Paste in dashboard → "Order Placement Script"
- Click "Save Script"

### 4️⃣ Set Target & Start

- **Target**: Use the **lowest** price of enabled companies (e.g., 254.1 if NLO is enabled)
- **Condition**: `Less than or equal (≤)`
- Click: "▶️ Start Monitoring"

## How It Works

```
Monitor: NLO, SYPNL, SWASTIK (enabled)

Rotation:
  TMS 13: Check NLO, SYPNL, SWASTIK → All above target
  TMS 17: Check NLO (254.0 ✅) → MATCH!

Place Orders:
  → Place NLO orders on ALL 17 subdomains
  → Stop monitoring
```

## Files Created

| File | Purpose |
|------|---------|
| `MULTI-COMPANY-SETUP.md` | **← START HERE** - Complete guide |
| `scripts/multi-company-price-check.js` | Multi-company price checking |
| `scripts/multi-company-order-placement.js` | Multi-company order placement |
| `scripts/nlo-price-check.js` | Single company (NLO only) |
| `scripts/nlo-order-placement.js` | Single company order placement |
| `NLO-ONLY-CONFIG.md` | NLO-specific configuration |
| `NLO-SETUP.md` | NLO-specific setup guide |

## Configuration Examples

### Monitor Only NLO
```javascript
NLO: true, others: false
Target: 254.1
```

### Monitor NLO + SYPNL
```javascript
NLO: true, SYPNL: true, others: false
Target: 254.1 (lowest)
```

### Monitor All 5 Companies
```javascript
All: true
Target: 254.1 (NLO - lowest)
```

### Monitor High-Value Only
```javascript
JHAPA: true, SWASTIK: true, SAIL: true, others: false
Target: 781.7 (SAIL - lowest of the three)
```

## System Updated

✅ **Backend** updated to handle multi-company monitoring
✅ **Price checking** supports JSON response with company info
✅ **Order placement** receives matched company name
✅ **Logs** show which company matched
✅ **All 5 companies** configured and ready

## Key Features

**Flexible Monitoring:**
- Enable/disable any combination of companies
- Each company has its own target price
- System checks all enabled companies per subdomain

**Smart Order Placement:**
- Places orders only for the matched company
- Orders go to all 17 subdomains
- Rate limited (2 req/sec)

**Real-time Tracking:**
- Logs show which company is being checked
- Dashboard displays company name with each price
- Order status tracked per subdomain

## Next Steps

1. ✅ Read `MULTI-COMPANY-SETUP.md` for detailed instructions
2. ✅ Edit `scripts/multi-company-price-check.js` to enable desired companies
3. ✅ Copy scripts to dashboard
4. ✅ Set target price (use lowest enabled company's price)
5. ✅ Start monitoring!

## Need Help?

- **Full Guide**: `MULTI-COMPANY-SETUP.md`
- **NLO Only**: `NLO-SETUP.md`
- **General Docs**: `README.md`, `TMS-SETUP-GUIDE.md`

---

**You're all set!** 🚀

The system now supports:
- ✅ Single company monitoring (NLO, SYPNL, JHAPA, SWASTIK, or SAIL)
- ✅ Multi-company monitoring (any combination)
- ✅ 17 subdomains in round-robin rotation
- ✅ Automatic order placement when price matches
- ✅ Company-specific configuration per subdomain

Start monitoring now! 📈💰
