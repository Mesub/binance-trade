// ============================================
// COMPANY CONFIGURATION
// Edit this file to change target prices and enable/disable companies
// ============================================

module.exports = {
    // Companies to monitor (set to true to enable, false to disable)
    companies: {
        'NLO': {
            enabled: true,
            targetPrice: 254.1,       // ← CHANGE TARGET PRICE HERE
            qty: 50
        },
        'SYPNL': {
            enabled: true,
            targetPrice: 684.8,       // ← CHANGE TARGET PRICE HERE
            qty: 10
        },
        'JHAPA': {
            enabled: false,           // ← Disabled
            targetPrice: 1073.6,
            qty: 10
        },
        'SWASTIK': {
            enabled: true,
            targetPrice: 2327.0,      // ← CHANGE TARGET PRICE HERE
            qty: 10
        },
        'SAIL': {
            enabled: false,           // ← Disabled
            targetPrice: 781.7,
            qty: 10
        }
    },

    // Your TMS subdomains
    subdomains: [
        'tms13', 'tms17', 'tms18', 'tms32', 'tms34', 'tms35', 'tms41', 'tms45',
        'tms55', 'tms57', 'tms59', 'tms61', 'tms63', 'tms64', 'tms74', 'tms77', 'tms87'
    ],

    // Your TMS domain (CHANGE THIS!)
    domain: 'nepsetms.com.np'  // ← CHANGE TO YOUR ACTUAL DOMAIN
};
