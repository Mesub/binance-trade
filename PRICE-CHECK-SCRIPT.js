// ===================================
// PRICE CHECK SCRIPT
// Copy and paste this into the "Price Check Script" field in the dashboard
// ===================================

// This script fetches the Last Traded Price (LTP) for NLO stock
// You can change 'NLO' to any other stock: 'SYPNL', 'JHAPA', 'SWASTIK', 'SAIL'

const STOCK_TO_MONITOR = 'NLO'; // ← Change this to monitor different stocks

// Helper: Get cookie value
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

// Helper: Get subdomain
function getSubdomain() {
    const host = window.location.hostname;
    const parts = host.split('.');
    return parts.length > 2 ? parts[0] : null;
}

// Main function to fetch LTP
async function fetchLTP() {
    try {
        const host = document.location.origin;

        // Get stock data from localStorage
        const securitiesData = localStorage.getItem("__securities__");
        if (!securitiesData) {
            throw new Error("Securities data not found in localStorage");
        }

        const totalScripList = JSON.parse(securitiesData).data;
        const scrip = totalScripList.find(s => s.symbol === STOCK_TO_MONITOR);

        if (!scrip) {
            throw new Error(`Stock ${STOCK_TO_MONITOR} not found`);
        }

        // Fetch LTP from OHLC API
        const response = await fetch(
            `${host}/tmsapi/rtApi/stock/validation/ohlc/${scrip.id}/${scrip.isin}`,
            {
                credentials: "include",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "x-xsrf-token": getCookie("XSRF-TOKEN") || ""
                }
            }
        );

        const data = await response.json();

        // Handle authentication issues
        if (data.status === "401") {
            throw new Error("Authentication required - please login");
        }

        if (data.status === "200" && data.data && data.data.ltp) {
            const ltp = parseFloat(data.data.ltp);
            console.log(`[${getSubdomain()}] ${STOCK_TO_MONITOR} LTP: ${ltp}`);
            return ltp;
        }

        throw new Error("Invalid response from API");

    } catch (error) {
        console.error("Error fetching LTP:", error.message);
        throw error;
    }
}

// Execute and return the LTP
return await fetchLTP();
