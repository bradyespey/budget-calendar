// Find and replace script to add credit card processing
const fs = require('fs');

const filePath = '/Users/brady/Projects/Budget/functions/src/index.ts';
const content = fs.readFileSync(filePath, 'utf8');

// Find the specific location in storeRecurringTransactions function
const oldCode = `      const streamArray = Array.from(streamMap.values()).map(stream => ({
        ...stream,
        // Remove the allDates field as it's not needed in the response
        allDates: undefined
      }));

      logger.info(\`Processed \${streamArray.length} unique recurring streams\`);`;

const newCode = `      const streamArray = Array.from(streamMap.values()).map(stream => ({
        ...stream,
        // Remove the allDates field as it's not needed in the response
        allDates: undefined
      }));

      // Add credit card accounts as recurring "transactions"
      creditCardAccounts.forEach((account) => {
        if (account.paymentDueDate && account.balance && account.balance > 0) {
          streamArray.push({
            id: \`credit-card-\${account.id}\`,
            frequency: 'monthly',
            amount: -Math.abs(account.balance), // Negative for expense
            isApproximate: false,
            merchant: {
              id: account.id,
              name: account.displayName,
              logoUrl: account.logoUrl,
              __typename: 'Merchant'
            },
            category: {
              id: 'credit-card-payment',
              name: 'Credit card',
              __typename: 'Category'
            },
            account: {
              id: account.id,
              displayName: account.displayName,
              logoUrl: account.logoUrl,
              __typename: 'Account'
            },
            dueDate: account.paymentDueDate,
            __typename: 'RecurringTransactionStream'
          });
        }
      });

      logger.info(\`Processed \${streamArray.length} unique recurring streams (including \${creditCardAccounts.length} credit card accounts)\`);`;

// Replace only in storeRecurringTransactions function
const startMarker = '// Store recurring transactions in Firestore (for cached access like projections)';
const endMarker = '// HTTP version of storeRecurringTransactions for nightly automation';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  const beforeFunction = content.substring(0, startIndex);
  const functionContent = content.substring(startIndex, endIndex);
  const afterFunction = content.substring(endIndex);
  
  const updatedFunctionContent = functionContent.replace(oldCode, newCode);
  const updatedContent = beforeFunction + updatedFunctionContent + afterFunction;
  
  fs.writeFileSync(filePath, updatedContent);
  console.log('Successfully updated storeRecurringTransactions function');
} else {
  console.log('Could not find function boundaries');
}


