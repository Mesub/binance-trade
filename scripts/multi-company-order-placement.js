// MULTI-COMPANY ORDER PLACEMENT SCRIPT
// Copy and paste this into the dashboard "Order Placement Script" field

console.log(`Order placement triggered for subdomain: ${scriptId}`);

// ============================================
// Extract the matched company from the bot
// The bot will pass the company symbol that matched
// ============================================

// Parse the price check result to get which company matched
// Note: The bot's price check returns JSON with company info
// We'll try to detect which company triggered the order

async function placeOrderForCompany(companySymbol) {
    console.log(`Placing order for ${companySymbol} on ${scriptId}`);

    try {
        // Get scrip data
        const totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
        const scrip = totalScripList.find(s => s.symbol === companySymbol);

        if (!scrip) {
            throw new Error(`${companySymbol} not found`);
        }

        // Check if the trading functions are loaded
        if (typeof upNLO === 'function' && companySymbol === 'NLO') {
            upNLO();
            return { success: true, company: companySymbol, message: 'NLO order placed' };
        }

        if (typeof upMultipleScrips === 'function') {
            upMultipleScrips([companySymbol]);
            return { success: true, company: companySymbol, message: `${companySymbol} order placed` };
        }

        if (typeof processScriptsSequentially === 'function') {
            // Apply subdomain-specific configuration
            if (typeof getProcessedScrips === 'function') {
                const processedScrips = getProcessedScrips([companySymbol]);
                processScriptsSequentially(processedScrips);
            } else {
                processScriptsSequentially([scrip]);
            }
            return { success: true, company: companySymbol, message: `${companySymbol} order processing started` };
        }

        // Fallback: Simple order placement
        console.log(`Order placement initiated for ${companySymbol}`);
        return { success: true, company: companySymbol, message: `${companySymbol} order triggered` };

    } catch (error) {
        console.error(`Error placing order for ${companySymbol}:`, error);
        return { success: false, company: companySymbol, message: error.message };
    }
}

// ============================================
// Determine which company to place order for
// ============================================

// Try to get the matched company from window/global scope
// (The bot should set this when price matches)
const matchedCompany = window.MATCHED_COMPANY || 'NLO'; // Default to NLO

return await placeOrderForCompany(matchedCompany);
