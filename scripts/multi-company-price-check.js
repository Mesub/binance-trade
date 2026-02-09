// MULTI-COMPANY PRICE CHECK SCRIPT
// Copy and paste this into the dashboard "Price Check Script" field

// ╔═══════════════════════════════════════════════════════════════╗
// ║              CHANGE YOUR SETTINGS HERE                        ║
// ╚═══════════════════════════════════════════════════════════════╝

// STEP 1: Enable/Disable companies (true = monitor, false = skip)
const COMPANIES_TO_MONITOR = {
    'NLO':     true,     // ✅ Enabled
    'SYPNL':   true,     // ✅ Enabled
    'JHAPA':   false,    // ❌ Disabled
    'SWASTIK': false,    // ❌ Disabled
    'SAIL':    false     // ❌ Disabled
};

// STEP 2: Set TARGET PRICES (order fires when price ≤ target)
const TARGET_PRICES = {
    'NLO':     254.1,    // ← Change NLO target price
    'SYPNL':   684.8,    // ← Change SYPNL target price
    'JHAPA':   1073.6,   // ← Change JHAPA target price
    'SWASTIK': 2327.0,   // ← Change SWASTIK target price
    'SAIL':    781.7     // ← Change SAIL target price
};

// ╔═══════════════════════════════════════════════════════════════╗
// ║         DON'T CHANGE ANYTHING BELOW THIS LINE                 ║
// ╚═══════════════════════════════════════════════════════════════╝

// ============================================
// Helper Functions
// ============================================
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

async function fetchLTP(symbol, scripId, isin) {
    const host = document.location.origin;

    try {
        const response = await fetch(
            `${host}/tmsapi/rtApi/stock/validation/ohlc/${scripId}/${isin}`,
            {
                credentials: "include",
                headers: {
                    "accept": "application/json",
                    "x-xsrf-token": getCookie("XSRF-TOKEN") || ""
                }
            }
        );

        const data = await response.json();

        if (data.status === "200" && data.data && data.data.ltp) {
            return parseFloat(data.data.ltp);
        }
    } catch (error) {
        console.error(`Error fetching LTP for ${symbol}:`, error);
    }

    return null;
}

// ============================================
// Main Function - Check All Enabled Companies
// ============================================
async function checkAllCompanies() {
    const totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
    const enabledCompanies = Object.keys(COMPANIES_TO_MONITOR).filter(c => COMPANIES_TO_MONITOR[c]);

    console.log(`Checking ${enabledCompanies.length} companies:`, enabledCompanies.join(', '));

    // Check all enabled companies
    for (const symbol of enabledCompanies) {
        const scrip = totalScripList.find(s => s.symbol === symbol);

        if (!scrip) {
            console.warn(`${symbol} not found in securities list`);
            continue;
        }

        const ltp = await fetchLTP(symbol, scrip.id, scrip.isin);

        if (ltp === null) {
            console.warn(`Could not fetch LTP for ${symbol}`);
            continue;
        }

        const targetPrice = TARGET_PRICES[symbol];
        console.log(`${symbol}: LTP=${ltp}, Target=${targetPrice}`);

        // Check if price matches target (≤)
        if (ltp <= targetPrice) {
            console.log(`✅ MATCH! ${symbol} price ${ltp} ≤ ${targetPrice}`);
            // Return the matched company info as a JSON string
            return JSON.stringify({
                company: symbol,
                price: ltp,
                target: targetPrice,
                matched: true
            });
        }
    }

    // No match found, return the first company's price for monitoring
    const firstSymbol = enabledCompanies[0];
    const firstScrip = totalScripList.find(s => s.symbol === firstSymbol);
    const firstLTP = await fetchLTP(firstSymbol, firstScrip.id, firstScrip.isin);

    return JSON.stringify({
        company: firstSymbol,
        price: firstLTP || 0,
        target: TARGET_PRICES[firstSymbol],
        matched: false
    });
}

// Execute and return result
return await checkAllCompanies();
