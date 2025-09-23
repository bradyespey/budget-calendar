// API function to call the consolidateData Firebase function
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function consolidateData() {
  const consolidateFunction = httpsCallable(functions, 'consolidateData');
  
  try {
    const result = await consolidateFunction();
    return result.data;
  } catch (error) {
    console.error('Error consolidating data:', error);
    throw error;
  }
}
