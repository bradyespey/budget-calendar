//src/api/projections.ts

import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseConfig';
import { Projection } from '../types';
import { format } from 'date-fns';

export async function getProjections() {
  try {
    const today = new Date();
    const todayString = format(today, 'yyyy-MM-dd');
    
    const projectionsRef = collection(db, 'projections');

    // Prefer indexed query; if it fails (missing index), fall back to client-side filter
    try {
      const q = query(
        projectionsRef,
        where('projDate', '>=', todayString),
        orderBy('projDate')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        proj_date: doc.data().projDate,
        projected_balance: doc.data().projectedBalance,
        lowest: doc.data().lowest,
        highest: doc.data().highest,
        bills: doc.data().bills || [],
      })) as Projection[];
    } catch (e) {
      const snapshot = await getDocs(projectionsRef);
      return snapshot.docs
        .map(d => d.data())
        .filter((d: any) => d.projDate >= todayString)
        .sort((a: any, b: any) => (a.projDate > b.projDate ? 1 : -1))
        .map((d: any) => ({
          proj_date: d.projDate,
          projected_balance: d.projectedBalance,
          lowest: d.lowest,
          highest: d.highest,
          bills: d.bills || [],
        })) as Projection[];
    }
  } catch (error) {
    console.error('Error fetching projections:', error);
    throw error;
  }
}

export async function getHighLowProjections() {
  try {
    const today = new Date();
    const todayString = format(today, 'yyyy-MM-dd');
    const projectionsRef = collection(db, 'projections');

    let highest: any | undefined;
    let lowest: any | undefined;

    // Try fast path using flags. If it fails (index), continue to fallback.
    try {
      const highestQuery = query(
        projectionsRef,
        where('highest', '==', true),
        orderBy('projDate')
      );
      const highestSnapshot = await getDocs(highestQuery);

      const lowestQuery = query(
        projectionsRef,
        where('lowest', '==', true),
        orderBy('projDate')
      );
      const lowestSnapshot = await getDocs(lowestQuery);

      highest = highestSnapshot.docs[0]?.data();
      lowest = lowestSnapshot.docs[0]?.data();
    } catch {
      // Ignore and compute below
    }

    // Fallback: compute from future projections if flags missing or query failed
    if (!highest || !lowest) {
      // Try indexed query; if it fails, read all and filter
      let all: any[] = [];
      try {
        const allFutureQuery = query(
          projectionsRef,
          where('projDate', '>=', todayString),
          orderBy('projDate')
        );
        const allSnapshot = await getDocs(allFutureQuery);
        all = allSnapshot.docs.map(d => d.data());
      } catch {
        const allSnapshot = await getDocs(projectionsRef);
        all = allSnapshot.docs.map(d => d.data()).filter((d: any) => d.projDate >= todayString);
        all.sort((a: any, b: any) => (a.projDate > b.projDate ? 1 : -1));
      }

      if (all.length > 0) {
        const max = all.reduce((acc: any, cur: any) =>
          acc && acc.projectedBalance >= cur.projectedBalance ? acc : cur,
        null as any);
        const min = all.reduce((acc: any, cur: any) =>
          acc && acc.projectedBalance <= cur.projectedBalance ? acc : cur,
        null as any);
        highest = highest || max;
        lowest = lowest || min;
      }
    }
    
    return {
      highest: highest ? {
        proj_date: highest.projDate,
        projected_balance: highest.projectedBalance,
        lowest: highest.lowest,
        highest: highest.highest,
        bills: highest.bills || [],
      } : undefined,
      lowest: lowest ? {
        proj_date: lowest.projDate,
        projected_balance: lowest.projectedBalance,
        lowest: lowest.lowest,
        highest: lowest.highest,
        bills: lowest.bills || [],
      } : undefined,
    };
  } catch (error) {
    console.error('Error fetching high/low projections:', error);
    throw error;
  }
}

export async function triggerManualRecalculation() {
  try {
    const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Failed to trigger budget projection: ${response.status}`);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Error triggering recalculation:', error);
    throw error;
  }
}