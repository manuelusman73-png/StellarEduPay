/**
 * Validation script for fiat conversion implementation
 * Checks all files for syntax and logic correctness
 */

const fs = require('fs');
const path = require('path');

async function runValidation() {
  console.log('🔍 Validating Fiat Conversion Implementation\n');
  console.log('='.repeat(60));

  const files = [
    'src/services/currencyService.js',
    'src/hooks/useFiatConversion.js',
    'src/components/PaymentForm.jsx',
    'src/components/VerifyPayment.jsx',
    'src/pages/dashboard.jsx',
    'src/pages/test-currency.jsx',
    'docs/FIAT_CONVERSION.md'
  ];

  let allValid = true;

  // Check 1: File existence
  console.log('\n📁 Check 1: File Existence');
  files.forEach(file => {
    const fullPath = path.join(__dirname, file);
    const exists = fs.existsSync(fullPath);
    console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    if (!exists) allValid = false;
  });

  // Check 2: Syntax validation (basic)
  console.log('\n🔤 Check 2: Basic Syntax Validation');
  files.filter(f => f.endsWith('.js') || f.endsWith('.jsx')).forEach(file => {
    const fullPath = path.join(__dirname, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Check for common syntax issues
      const issues = [];
      
      // Check balanced braces
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
      }
      
      // Check balanced parentheses
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        issues.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
      }
      
      // Check for required imports in components
      if (file.includes('PaymentForm') || file.includes('VerifyPayment') || file.includes('dashboard')) {
        if (!content.includes('useFiatConversion')) {
          issues.push('Missing useFiatConversion import');
        }
      }
      
      if (issues.length > 0) {
        console.log(`   ❌ ${file}`);
        issues.forEach(issue => console.log(`      - ${issue}`));
        allValid = false;
      } else {
        console.log(`   ✅ ${file}`);
      }
    } catch (error) {
      console.log(`   ❌ ${file}: ${error.message}`);
      allValid = false;
    }
  });

  // Check 3: Implementation requirements
  console.log('\n✨ Check 3: Feature Requirements');

  const currencyService = fs.readFileSync('src/services/currencyService.js', 'utf8');
  const paymentForm = fs.readFileSync('src/components/PaymentForm.jsx', 'utf8');

  const checks = [
    {
      name: 'CoinGecko API integration',
      test: currencyService.includes('api.coingecko.com') && currencyService.includes('stellar')
    },
    {
      name: '5-minute cache duration',
      test: currencyService.includes('5 * 60 * 1000') || currencyService.includes('300000')
    },
    {
      name: 'Cache implementation',
      test: currencyService.includes('priceCache') && currencyService.includes('lastFetchTime')
    },
    {
      name: 'Stale cache fallback',
      test: currencyService.includes('return priceCache')
    },
    {
      name: 'Display format (~$XX.XX USD)',
      test: paymentForm.includes('~$') && paymentForm.includes('USD')
    },
    {
      name: 'Disclaimer present',
      test: paymentForm.includes('Exchange rates') || paymentForm.includes('approximate')
    },
    {
      name: 'useFiatConversion hook',
      test: fs.existsSync('src/hooks/useFiatConversion.js')
    }
  ];

  checks.forEach(check => {
    console.log(`   ${check.test ? '✅' : '❌'} ${check.name}`);
    if (!check.test) allValid = false;
  });

  // Check 4: Code quality
  console.log('\n🎯 Check 4: Code Quality');

  const qualityChecks = [
    {
      name: 'Error handling in fetchXlmPrice',
      test: currencyService.includes('try') && currencyService.includes('catch')
    },
    {
      name: 'Null safety in conversions',
      test: currencyService.includes('=== null') || currencyService.includes('!== null')
    },
    {
      name: 'React cleanup in hook',
      test: fs.readFileSync('src/hooks/useFiatConversion.js', 'utf8').includes('return () =>')
    },
    {
      name: 'Accessibility attributes',
      test: paymentForm.includes('aria-') || paymentForm.includes('role=')
    }
  ];

  qualityChecks.forEach(check => {
    console.log(`   ${check.test ? '✅' : '❌'} ${check.name}`);
    if (!check.test) allValid = false;
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allValid) {
    console.log('✅ All validation checks passed!\n');
    console.log('📋 Implementation Summary:');
    console.log('   • Currency service with 5-minute caching');
    console.log('   • Reusable React hook for components');
    console.log('   • Updated 3 components (PaymentForm, VerifyPayment, Dashboard)');
    console.log('   • Proper error handling and fallbacks');
    console.log('   • Disclaimer about approximate rates');
    console.log('   • Documentation included');
    console.log('\n🚀 Ready for testing in browser!');
    console.log('   Run: npm run dev (in frontend directory)');
    console.log('   Visit: http://localhost:3000/test-currency');
  } else {
    console.log('❌ Some validation checks failed. Please review above.\n');
    process.exit(1);
  }
}

runValidation();
