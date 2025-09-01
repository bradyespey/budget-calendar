//src/api/icons.ts

import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

export interface GenerateIconsRequest {
  transactionIds?: string[];
  forceRegenerate?: boolean;
}

export interface GenerateIconsResponse {
  success: boolean;
  message: string;
  processedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  timestamp: string;
}

/**
 * Generate icons for transactions using AI and brand mapping
 */
export async function generateTransactionIcons(
  request: GenerateIconsRequest = {}
): Promise<GenerateIconsResponse> {
  try {
    const generateIcons = httpsCallable<GenerateIconsRequest, GenerateIconsResponse>(
      functions,
      'generateTransactionIcons'
    );
    
    const result = await generateIcons(request);
    return result.data;
  } catch (error) {
    console.error('Error generating transaction icons:', error);
    throw error;
  }
}

/**
 * Update a specific transaction's icon
 */
export async function updateTransactionIcon(
  billId: string, 
  iconUrl: string, 
  iconType: 'brand' | 'generated' | 'category' | 'custom'
): Promise<void> {
  const { updateBill } = await import('./bills');
  await updateBill(billId, {
    iconUrl,
    iconType
  });
}

/**
 * Reset a transaction's icon (removes custom icon)
 */
export async function resetTransactionIcon(billId: string): Promise<void> {
  const { updateBill } = await import('./bills');
  await updateBill(billId, {
    iconUrl: undefined,
    iconType: undefined
  });
}

export interface ResetAllIconsRequest {
  preserveCustom?: boolean;
}

export interface ResetAllIconsResponse {
  success: boolean;
  message: string;
  resetCount: number;
  skippedCount: number;
  errorCount: number;
  timestamp: string;
}

/**
 * Reset all transaction icons (optionally preserve custom ones)
 */
export async function resetAllTransactionIcons(
  request: ResetAllIconsRequest = {}
): Promise<ResetAllIconsResponse> {
  try {
    const resetIcons = httpsCallable<ResetAllIconsRequest, ResetAllIconsResponse>(
      functions,
      'resetAllTransactionIcons'
    );
    
    const result = await resetIcons(request);
    return result.data;
  } catch (error) {
    console.error('Error resetting all transaction icons:', error);
    throw error;
  }
}

export interface BackupIconsResponse {
  success: boolean;
  message: string;
  backupCount: number;
  timestamp: string;
}

/**
 * Backup all transaction icons to Firebase storage
 */
export async function backupTransactionIcons(): Promise<BackupIconsResponse> {
  try {
    const backupIcons = httpsCallable<{}, BackupIconsResponse>(
      functions,
      'backupTransactionIcons'
    );
    
    const result = await backupIcons();
    return result.data;
  } catch (error) {
    console.error('Error backing up transaction icons:', error);
    throw error;
  }
}

export interface RestoreIconsResponse {
  success: boolean;
  message: string;
  restoredCount: number;
  errorCount: number;
  timestamp: string;
}

/**
 * Restore transaction icons from Firebase backup
 */
export async function restoreTransactionIcons(): Promise<RestoreIconsResponse> {
  try {
    const restoreIcons = httpsCallable<{}, RestoreIconsResponse>(
      functions,
      'restoreTransactionIcons'
    );
    
    const result = await restoreIcons();
    return result.data;
  } catch (error) {
    console.error('Error restoring transaction icons:', error);
    throw error;
  }
}

export interface BackupInfoResponse {
  success: boolean;
  hasBackup: boolean;
  backupCount?: number;
  timestamp?: string;
  message: string;
}

/**
 * Get information about the latest icon backup
 */
export async function getIconBackupInfo(): Promise<BackupInfoResponse> {
  try {
    const getBackupInfo = httpsCallable<{}, BackupInfoResponse>(
      functions,
      'getIconBackupInfo'
    );
    
    const result = await getBackupInfo();
    return result.data;
  } catch (error) {
    console.error('Error getting backup info:', error);
    throw error;
  }
}
