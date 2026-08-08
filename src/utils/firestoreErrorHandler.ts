import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function buildErrorInfo(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
}

/**
 * Logs a Firestore error and throws — use ONLY inside try/catch blocks
 * for user-initiated actions (create, update, delete).
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Logs a Firestore error WITHOUT throwing — use inside onSnapshot error
 * callbacks and other places where a throw would crash the React tree.
 */
export function logFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Error (non-fatal): ', JSON.stringify(errInfo));
}
