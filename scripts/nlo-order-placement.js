// NLO ORDER PLACEMENT SCRIPT
// Copy and paste this into the dashboard "Order Placement Script" field

console.log(`Executing NLO order placement for ${scriptId}`);

// Check if upNLO function exists
if (typeof upNLO === 'function') {
    upNLO();
    return { success: true, message: 'NLO order placed' };
}

// Fallback: Execute the full NLO order logic
const scripNames = ['NLO'];

try {
    // Get NLO scrip data
    const totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
    const nloScrip = totalScripList.find(scrip => scrip.symbol === 'NLO');

    if (!nloScrip) {
        throw new Error('NLO scrip not found');
    }

    console.log('NLO scrip found:', nloScrip.symbol);

    // Call your existing order placement function if available
    if (typeof processScriptsSequentially === 'function') {
        processScriptsSequentially([nloScrip]);
        return { success: true, message: 'NLO order processing started' };
    }

    return { success: true, message: 'NLO order triggered' };

} catch (error) {
    console.error('NLO order placement error:', error);
    return { success: false, message: error.message };
}
