import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export type FirebaseWeekMarker = {
  id: string;
  weekNumber: number;
  startedAt: string;
  endedAt?: string | null;
  status: 'active' | 'completed' | 'upcoming';
};

export function subscribeToFirebaseWeekMarkers({
  userId,
  companyId,
  onData,
}: {
  userId: string;
  companyId?: string;
  onData: (markers: FirebaseWeekMarker[]) => void;
}) {
  const scopeQuery = companyId
    ? query(collection(db, 'weekMarkers'), where('companyId', '==', companyId))
    : query(collection(db, 'weekMarkers'), where('authorId', '==', userId));
  return onSnapshot(
    scopeQuery,
    (snapshot) => {
      onData(snapshot.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<FirebaseWeekMarker, 'id'>),
        }))
        .sort((a, b) => a.weekNumber - b.weekNumber));
    },
    (error) => logFirestoreError(error, OperationType.GET, 'weekMarkers'),
  );
}
