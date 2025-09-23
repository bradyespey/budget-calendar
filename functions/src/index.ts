import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Quick Actions
export { refreshAccounts } from './functions/refreshAccounts';
export { refreshTransactions } from './functions/refreshTransactions';
export { updateBalance } from './functions/updateBalance';
export { budgetProjection } from './functions/budgetProjection';
export { syncCalendar } from './functions/syncCalendar';
export { runAll } from './functions/runAll';

// Maintenance
export { validateProjections } from './functions/validateProjections';
export { clearCalendars } from './functions/clearCalendars';
export { generateIcons } from './functions/generateIcons';
export { resetAllIcons } from './functions/resetAllIcons';
export { backupIcons } from './functions/backupIcons';
export { restoreIcons } from './functions/restoreIcons';
export { getIconBackupInfo } from './functions/getIconBackupInfo';
export { consolidateData } from './functions/consolidateData';
