import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';
const monarchApiUrl = 'https://api.monarch.com/graphql';
const pollDelayMs = 5000;
const maxWaitMs = 300000;

type MonarchAccount = {
  id: string;
  displayName?: string;
  syncDisabled?: boolean;
  deactivatedAt?: string | null;
  isManual?: boolean;
  hasSyncInProgress?: boolean;
  credential?: {
    id?: string;
    updateRequired?: boolean;
    disconnectedFromDataProviderAt?: string | null;
  } | null;
};

type GraphQLError = {
  message?: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

const accountsQuery = `
  query ForceRefreshAccountsQuery {
    accounts {
      id
      displayName
      syncDisabled
      deactivatedAt
      isManual
      hasSyncInProgress
      credential {
        id
        updateRequired
        disconnectedFromDataProviderAt
      }
    }
  }
`;

const refreshMutation = `
  mutation Common_ForceRefreshAccountsMutation($input: ForceRefreshAccountsInput!) {
    forceRefreshAccounts(input: $input) {
      success
      errors {
        message
        code
        fieldErrors {
          field
          messages
        }
      }
    }
  }
`;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getGraphQLErrorMessage(errors?: GraphQLError[]): string | null {
  if (!errors?.length) {
    return null;
  }
  return errors.map(error => error.message || 'Unknown Monarch GraphQL error').join('; ');
}

async function monarchGraphQL<T>(
  monarchToken: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(monarchApiUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Client-Platform': 'web',
      'Content-Type': 'application/json',
      'Authorization': `Token ${monarchToken}`
    },
    body: JSON.stringify({ operationName, query, variables })
  });

  if (!response.ok) {
    throw new Error(`Monarch API error: ${response.status}`);
  }

  const payload = await response.json() as GraphQLResponse<T>;
  const graphqlError = getGraphQLErrorMessage(payload.errors);
  if (graphqlError) {
    throw new Error(graphqlError);
  }

  if (!payload.data) {
    throw new Error('Monarch API returned no data');
  }

  return payload.data;
}

async function getAccounts(monarchToken: string): Promise<MonarchAccount[]> {
  const data = await monarchGraphQL<{ accounts: MonarchAccount[] }>(
    monarchToken,
    'ForceRefreshAccountsQuery',
    accountsQuery
  );
  return data.accounts || [];
}

function getRefreshableTargetIds(accounts: MonarchAccount[], configuredIds: string[]): string[] {
  const configuredIdSet = new Set(configuredIds.map(String).filter(Boolean));
  return accounts
    .filter(account => configuredIdSet.has(String(account.id)))
    .filter(account => !account.isManual && !account.syncDisabled && !account.deactivatedAt && account.credential)
    .map(account => String(account.id));
}

async function requestAccountsRefresh(monarchToken: string, accountIds: string[]): Promise<void> {
  const data = await monarchGraphQL<{
    forceRefreshAccounts: {
      success: boolean;
      errors?: Array<{ message?: string }>;
    };
  }>(
    monarchToken,
    'Common_ForceRefreshAccountsMutation',
    refreshMutation,
    { input: { accountIds } }
  );

  const result = data.forceRefreshAccounts;
  if (!result?.success) {
    const message = result?.errors?.map(error => error.message || 'Unknown refresh error').join('; ');
    throw new Error(message || 'Monarch account refresh request failed');
  }
}

async function waitForTargetAccounts(monarchToken: string, accountIds: string[]): Promise<{
  attempts: number;
  waitedMs: number;
  remainingIds: string[];
}> {
  const startedAt = Date.now();
  let attempts = 0;
  let remainingIds = accountIds;

  while (Date.now() - startedAt <= maxWaitMs) {
    attempts += 1;
    const accounts = await getAccounts(monarchToken);
    const accountMap = new Map(accounts.map(account => [String(account.id), account]));
    remainingIds = accountIds.filter(accountId => accountMap.get(accountId)?.hasSyncInProgress);

    logger.info(`Monarch refresh poll ${attempts}: ${remainingIds.length}/${accountIds.length} target accounts still refreshing`);

    if (remainingIds.length === 0) {
      return {
        attempts,
        waitedMs: Date.now() - startedAt,
        remainingIds
      };
    }

    await sleep(pollDelayMs);
  }

  return {
    attempts,
    waitedMs: Date.now() - startedAt,
    remainingIds
  };
}

export async function refreshConfiguredMonarchAccounts(options: {
  continueAfterTimeout?: boolean;
} = {}): Promise<{
  refreshedAccountCount: number;
  pollAttempts: number;
  waitedMs: number;
  timedOut: boolean;
  remainingAccountIds: string[];
}> {
  const monarchToken = process.env.MONARCH_TOKEN;
  const checkingId = process.env.MONARCH_CHECKING_ID;
  const savingsId = process.env.MONARCH_SAVINGS_ID;

  if (!monarchToken || !checkingId) {
    throw new Error('Monarch refresh config not configured');
  }

  const configuredIds = [checkingId, savingsId].filter(Boolean).map(String);
  const accounts = await getAccounts(monarchToken);
  const targetAccountIds = getRefreshableTargetIds(accounts, configuredIds);

  if (targetAccountIds.length === 0) {
    throw new Error('No refreshable checking or savings accounts found in Monarch');
  }

  logger.info(`Requesting Monarch refresh for ${targetAccountIds.length} target accounts`);
  await requestAccountsRefresh(monarchToken, targetAccountIds);
  const refreshStatus = await waitForTargetAccounts(monarchToken, targetAccountIds);

  if (refreshStatus.remainingIds.length > 0) {
    if (options.continueAfterTimeout) {
      logger.warn(
        `Monarch refresh still in progress after ${refreshStatus.waitedMs}ms; continuing workflow`,
        { remainingAccountIds: refreshStatus.remainingIds }
      );

      return {
        refreshedAccountCount: targetAccountIds.length,
        pollAttempts: refreshStatus.attempts,
        waitedMs: refreshStatus.waitedMs,
        timedOut: true,
        remainingAccountIds: refreshStatus.remainingIds
      };
    }

    throw new Error(`Timed out waiting for Monarch refresh to complete after ${refreshStatus.waitedMs}ms`);
  }

  try {
    await db.doc('admin/functionTimestamps').set({
      refreshAccounts: Timestamp.now()
    }, { merge: true });
    logger.info('Updated refreshAccounts timestamp');
  } catch (timestampError) {
    logger.warn('Failed to update timestamp:', timestampError);
  }

  return {
    refreshedAccountCount: targetAccountIds.length,
    pollAttempts: refreshStatus.attempts,
    waitedMs: refreshStatus.waitedMs,
    timedOut: false,
    remainingAccountIds: []
  };
}

export const refreshAccounts = functions
  .region(region)
  .runWith({ timeoutSeconds: 360, memory: '512MB' })
  .https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const refreshResult = await refreshConfiguredMonarchAccounts();
      
      res.status(200).json({ 
        success: true, 
        message: "Monarch account refresh completed",
        data: refreshResult,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error refreshing accounts:", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
