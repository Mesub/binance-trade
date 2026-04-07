// ============================================
// COMPANY CONFIGURATION - SINGLE SOURCE OF TRUTH
// ============================================
// Add/remove/edit companies HERE ONLY.
// All other files (frontend, scripts, tms-integration) read from this file.
// To add a new company: just add a new entry below and restart the server.
// ============================================

module.exports = {
    companies: {
        'HFIN': {
            enabled: true,
            targetPrice: 563.0,
            qty: 50
        },
        'NLO': {
            enabled: false,
            targetPrice: 269.4,
            qty: 50
        }
    },

    // Each entry = one unique login session (browser tab)
    // name: unique display name (used as accountId)
    // tms: the TMS subdomain part (e.g., 'tms13')
    // domain: the domain (e.g., 'nepsetms.com.np' or 'dynamic44.com')
    // type: 'nepse' or 'ats'
    // role: 'price', 'order', or 'both'
    // username/password: auto-login credentials (optional, leave blank for manual login)
    // scriptList (optional): per-symbol order config [{ symbol, ORDER_QTY, MAX_ORDER_QTY, ORDER_PRICE }]
    // ATS-specific (optional): broker, acntid, clientAcc
    // URL is derived: https://${tms}.${domain}/ (NEPSE) or https://${tms}.${domain}/atsweb (ATS)
    accounts: [
        // { name: 'TMS13', tms: 'tms13', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS17', tms: 'tms17', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
         { name: 'TMS18', tms: 'tms18', domain: 'nepsetms.com.np', type: 'nepse', role: 'order', username: '', password: '',
          scriptList: [
              { symbol: 'NLO', ORDER_QTY: 50, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 },
              { symbol: 'BJHL', ORDER_QTY: 10, MAX_ORDER_QTY: 2000, ORDER_PRICE: 330.0 },
              { symbol: 'HFIN', ORDER_QTY: 50, MAX_ORDER_QTY: 500, ORDER_PRICE: 563.0 }
          ]
        },
        // { name: 'TMS32', tms: 'tms32', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS34', tms: 'tms34', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS35', tms: 'tms35', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS41', tms: 'tms41', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
         { name: 'TMS45', tms: 'tms45', domain: 'nepsetms.com.np', type: 'nepse', role: 'order', username: '', password: '',
          scriptList: [
              { symbol: 'NLO', ORDER_QTY: 50, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 },
              { symbol: 'HFIN', ORDER_QTY: 10, MAX_ORDER_QTY: 500, ORDER_PRICE: 563.0 }
          ]
        },
        // { name: 'TMS55', tms: 'tms55', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS57', tms: 'tms57', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS59', tms: 'tms59', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS61', tms: 'tms61', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS63', tms: 'tms63', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS64', tms: 'tms64', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS74', tms: 'tms74', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS77', tms: 'tms77', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
        // { name: 'TMS87', tms: 'tms87', domain: 'nepsetms.com.np', type: 'nepse', role: 'both', username: '', password: '' },
         { name: 'TMS93', tms: 'tms93', domain: 'nepsetms.com.np', type: 'nepse', role: 'order', username: '', password: '',
          scriptList: [
              { symbol: 'HFIN', ORDER_QTY: 50, MAX_ORDER_QTY: 500, ORDER_PRICE: 563.0 },
              { symbol: 'NLO', ORDER_QTY: 50, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 }
          ]
        },

        // Example: same TMS, different user
        // { name: 'TMS13-B', tms: 'tms13', domain: 'nepsetms.com.np', type: 'nepse', role: 'order' },

        // ATS accounts (each gets its own browser context + login session)
        // URL derived as: https://${tms}.${domain}/atsweb for type='ats'
        // { name: 'BHAGWOTI', tms: 'tms', domain: 'stockhouse.com.np', type: 'ats', role: 'both',
        //   username: '', password: '',
        //   broker: 'NSH', acntid: '60152', clientAcc: '202206093068140 ( BHAGWOTI ADHIKARI-)',
        //   scriptList: [
        //       { symbol: 'SABBL', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 712.8 },
        //       { symbol: 'RSML', ORDER_QTY: 50, MAX_ORDER_QTY: 2500, ORDER_PRICE: 675.3 },
        //       { symbol: 'NLO', ORDER_QTY: 100, MAX_ORDER_QTY: 1000, ORDER_PRICE: 254.1 }
        //   ]
        // },
        // { name: 'SUBASH', tms: 'tms', domain: 'stockhouse.com.np', type: 'ats', role: 'both',
        //   username: '', password: '',
        //   broker: 'NSH', acntid: '75684', clientAcc: '202101051789279 ( SUBASH ADHIKARI-461002/1233 )',
        //   scriptList: [
        //       { symbol: 'SABBL', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 712.8 },
        //       { symbol: 'RSML', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 675.3 }
        //   ]
        // },
        // { name: 'SUBASH64', tms: 'tms', domain: 'sunsecurities.com', type: 'ats', role: 'both',
        //   username: '', password: '',
        //   broker: 'NSH', acntid: '4731', clientAcc: '202101051789279 ( SUBASH ADHIKARI-)',
        //   scriptList: [
        //       { symbol: 'RSML', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 300 },
        //       { symbol: 'SABBL', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 300 },
        //       { symbol: 'NLO', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 254.1 }
        //   ]
        // },
        // { name: 'SUBASH36', tms: 'tms', domain: 'ssl.com.np', type: 'ats', role: 'both',
        //   username: '', password: '',
        //   broker: 'NSH', acntid: '61994', clientAcc: '202101051789279 ( Subash Adhikari-461002/1233)',
        //   scriptList: [
        //       { symbol: 'RSML', ORDER_QTY: 10, MAX_ORDER_QTY: 400, ORDER_PRICE: 781.7 },
        //       { symbol: 'SABBL', ORDER_QTY: 10, MAX_ORDER_QTY: 200, ORDER_PRICE: 887.3 },
        //       { symbol: 'NLO', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 254.1 }
        //   ]
        // },
        { name: 'SUBASH75', tms: 'tms', domain: 'nimbstock.com.np', type: 'ats', role: 'both',
          username: '', password: '',
          broker: 'NIMB', acntid: '13816', clientAcc: '202101051789279 ( SUBASH ADHIKARI-SA75020)',
          scriptList: [
              { symbol: 'HFIN', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 563.0 },
              { symbol: 'NLO', ORDER_QTY: 100, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 }
          ]
        },
        { name: 'SUBASH92', tms: 'tms', domain: 'roadshowsecurities.com.np', type: 'ats', role: 'both',
          username: '', password: '',
          broker: 'RSL', acntid: '5328', clientAcc: '202101051789279 ( Subash Adhikari-SA92008)',
          scriptList: [
              { symbol: 'HFIN', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 563.0 },
              { symbol: 'NLO', ORDER_QTY: 100, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 }
          ]
        },
        { name: 'ATRADE64', tms: 'tms', domain: 'sunsecurities.com', type: 'ats', role: 'both',
          username: '', password: '',
          broker: 'NSH', acntid: '', clientAcc: '',
          scriptList: [
              { symbol: 'HFIN', ORDER_QTY: 50, MAX_ORDER_QTY: 500, ORDER_PRICE: 563.0 },
              { symbol: 'NLO', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 }
          ]
        },
        { name: 'DYNAMIC44', tms: 'tms', domain: 'dynamic44.com', type: 'ats', role: 'both',
          username: '', password: '',
          broker: 'NSH', acntid: '40177', clientAcc: '202103102056673 ( TIKARAM DAHAL-)',
          scriptList: [
              { symbol: 'NLO', ORDER_QTY: 10, MAX_ORDER_QTY: 1000, ORDER_PRICE: 269.4 },
              { symbol: 'HFIN', ORDER_QTY: 50, MAX_ORDER_QTY: 500, ORDER_PRICE: 563.0 }
          ]
        },
    ]
};
