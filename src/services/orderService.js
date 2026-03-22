class OrderService {
  constructor(browserService) {
    this.browserService = browserService;
  }

  /**
   * Place a single order at a specific price on a subdomain.
   * No LTP monitoring — just places the order and returns.
   */
  async placeOrder(subdomain, orderConfig) {
    if (subdomain.type === 'ats') {
      return await this.placeAtsOrder(subdomain, orderConfig);
    }
    return await this.placeNepseOrder(subdomain, orderConfig);
  }

  /**
   * NEPSE TMS: Place one order at exact price.
   * Only hits /orderApi/order/ — no OHLC fetching.
   */
  async placeNepseOrder(subdomain, orderConfig) {
    const page = await this.browserService.getPage(subdomain.accountId, subdomain.url);

    const result = await page.evaluate(async (config) => {
      function getCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
          var c = ca[i].trim();
          if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
        }
        return null;
      }

      var host = document.location.origin;
      var referral = host + "/tms/me/memberclientorderentry";
      var orderBookUrl = host + "/tmsapi/orderApi/order/";

      var securities = localStorage.getItem("__securities__");
      if (!securities) return { success: false, message: 'Not logged in' };

      var usrSession;
      try { usrSession = JSON.parse(localStorage.getItem("__usrsession__")); } catch (e) {
        return { success: false, message: 'Cannot parse session' };
      }
      if (!usrSession || !usrSession.user || !usrSession.clientDealerMember) {
        return { success: false, message: 'Session not found' };
      }

      var suid = localStorage.getItem("suid");
      var hostSessionId = suid ? btoa(suid) : "";
      var requestOwner = usrSession.user.id;

      function getHeader() {
        var xsrfToken = getCookie("XSRF-TOKEN") || "";
        var authToken = localStorage.getItem("id_token");
        var h = {
          "accept": "application/json, text/plain, */*",
          "content-type": "application/json",
          "host-session-id": hostSessionId,
          "request-owner": requestOwner
        };
        if (xsrfToken) {
          h["x-xsrf-token"] = xsrfToken;
        } else if (authToken) {
          h["Authorization"] = "Bearer " + authToken;
        }
        return h;
      }

      async function refreshToken() {
        try {
          var res = await fetch(host + "/tmsapi/authApi/authenticate/refresh", {
            method: "POST", headers: getHeader(), referrer: referral,
            referrerPolicy: "strict-origin-when-cross-origin", body: null, mode: "cors", credentials: "include"
          });
          var data = await res.json();
          if (data.status === 200 && data.data) {
            localStorage.setItem("id_token", data.data.access_token);
            if (data.data.refresh_token) localStorage.setItem("refresh_token", data.data.refresh_token);
          }
          return true;
        } catch(e) { return false; }
      }

      var totalScripList = JSON.parse(securities).data;
      var scrip = totalScripList.find(function(s) { return s.symbol === config.symbol; });
      if (!scrip) return { success: false, message: 'Scrip not found: ' + config.symbol };

      var clientData = usrSession.clientDealerMember.client;

      var body = {
        orderBook: {
          orderBookExtensions: [{
            orderTypes: { id: 1, orderTypeCode: "LMT" },
            disclosedQuantity: 0,
            orderValidity: { id: 1, orderValidityCode: "DAY" },
            triggerPrice: 0,
            orderPrice: config.price,
            orderQuantity: config.qty,
            remainingOrderQuantity: config.qty,
            marketType: { id: 2, marketType: "Continuous" }
          }],
          exchange: { id: 1 },
          dnaConnection: {}, dealer: {}, member: {},
          productType: { id: 1, productCode: "CNC" },
          instrumentType: { id: 1, code: "EQ" },
          security: {
            id: scrip.id,
            exchangeSecurityId: scrip.exchangeSecurityId || scrip.id,
            marketProtectionPercentage: 0, divisor: 100,
            boardLotQuantity: 1, tickSize: 0.1
          },
          accountType: 1, cpMemberId: 0,
          client: clientData, buyOrSell: 1
        },
        orderPlacedBy: 2, exchangeOrderId: null
      };

      try {
        var header = getHeader();
        var res = await fetch(orderBookUrl, {
          credentials: "include", headers: header, referrer: referral,
          body: JSON.stringify(body), method: "POST", mode: "cors"
        });
        var text = await res.text();
        try {
          var data = JSON.parse(text);

          // Handle 401 or 500 OAUTH — refresh token and retry once
          if (data.status === "401" || data.status === 401 || (data.status === "500" && data.level === "OAUTH")) {
            var refreshed = await refreshToken();
            if (refreshed) {
              header = getHeader();
              res = await fetch(orderBookUrl, {
                credentials: "include", headers: header, referrer: referral,
                body: JSON.stringify(body), method: "POST", mode: "cors"
              });
              text = await res.text();
              data = JSON.parse(text);
            }
          }

          return { success: data.status === "200" || data.status === 200, symbol: config.symbol, price: config.price, qty: config.qty, response: data };
        } catch (e) {
          return { success: false, symbol: config.symbol, message: text.substring(0, 300) };
        }
      } catch (err) {
        return { success: false, symbol: config.symbol, message: err.message };
      }
    }, orderConfig);

    return result;
  }

  /**
   * ATS: Place one order at exact price.
   * Only hits /atsweb/order — no LTP fetching.
   */
  async placeAtsOrder(subdomain, orderConfig) {
    const atsUserConfig = {
      broker: subdomain.broker,
      acntid: subdomain.acntid,
      clientAcc: subdomain.clientAcc
    };

    if (!atsUserConfig.broker || !atsUserConfig.acntid || !atsUserConfig.clientAcc) {
      throw new Error('ATS config not found for ' + subdomain.name);
    }

    const page = await this.browserService.getPage(subdomain.accountId, subdomain.url);

    const result = await page.evaluate(async (config) => {
      var baseUrl = document.location.origin + '/atsweb';
      var headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'x-requested-with': 'XMLHttpRequest'
      };
      var referrer = baseUrl + '/home?action=showHome&format=html&reqid=' + Date.now();

      var chars = "123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      var dupId = "";
      for (var i = 0; i < 10; i++) {
        var idx = Math.floor(Math.random() * (chars.length - 2));
        dupId += chars.substring(idx, idx + 1);
      }

      var params = {
        action: 'submitOrder', market: 'NEPSE', broker: config.ats.broker,
        format: 'json', brokerClient: '1', orderStatus: 'Open',
        acntid: config.ats.acntid, marketPrice: config.price.toString(),
        duplicateOrderId: dupId,
        clientAcc: config.ats.clientAcc, assetSelect: '1', actionSelect: '1',
        txtSecurity: config.symbol, cmbTypeOfOrder: '1',
        spnQuantity: config.qty.toString(), spnPrice: config.price.toString(),
        cmbTif: '16', cmbTifDays: '1', cmbBoard: '1',
        hiddenSpnCseFee: '0.02', brokerClientVal: '1',
        product: 'web', confirm: '1'
      };

      var body = Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');

      try {
        var res = await fetch(baseUrl + '/order', {
          headers: headers, referrer: referrer,
          referrerPolicy: 'strict-origin-when-cross-origin',
          body: body, method: 'POST', mode: 'cors', credentials: 'include'
        });
        var data = await res.json();
        return {
          success: data && data.description === 'javascriptOrderSuccessesFullySubmitted',
          symbol: config.symbol, price: config.price, qty: config.qty, response: data
        };
      } catch (err) {
        return { success: false, symbol: config.symbol, message: err.message };
      }
    }, { ...orderConfig, ats: atsUserConfig });

    return result;
  }
}

module.exports = OrderService;
