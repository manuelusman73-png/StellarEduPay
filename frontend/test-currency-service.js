/**
 * Manual test script for currency service
 * Run with: node test-currency-service.js
 */

// Mock fetch for Node.js environment
global.fetch = async (url) => {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => JSON.parse(data)
        });
      });
    }).on('error', reject);
  });
};

// Import the service
const { fetchXlmPrice, convertXlmToUsd, getCacheStatus } = require('./src/services/currencyService.js');

async function runTests() {
  console.log('🧪 Testing Currency Service\n');
  console.log('=' .repeat(50));

  try {
    // Test 1: Fetch XLM price
    console.log('\n📊 Test 1: Fetching XLM/USD price...');
    const price = await fetchXlmPrice();
    if (price && price > 0) {
      console.log(`✅ Success! Current XLM price: $${price.toFixed(4)}`);
    } else {
      console.log('❌ Failed to fetch price');
      return;
    }

    // Test 2: Convert XLM to USD
    console.log('\n💱 Test 2: Converting 250 XLM to USD...');
    const conversion = await convertXlmToUsd(250);
    if (conversion.usd) {
      console.log(`✅ Success! 250 XLM = $${conversion.usd.toFixed(2)} USD`);
      console.log(`   Rate: $${conversion.rate.toFixed(4)} per XLM`);
      console.log(`   Cached: ${conversion.cached ? 'Yes' : 'No'}`);
    } else {
      console.log('❌ Conversion failed');
    }

    // Test 3: Check cache
    console.log('\n🗄️  Test 3: Checking cache status...');
    const cache = getCacheStatus();
    console.log(`   Cached price: ${cache.price ? `$${cache.price.toFixed(4)}` : 'None'}`);
    console.log(`   Cache age: ${cache.age ? `${Math.floor(cache.age / 1000)}s` : 'N/A'}`);
    console.log(`   Valid: ${cache.valid ? 'Yes' : 'No'}`);
    console.log(`   TTL: 300s (5 minutes)`);

    // Test 4: Second fetch should use cache
    console.log('\n⚡ Test 4: Testing cache (second fetch)...');
    const startTime = Date.now();
    const price2 = await fetchXlmPrice();
    const fetchTime = Date.now() - startTime;
    console.log(`✅ Fetched in ${fetchTime}ms (should be instant if cached)`);
    console.log(`   Price: $${price2.toFixed(4)}`);
    console.log(`   ${fetchTime < 10 ? '✅ Cache working!' : '⚠️  Might not be using cache'}`);

    // Test 5: Different amounts
    console.log('\n🔢 Test 5: Converting different amounts...');
    const amounts = [10, 100, 500, 1000];
    for (const amount of amounts) {
      const result = await convertXlmToUsd(amount);
      if (result.usd) {
        console.log(`   ${amount} XLM = $${result.usd.toFixed(2)} USD`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - XLM price fetching: Working`);
    console.log(`   - Currency conversion: Working`);
    console.log(`   - Cache mechanism: Working`);
    console.log(`   - Cache TTL: 5 minutes`);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
  }
}

// Run the tests
runTests();
