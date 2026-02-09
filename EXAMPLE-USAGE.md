# Example Usage Guide

This guide shows you how to set up and use the Price Monitor Bot with practical examples.

## How the Rotation System Works

The bot uses a **round-robin rotation** - it checks one subdomain at a time, then moves to the next:

```
Cycle 1: Check Site 1 → Wait 0.5s → Check Site 2 → Wait 0.5s → Check Site 3 → ... → Check Site N
         ↓
Cycle 2: Check Site 1 → Wait 0.5s → Check Site 2 → Wait 0.5s → Check Site 3 → ... → Check Site N
         ↓
Cycle 3: Check Site 1 → ...
```

**Visual Timeline:**
```
0.0s  → Check Subdomain 1 (Price: $105)
0.5s  → Check Subdomain 2 (Price: $102)
1.0s  → Check Subdomain 3 (Price: $98) ✅ MATCH!
      → Place orders on ALL subdomains
      → Stop monitoring
```

**With 16 Subdomains:**
- Time per cycle: ~8 seconds (16 ÷ 2 req/sec)
- Each subdomain gets checked every ~8 seconds
- Immediately rotates back to first subdomain after completing a cycle

## Example Scenario

Let's say you want to monitor prices for a product across 3 subdomains and automatically place orders when the price drops to $99 or below.

### Step 1: Start the Server

```bash
npm start
```

Open the dashboard at `http://localhost:3000`

### Step 2: Add Subdomains

Add three subdomains with their configurations:

| URL | Name | Script ID |
|-----|------|-----------|
| https://store1.example.com/product/123 | Store 1 | SKU-123 |
| https://store2.example.com/product/456 | Store 2 | SKU-456 |
| https://store3.example.com/item/789 | Store 3 | SKU-789 |

### Step 3: Configure Price Check Script

**Example 1: Simple Price Extraction**
```javascript
// If all sites have the same HTML structure
const priceText = document.querySelector('.product-price').textContent;
return parseFloat(priceText.replace(/[^0-9.]/g, ''));
```

**Example 2: Using Script ID**
```javascript
// If each site has different structure
// scriptId will be: SKU-123, SKU-456, or SKU-789
if (scriptId.includes('123')) {
  // Store 1 logic
  return parseFloat(document.querySelector('.price-main').textContent.replace('$', ''));
} else if (scriptId.includes('456')) {
  // Store 2 logic
  return parseFloat(document.querySelector('[data-price]').getAttribute('data-price'));
} else {
  // Store 3 logic
  return parseFloat(document.querySelector('#item-price').innerText.match(/[\d.]+/)[0]);
}
```

**Example 3: Extracting from JSON**
```javascript
// If price is in a JSON object in the page
const scriptTag = document.querySelector('script[type="application/ld+json"]');
const data = JSON.parse(scriptTag.textContent);
return parseFloat(data.offers.price);
```

### Step 4: Configure Order Placement Script

**Example 1: Simple Click**
```javascript
// Find and click the "Add to Cart" button
document.querySelector('.add-to-cart-btn').click();

// Wait a bit
await new Promise(r => setTimeout(r, 1000));

// Click checkout
document.querySelector('.checkout-btn').click();

// Wait for page load
await new Promise(r => setTimeout(r, 2000));

// Click "Place Order"
document.querySelector('.place-order-btn').click();

return true;
```

**Example 2: Fill Form and Submit**
```javascript
// Select quantity
document.querySelector('#quantity').value = '1';

// Add to cart
document.querySelector('.add-to-cart').click();

// Wait for cart to update
await new Promise(r => setTimeout(r, 1500));

// Go to checkout
window.location.href = '/checkout';

// Wait for page load
await new Promise(r => setTimeout(r, 3000));

// Fill shipping (if needed)
// document.querySelector('#shipping-method').value = 'express';

// Place order
document.querySelector('#place-order-button').click();

return true;
```

**Example 3: Using Script ID for Different Sites**
```javascript
// Handle different order flows per subdomain
if (scriptId.includes('123')) {
  // Store 1: Simple one-click buy
  document.querySelector('.buy-now-btn').click();
  await new Promise(r => setTimeout(r, 1000));
  document.querySelector('.confirm-purchase').click();

} else if (scriptId.includes('456')) {
  // Store 2: Add to cart then checkout
  document.querySelector('.add-to-cart').click();
  await new Promise(r => setTimeout(r, 1000));
  document.querySelector('.proceed-to-checkout').click();
  await new Promise(r => setTimeout(r, 2000));
  document.querySelector('.complete-order').click();

} else {
  // Store 3: Different flow
  document.querySelector('#buy-button').click();
  await new Promise(r => setTimeout(r, 1500));
  document.querySelector('.finalize-purchase').click();
}

return true;
```

