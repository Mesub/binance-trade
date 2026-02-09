# NLO Only - Quick Setup

## Stock: NLO
**Target Price: 254.1**

## Quick Start

### 1. Start Server
```bash
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
npm start
```

### 2. Open Dashboard
http://localhost:3000

### 3. Add All 17 Subdomains

Use the auto-setup script or add manually:
- tms13, tms17, tms18, tms32, tms34, tms35, tms41, tms45
- tms55, tms57, tms59, tms61, tms63, tms64, tms74, tms77, tms87

### 4. Configure Scripts

**Price Check Script:**
Copy from: `scripts/nlo-price-check.js`

**Order Placement Script:**
Copy from: `scripts/nlo-order-placement.js`

### 5. Set Target

- **Target Price**: `254.1`
- **Condition**: `Less than or equal (≤)`

### 6. Start Monitoring

Click "▶️ Start Monitoring"

## What Happens

```
🔄 Cycle: Checking 17 subdomains
🔍 Check tms13 (NLO: 255.0) ❌
🔍 Check tms17 (NLO: 254.5) ❌
🔍 Check tms18 (NLO: 254.0) ✅ MATCH!
📦 Place NLO orders on ALL 17 subdomains
✅ Done!
```

## Rotation Time
- **Full cycle**: ~8.5 seconds (17 subdomains ÷ 2 req/sec)
- **Each check**: ~0.5 seconds (rate limit)

## NLO Quantities Per Subdomain

- **tms13, tms17, tms35, tms77, tms87**: 50 units
- **All others**: 100 units
