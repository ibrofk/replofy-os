import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useUser } from '../contexts/UserContext';
import {
  OperatorApproval,
  OperatorCheckin,
  OperatorContextPack,
  OperatorDesk,
  OperatorInjection,
  OperatorMemory,
  OperatorOutput,
  OperatorWorkOrder,
  UserProfile,
} from '../types';

type State = {
  desks: OperatorDesk[];
  workOrders: OperatorWorkOrder[];
  contextPacks: OperatorContextPack[];
  memories: OperatorMemory[];
  checkins: OperatorCheckin[];
  outputs: OperatorOutput[];
  injections: OperatorInjection[];
  approvals: OperatorApproval[];
  loaded: boolean;
};

const initial: State = {
  desks: [],
  workOrders: [],
  contextPacks: [],
  memories: [],
  checkins: [],
  outputs: [],
  injections: [],
  approvals: [],
  loaded: false,
};

function scopeQuery(collectionName: string, profile: UserProfile, uid: string) {
  return profile.companyId
    ? query(collection(db, collectionName), where('companyId', '==', profile.companyId))
    : query(collection(db, collectionName), where('authorId', '==', uid));
}

export function useOperatorDesk(): State {
  const { userProfile } = useUser();
  const [state, setState] = useState(initial);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!userProfile || !uid) return;
    let loaded = 0;
    const names = ['operatorDesks', 'operatorWorkOrders', 'operatorContextPacks', 'operatorMemories', 'operatorCheckins', 'operatorOutputs', 'operatorInjections', 'operatorApprovals'] as const;
    const keys = ['desks', 'workOrders', 'contextPacks', 'memories', 'checkins', 'outputs', 'injections', 'approvals'] as const;
    const unsubscribers = names.map((name, index) => onSnapshot(scopeQuery(name, userProfile, uid), (snapshot) => {
      const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      loaded += 1;
      setState((current) => ({ ...current, [keys[index]]: records, loaded: current.loaded || loaded >= names.length }));
    }));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [userProfile]);

  return state;
}