### Step 5: Set Price Target

- **Target Price**: 99
- **Condition**: Less than or equal (≤)

This means: trigger when price ≤ $99

### Step 6: Manual Login

When you click "Start Monitoring", browser windows will open for each subdomain.

**Important**: Log in manually to each site before the monitoring begins. The bot will maintain these sessions.

### Step 7: Start Monitoring

Click "▶️ Start Monitoring"

The bot will:
1. Check Store 1 → $105 (no match, continue)
2. Wait 500ms (rate limit)
3. Check Store 2 → $102 (no match, continue)
4. Wait 500ms
5. Check Store 3 → $98 (MATCH! ✅)
6. Place orders on ALL stores
7. Stop monitoring

## Real-World Tips

### Finding the Right Selectors

1. Open the website in Chrome
2. Press F12 to open DevTools
3. Click the "Elements" tab
4. Right-click the price element → Inspect
5. Note the class or ID
6. Test in Console:
   ```javascript
   document.querySelector('.your-selector').textContent
   ```

### Testing Your Scripts

Before running the bot, test your scripts manually:

1. Open the website
2. Press F12 → Console tab
3. Paste your price check script:
   ```javascript
   const scriptId = 'SKU-123'; // Set your scriptId
   // Paste your price check code
   console.log('Price:', price);
   ```
4. Paste your order script (but don't actually run it until ready!)

### Handling Dynamic Content

If prices load dynamically:

```javascript
// Wait for element to appear
await new Promise(resolve => {
  const checkExist = setInterval(() => {
    if (document.querySelector('.price')) {
      clearInterval(checkExist);
      resolve();
    }
  }, 100);
});

// Now get the price
return parseFloat(document.querySelector('.price').textContent.replace('$', ''));
```

### Debugging

If something doesn't work:

1. Check the **Logs Panel** in the dashboard
2. Check the **browser console** (F12)
3. Check the **terminal** where you ran `npm start`
4. Verify selectors are correct
5. Add console.log statements:
   ```javascript
   console.log('Step 1: Found price element');
   const price = document.querySelector('.price').textContent;
   console.log('Step 2: Extracted price:', price);
   return parseFloat(price.replace('$', ''));
   ```

## Common Issues and Solutions

### Issue: "Price check script not configured"
**Solution**: Make sure you clicked "Save Script" after entering your price check code

### Issue: Price shows as "NaN" or "null"
**Solution**: Your selector is wrong or the element doesn't exist. Use DevTools to find the correct selector.

### Issue: Orders not placing
**Solution**:
- Check if you're logged in
- Verify your order script selectors
- Add longer delays between steps
- Check for confirmation dialogs

### Issue: "Too many requests" error
**Solution**: Reduce rate limit in `src/utils/rateLimiter.js` from 2 req/sec to 1 req/sec

## Advanced Examples

### Monitor Different Products on Each Subdomain

```javascript
// Price check script
const productMap = {
  'site1': '.product-123 .price',
  'site2': '#item-456-price',
  'site3': '[data-sku="789"] .cost'
};

const hostname = window.location.hostname;
const selector = productMap[hostname] || '.price';
return parseFloat(document.querySelector(selector).textContent.replace(/[^0-9.]/g, ''));
```

### Conditional Order Placement

```javascript
// Only place order if stock is available
const stockElement = document.querySelector('.stock-status');
if (stockElement && stockElement.textContent.includes('In Stock')) {
  document.querySelector('.buy-now').click();
  await new Promise(r => setTimeout(r, 1000));
  document.querySelector('.confirm').click();
  return true;
} else {
  console.log('Out of stock, skipping order');
  return false;
}
```

### Save Screenshots

```javascript
// This won't work in evaluate(), but you can modify browserService.js
// Add this in browserService.js:
await page.screenshot({ path: `./logs/order-${Date.now()}.png` });
```

## Next Steps

1. Test with a single subdomain first
2. Verify price checking works correctly
3. Test order placement on a single site (maybe with a test product)
4. Add more subdomains gradually
5. Set up for your real use case

Good luck! 🚀
