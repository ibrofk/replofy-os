import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const isLocalHost =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function requiredFirebaseValue(name: string, value: string | undefined, localFallback: string) {
  const normalized = value?.trim();
  if (normalized) return normalized;
  if (isLocalHost) return localFallback;
  throw new Error(`Missing required Firebase browser configuration: ${name}`);
}

function parseHost(value: string | undefined, defaultPort: number) {
  const [host, portText] = (value?.trim() || `127.0.0.1:${defaultPort}`).split(':');
  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid emulator host: ${value}`);
  }
  return { host, port };
}

const projectId = requiredFirebaseValue(
  'VITE_FIREBASE_PROJECT_ID',
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  'demo-replofy-os',
);

const firebaseConfig = {
  projectId,
  apiKey: requiredFirebaseValue(
    'VITE_FIREBASE_API_KEY',
    import.meta.env.VITE_FIREBASE_API_KEY,
    'demo-replofy-os',
  ),
  authDomain: requiredFirebaseValue(
    'VITE_FIREBASE_AUTH_DOMAIN',
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    `${projectId}.firebaseapp.com`,
  ),
  appId: requiredFirebaseValue(
    'VITE_FIREBASE_APP_ID',
    import.meta.env.VITE_FIREBASE_APP_ID,
    'demo-replofy-os',
  ),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const databaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID?.trim();
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
export const auth = getAuth(app);

const emulatorState = globalThis as typeof globalThis & {
  __replofyFirestoreEmulatorConnected?: boolean;
  __replofyAuthEmulatorConnected?: boolean;
};

if (isLocalHost && !emulatorState.__replofyFirestoreEmulatorConnected) {
  const { host, port } = parseHost(import.meta.env.VITE_FIRESTORE_EMULATOR_HOST, 8081);
  connectFirestoreEmulator(db, host, port);
  emulatorState.__replofyFirestoreEmulatorConnected = true;
}

if (isLocalHost && !emulatorState.__replofyAuthEmulatorConnected) {
  const { host, port } = parseHost(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST, 9099);
  connectAuthEmulator(auth, `http://${host}:${port}`);
  emulatorState.__replofyAuthEmulatorConnected = true;
}
