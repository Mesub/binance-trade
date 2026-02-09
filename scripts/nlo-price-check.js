// NLO PRICE CHECK SCRIPT
// Copy and paste this into the dashboard "Price Check Script" field

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

async function fetchNLOPrice() {
    const host = document.location.origin;
    const totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
    const nloScrip = totalScripList.find(s => s.symbol === 'NLO');

    if (!nloScrip) {
        throw new Error('NLO not found');
    }

    const response = await fetch(
        `${host}/tmsapi/rtApi/stock/validation/ohlc/${nloScrip.id}/${nloScrip.isin}`,
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

    throw new Error("Could not fetch NLO price");
}

return await fetchNLOPrice();
