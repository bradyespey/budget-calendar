// scripts/find-savings-account.js
// Helper script to identify savings account ID from Monarch API
//
// NOTE: This script uses the legacy Firebase Functions config system
// (firebase functions:config:get) which is still in use by this project.

const https = require('https');

// Get token from Firebase config
const { execSync } = require('child_process');

async function findSavingsAccount() {
  try {
    console.log('📊 Fetching accounts from Monarch API...\n');
    
    // Get token from Firebase config
    const configOutput = execSync('firebase functions:config:get', { encoding: 'utf8' });
    const config = JSON.parse(configOutput);
    const token = config.monarch?.token;
    
    if (!token) {
      console.error('❌ Monarch token not found in Firebase config');
      process.exit(1);
    }
    
    const query = {
      operationName: 'Web_GetAccountsPage',
      query: `
        query Web_GetAccountsPage {
          accountTypeSummaries {
            type { display }
            accounts { 
              id 
              displayName 
              displayBalance 
              type { name }
            }
          }
        }
      `
    };
    
    const data = await makeRequest(token, query);
    
    console.log('📋 Available Accounts:\n');
    
    data.data.accountTypeSummaries.forEach(summary => {
      console.log(`\n${summary.type.display}:`);
      summary.accounts.forEach(account => {
        console.log(`  • ${account.displayName}`);
        console.log(`    ID: ${account.id}`);
        console.log(`    Balance: $${account.displayBalance.toLocaleString()}`);
        console.log(`    Type: ${account.type.name}`);
      });
    });
    
    console.log('\n\n💡 To configure savings account:');
    console.log('   Copy the ID of your savings account and run:');
    console.log('   firebase functions:config:set monarch.savings_id="YOUR_SAVINGS_ID"');
    console.log('   Then redeploy: npx firebase deploy --only functions\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function makeRequest(token, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: 'api.monarchmoney.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`API returned ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

findSavingsAccount();
