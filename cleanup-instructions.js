// Simple cleanup script using Firebase CLI
// Run with: firebase firestore:delete --recursive savingsHistory --yes

console.log('To clean up duplicate savings history entries, run this command:');
console.log('');
console.log('firebase firestore:delete --recursive savingsHistory --yes');
console.log('');
console.log('This will delete ALL savings history entries.');
console.log('After running this, click "Update Balances" once to create a single clean entry.');
console.log('');
console.log('Alternative: Use the Firebase Console to manually delete duplicate entries.');
