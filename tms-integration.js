// TMS Trading Integration Script
// Companies and prices are loaded from config/companies.js (single source of truth)
// To change prices: edit config/companies.js

const { companies, subdomains } = require('./config/companies');

// Build DEFAULT_NATIFY from first company in config
const firstCompany = Object.values(companies)[0];
const DEFAULT_NATIFY = {
    NATIFY_QTY: 10,
    MAX_NATIFY_QTY: 100,
    NATIFY_PRICE: firstCompany ? firstCompany.targetPrice : 0,
    BELOW_PRICE: 0
};

// Per-subdomain overrides (qty, max_qty, collateral differ per subdomain)
// Prices are auto-filled from config/companies.js
const SUBDOMAIN_OVERRIDES = {
    "tms13": {
        "NLO": { NATIFY_QTY: 50, MAX_NATIFY_QTY: 1000, COLLATERAL: 0 },
    },
    "tms17": {
        "NLO": { NATIFY_QTY: 50, MAX_NATIFY_QTY: 1000, COLLATERAL: 0 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
    },
    "tms18": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, BELOW_PRICE: 240, COLLATERAL: 0 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 1000000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 1000 },
    },
    "tms32": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms34": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 600000 }
    },
    "tms35": {
        "NLO": { NATIFY_QTY: 50, MAX_NATIFY_QTY: 1000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms41": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms45": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 1500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 1000 },
    },
    "tms55": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms57": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 1500, COLLATERAL: 0 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 1500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 1000 },
    },
    "tms59": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 1500, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 800000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms61": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms63": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms64": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms74": {
        "NLO": { NATIFY_QTY: 100, MAX_NATIFY_QTY: 2000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms77": {
        "NLO": { NATIFY_QTY: 50, MAX_NATIFY_QTY: 1000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
    "tms87": {
        "NLO": { NATIFY_QTY: 50, MAX_NATIFY_QTY: 1000, COLLATERAL: 0 },
        "SABBL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "RSML": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SWASTIK": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 },
        "SAIL": { NATIFY_QTY: 10, MAX_NATIFY_QTY: 1000, COLLATERAL: 500000 }
    },
};

// Build final natifyQuantities by merging prices from central config
const natifyQuantities = {};
for (const [tms, symbols] of Object.entries(SUBDOMAIN_OVERRIDES)) {
    natifyQuantities[tms] = {};
    for (const [symbol, override] of Object.entries(symbols)) {
        const companyConfig = companies[symbol];
        if (!companyConfig) continue;
        natifyQuantities[tms][symbol] = {
            NATIFY_QTY: override.NATIFY_QTY,
            MAX_NATIFY_QTY: override.MAX_NATIFY_QTY,
            NATIFY_PRICE: companyConfig.targetPrice,  // Price from central config
            BELOW_PRICE: override.BELOW_PRICE || 0,
            COLLATERAL: override.COLLATERAL || 0
        };
    }
}

// Export configuration for easy access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { natifyQuantities, DEFAULT_NATIFY };
}
