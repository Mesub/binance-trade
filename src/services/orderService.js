class OrderService {
  constructor(browserService) {
    this.browserService = browserService;
  }

  /**
   * Dispatch to the correct order method based on subdomain type.
   */
  async placeOrder(subdomain, orderConfig, atsUserConfig = null) {
    if (subdomain.type === 'ats') {
      return await this.placeAtsOrder(subdomain, orderConfig, atsUserConfig);
    }
    return await this.placeNepseOrder(subdomain, orderConfig);
  }

  /**
   * Place order on NEPSE TMS (tmsXX.nepsetms.com.np).
   * Matches reference: fetchLTPAndMonitor pattern.
   * Continuously monitors LTP -> places orders at 2% increments -> until circuit.
   */
  async placeNepseOrder(subdomain, orderConfig) {
    const page = await this.browserService.getPage(subdomain.url);

    try {
      const result = await page.evaluate(async (config) => {

        // === Helpers ===
        function getCookie(name) {
          var nameEQ = name + "=";
          var ca = document.cookie.split(';');
          for (var i = 0; i < ca.length; i++) {
            var c = ca[i].trim();
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
          }
          return null;
        }

        // Round price to 1 decimal (matching reference: toFixed(3).slice(0,-2))
        function roundPrice(val) {
          return parseFloat(val.toFixed(3).slice(0, -2));
        }

        function calculateMaxOrderQty(cfg) {
          if (cfg.COLLATERAL === 0) return cfg.MAX_ORDER_QTY;
          var remainingCollateral = cfg.COLLATERAL;
          var currentPrice = cfg.ORDER_PRICE;
          for (var i = 0; i < 4; i++) {
            currentPrice *= 1.02;
            remainingCollateral -= cfg.ORDER_QTY * currentPrice;
          }
          var finalPrice = cfg.ORDER_PRICE * 1.1;
          var maxOrderQty = Math.floor(remainingCollateral / finalPrice);
          maxOrderQty = Math.floor(maxOrderQty / 10) * 10;
          return maxOrderQty > 0 ? maxOrderQty : 0;
        }

        // === Session ===
        var host = document.location.origin;
        var referral = host + "/tms/me/memberclientorderentry";
        var orderBookUrl = host + "/tmsapi/orderApi/order/";

        var securities = localStorage.getItem("__securities__");
        if (!securities) {
          return { success: false, message: 'Not logged in - __securities__ not found' };
        }

        var usrSession;
        try { usrSession = JSON.parse(localStorage.getItem("__usrsession__")); } catch (e) {
          return { success: false, message: 'Cannot parse __usrsession__' };
        }
        if (!usrSession || !usrSession.user || !usrSession.clientDealerMember) {
          return { success: false, message: 'User session or clientDealerMember not found' };
        }

        var xsrfToken = getCookie("XSRF-TOKEN") || "";
        var authToken = localStorage.getItem("id_token");
        var suid = localStorage.getItem("suid");
        var hostSessionId = suid ? btoa(suid) : "";
        var requestOwner = usrSession.user.id;

        var header = {
          "accept": "application/json, text/plain, */*",
          "content-type": "application/json",
          "host-session-id": hostSessionId,
          "request-owner": requestOwner,
          "x-xsrf-token": xsrfToken
        };
        if (!xsrfToken && authToken) {
          delete header["x-xsrf-token"];
          header["Authorization"] = "Bearer " + authToken;
        }

        var httpFetchGet = {
          "credentials": "include",
          "headers": header,
          "referrer": referral,
          "method": "GET",
          "mode": "cors"
        };

        // === Find scrip ===
        var totalScripList = JSON.parse(securities).data;
        var scrip = totalScripList.find(function(s) { return s.symbol === config.symbol; });
        if (!scrip) {
          return { success: false, message: 'Scrip not found: ' + config.symbol };
        }

        // === Client data ===
        var clientData = usrSession.clientDealerMember.client;

        // === Calculate quantities ===
        var maxOrderQty = calculateMaxOrderQty(config);
        var circuitAmount = config.ORDER_PRICE === 0
          ? roundPrice(scrip.dprRangeHigh || config.ORDER_PRICE * 1.1)
          : roundPrice(config.ORDER_PRICE * 1.1);

        // === Build common order body (matching reference getBody + commonBody) ===
        var commonOrderBody = {
          orderBook: {
            orderBookExtensions: [
              {
                orderTypes: { id: 1, orderTypeCode: "LMT" },
                disclosedQuantity: 0,
                orderValidity: { id: 1, orderValidityCode: "DAY" },
                triggerPrice: 0,
                orderPrice: config.ORDER_PRICE,
                orderQuantity: config.ORDER_QTY,
                remainingOrderQuantity: config.ORDER_QTY,
                marketType: { id: 2, marketType: "Continuous" }
              }
            ],
            exchange: { id: 1 },
            dnaConnection: {},
            dealer: {},
            member: {},
            productType: { id: 1, productCode: "CNC" },
            instrumentType: { id: 1, code: "EQ" },
            security: {
              id: scrip.id,
              exchangeSecurityId: scrip.exchangeSecurityId || scrip.id,
              marketProtectionPercentage: 0,
              divisor: 100,
              boardLotQuantity: 1,
              tickSize: 0.1
            },
            accountType: 1,
            cpMemberId: 0,
            client: clientData,
            buyOrSell: 1
          },
          orderPlacedBy: 2,
          exchangeOrderId: null
        };

        // === Build circuit order body ===
        var circuitBodyString = JSON.parse(JSON.stringify(commonOrderBody));
        circuitBodyString.orderBook.orderBookExtensions[0].orderPrice = circuitAmount;
        circuitBodyString.orderBook.orderBookExtensions[0].orderQuantity = maxOrderQty;
        circuitBodyString.orderBook.orderBookExtensions[0].remainingOrderQuantity = maxOrderQty;

        // === Regular order body (will be mutated with new prices) ===
        var bodyString = JSON.parse(JSON.stringify(commonOrderBody));

        // === Place order function ===
        async function placeOrder(bodyStr) {
          var res = await fetch(orderBookUrl, {
            credentials: "include",
            headers: header,
            referrer: referral,
            body: JSON.stringify(bodyStr),
            method: "POST",
            mode: "cors"
          });
          var text = await res.text();
          try { return JSON.parse(text); }
          catch (e) { return { status: res.status.toString(), message: text.substring(0, 300) }; }
        }

        // === Refresh token (matching reference: /tmsapi/authApi/authenticate/refresh) ===
        async function refreshToken() {
          try {
            var res = await fetch(host + "/tmsapi/authApi/authenticate/refresh", {
              method: "POST",
              headers: header,
              referrer: referral,
              referrerPolicy: "strict-origin-when-cross-origin",
              body: null,
              mode: "cors",
              credentials: "include"
            });
            var data = await res.json();
            if (data.status === 200 && data.data) {
              localStorage.setItem("id_token", data.data.access_token);
              if (data.data.refresh_token) localStorage.setItem("refresh_token", data.data.refresh_token);
              authToken = data.data.access_token;
              if (data.data.xsrf_token) xsrfToken = data.data.xsrf_token;
              header["x-xsrf-token"] = xsrfToken;
              header["Authorization"] = "Bearer " + authToken;
            }
            return true;
          } catch (e) { return false; }
        }

        // === LTP Monitor Loop (matching reference fetchLTPAndMonitor1) ===
        var ohlcUrl = host + "/tmsapi/rtApi/stock/validation/ohlc/" + scrip.id + "/" + scrip.isin;
        var orderPricesPlaced = [];

        return new Promise(function(resolve) {
          var previousLTP = null;
          var startTime = Date.now();
          var MAX_DURATION = 60 * 60 * 1000; // 1 hour safety

          async function monitor() {
            // Safety timeout
            if (Date.now() - startTime > MAX_DURATION) {
              resolve({
                success: orderPricesPlaced.length > 0,
                symbol: config.symbol,
                message: 'Timeout after 1 hour',
                ordersPlaced: orderPricesPlaced.length,
                prices: orderPricesPlaced
              });
              return;
            }

            try {
              var data = await (await fetch(ohlcUrl, httpFetchGet)).json();

              // Handle 401 - refresh token
              if (data.status === "401") {
                var refreshed = await refreshToken();
                if (refreshed) { setTimeout(monitor, 200); return; }
                resolve({ success: false, message: 'Token refresh failed after 401', symbol: config.symbol });
                return;
              }

              if (data.status !== "200") {
                setTimeout(monitor, 200);
                return;
              }

              var fetchedLTP = parseFloat(data.data.ltp);

              if (fetchedLTP > previousLTP) {
                var newOrderPrice = roundPrice(fetchedLTP * 1.02);
                var isCircuitLevel = newOrderPrice >= circuitAmount;

                if (isCircuitLevel) {
                  // Place circuit order
                  if (orderPricesPlaced.indexOf(circuitAmount) === -1) {
                    try {
                      var orderResult = await placeOrder(circuitBodyString);
                      if (orderResult.status === "200" || orderResult.status === 200) {
                        orderPricesPlaced.push(circuitAmount);
                      }
                      console.log('[Circuit] ' + config.symbol + ' @ ' + circuitAmount + ' qty=' + maxOrderQty + ' => ' + orderResult.status);
                    } catch (err) {
                      console.error('Circuit order failed:', err);
                    }
                  }
                  // Done - circuit reached
                  resolve({
                    success: true,
                    symbol: config.symbol,
                    circuitReached: true,
                    circuitPrice: circuitAmount,
                    ordersPlaced: orderPricesPlaced.length,
                    prices: orderPricesPlaced
                  });
                  return;
                } else {
                  // Place regular order at 2% above LTP
                  if (orderPricesPlaced.indexOf(newOrderPrice) === -1) {
                    bodyString.orderBook.orderBookExtensions[0].orderPrice = newOrderPrice;
                    bodyString.orderBook.orderBookExtensions[0].orderQuantity = config.ORDER_QTY;
                    bodyString.orderBook.orderBookExtensions[0].remainingOrderQuantity = config.ORDER_QTY;
                    try {
                      var orderResult = await placeOrder(bodyString);
                      if (orderResult.status === "200" || orderResult.status === 200) {
                        orderPricesPlaced.push(newOrderPrice);
                      }
                      console.log('[Order] ' + config.symbol + ' @ ' + newOrderPrice + ' qty=' + config.ORDER_QTY + ' => ' + orderResult.status);
                    } catch (err) {
                      console.error('Regular order failed:', err);
                    }
                  }
                }
              }

              previousLTP = fetchedLTP;
              setTimeout(monitor, 200);
            } catch (err) {
              setTimeout(monitor, 300);
            }
          }

          // Start monitoring
          monitor();
        });

      }, orderConfig);

      if (result.success) {
        const detail = result.circuitReached
          ? `CIRCUIT @ ${result.circuitPrice}, ${result.ordersPlaced} orders placed`
          : `${result.ordersPlaced} orders placed`;
        console.log(`✅ NEPSE ${subdomain.name} [${orderConfig.symbol}]: ${detail}`);
      } else {
        console.log(`⚠️  NEPSE ${subdomain.name}: ${result.message || JSON.stringify(result)}`);
      }
      return result;
    } catch (error) {
      console.error(`❌ Error on ${subdomain.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Place order on ATS/New TMS (form-encoded).
   */
  async placeAtsOrder(subdomain, orderConfig, atsUserConfig) {
    if (!atsUserConfig) {
      throw new Error(`ATS config not found for ${subdomain.scriptId}`);
    }

    const page = await this.browserService.getPage(subdomain.url);

    try {
      const result = await page.evaluate(async (config) => {
        var securities = localStorage.getItem("__securities__");
        if (!securities) {
          return { success: false, message: 'Not logged in - __securities__ not found' };
        }

        var totalScripList = JSON.parse(securities).data;
        var scrip = totalScripList.find(function(s) { return s.symbol === config.symbol; });
        if (!scrip) {
          return { success: false, message: 'Scrip not found: ' + config.symbol };
        }

        var duplicateOrderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        var params = new URLSearchParams();
        params.append('broker', config.ats.broker);
        params.append('acntid', config.ats.acntid);
        params.append('clientAcc', config.ats.clientAcc);
        params.append('securityId', scrip.id.toString());
        params.append('symbol', config.symbol);
        params.append('qty', config.ORDER_QTY.toString());
        params.append('price', config.ORDER_PRICE.toString());
        params.append('transType', 'B');
        params.append('ordType', 'LMT');
        params.append('duplicateOrderId', duplicateOrderId);

        var host = document.location.origin;
        var url = host + "/order";

        try {
          var res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "x-requested-with": "XMLHttpRequest"
            },
            body: params.toString()
          });

          var text = await res.text();
          try {
            var data = JSON.parse(text);
            return {
              success: data.status === "200" || data.status === 200 || data.success === true,
              symbol: config.symbol,
              qty: config.ORDER_QTY,
              price: config.ORDER_PRICE,
              response: data
            };
          } catch (e) {
            return { success: false, message: text.substring(0, 300), symbol: config.symbol };
          }
        } catch (e) {
          return { success: false, message: 'Fetch error: ' + e.message, symbol: config.symbol };
        }
      }, { ...orderConfig, ats: atsUserConfig });

      if (result.success) {
        console.log(`✅ ATS order on ${subdomain.name} for ${orderConfig.symbol}: qty=${orderConfig.ORDER_QTY} @ ${orderConfig.ORDER_PRICE}`);
      } else {
        console.log(`⚠️  ATS order on ${subdomain.name}: ${result.message || JSON.stringify(result.response)}`);
      }
      return result;
    } catch (error) {
      console.error(`❌ Error placing ATS order on ${subdomain.name}:`, error.message);
      throw error;
    }
  }
}

module.exports = OrderService;
