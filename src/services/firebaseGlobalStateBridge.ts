import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export function subscribeToFirebaseCollection<T>({
  collectionName,
  companyId,
  uid,
  sorter,
  onData,
  onSettled,
}: {
  collectionName: string;
  companyId?: string;
  uid: string;
  sorter?: (a: T, b: T) => number;
  onData: (items: T[]) => void;
  onSettled: () => void;
}) {
  const scopedQuery = companyId
    ? query(collection(db, collectionName), where('companyId', '==', companyId))
    : query(collection(db, collectionName), where('authorId', '==', uid));
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      try {
        let data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
        if (sorter) data = data.sort(sorter);
        onData(data);
      } catch (error) {
        console.warn(`[GlobalState] Error processing ${collectionName} snapshot:`, error);
      }
      onSettled();
    },
    (error) => {
      logFirestoreError(error, OperationType.GET, collectionName);
      onSettled();
    },
  );
}
