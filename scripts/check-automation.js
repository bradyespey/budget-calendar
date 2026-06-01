#!/usr/bin/env node

/**
 * Budget Calendar Automation Monitor
 * Checks recent GitHub Actions runs and Firebase Functions logs
 */

const { execSync } = require('child_process');
const chalk = require('chalk');

// Configuration
const GITHUB_REPO = 'bradyespey/budget-calendar';
const FIREBASE_PROJECT = 'budgetcalendar-e6538';
const WORKFLOW_NAME = 'budget-nightly.yml';
const FUNCTION_NAME = 'nightlyBudgetUpdate';

console.log(chalk.blue.bold('🔍 Budget Calendar Automation Monitor\n'));

// Check GitHub Actions runs
console.log(chalk.yellow('📊 GitHub Actions Status:'));
try {
  const ghRuns = execSync(`gh run list --workflow="${WORKFLOW_NAME}" --limit=5 --json status,conclusion,createdAt,displayTitle`, { encoding: 'utf8' });
  const runs = JSON.parse(ghRuns);
  
  if (runs.length === 0) {
    console.log(chalk.red('  ❌ No workflow runs found'));
  } else {
    runs.forEach((run, index) => {
      const status = run.status === 'completed' ? 
        (run.conclusion === 'success' ? chalk.green('✅ Success') : chalk.red('❌ Failed')) :
        chalk.yellow(`⏳ ${run.status}`);
      
      const date = new Date(run.createdAt).toLocaleString();
      console.log(`  ${index + 1}. ${status} - ${date}`);
    });
  }
} catch (error) {
  console.log(chalk.red('  ❌ Error fetching GitHub Actions (make sure gh CLI is installed and authenticated)'));
  console.log(chalk.gray(`     ${error.message}`));
}

console.log('\n' + chalk.yellow('🔥 Firebase Functions Logs:'));
try {
  // Get recent logs for the nightly function
  const logs = execSync(`firebase functions:log --only ${FUNCTION_NAME}`, { encoding: 'utf8' });
  
  if (!logs.trim()) {
    console.log(chalk.red('  ❌ No recent logs found'));
  } else {
    // Parse and display recent logs
    const logLines = logs.split('\n').filter(line => line.trim());
    const recentLogs = logLines.slice(0, 10); // Show last 10 log entries
    
    recentLogs.forEach(line => {
      if (line.includes('nightlyBudgetUpdate')) {
        const timestamp = line.split('Z')[0] + 'Z';
        const date = new Date(timestamp).toLocaleString();
        
        if (line.includes('Starting nightly budget update workflow')) {
          console.log(chalk.blue(`  🚀 Started: ${date}`));
        } else if (line.includes('completed successfully')) {
          console.log(chalk.green(`  ✅ Completed: ${date}`));
        } else if (line.includes('Error') || line.includes('Failed')) {
          console.log(chalk.red(`  ❌ Error: ${date}`));
        } else if (line.includes('Step')) {
          console.log(chalk.gray(`  📝 ${line.split('nightlyBudgetUpdate:')[1]?.trim() || line}`));
        }
      }
    });
  }
} catch (error) {
  console.log(chalk.red('  ❌ Error fetching Firebase logs'));
  console.log(chalk.gray(`     ${error.message}`));
}

console.log('\n' + chalk.blue('💡 Quick Commands:'));
console.log('  • Check GitHub Actions: gh run list --workflow="budget-nightly.yml"');
console.log('  • View Firebase logs: firebase functions:log --only nightlyBudgetUpdate');
console.log('  • Manual trigger: gh workflow run budget-nightly.yml');
console.log('  • Test function: curl -X POST "https://us-central1-budgetcalendar-e6538.cloudfunctions.net/nightlyBudgetUpdate" -H "Content-Type: application/json" -d "{}"');

console.log('\n' + chalk.green('✨ Automation is running daily at 8:15 AM America/Chicago'));
