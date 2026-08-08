/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPLOFY_PLATFORM?: 'firebase' | 'standalone';
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIRESTORE_DATABASE_ID?: string;
  readonly VITE_FIRESTORE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?url' {
  const src: string;
  export default src;
}
