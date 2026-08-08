import { StrictMode } from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import RootApp from '@replofy/runtime-app';

// ── Global handler for Firestore SDK internal assertion failures ──
// Firebase Firestore SDK v12.x throws uncatchable "INTERNAL ASSERTION FAILED"
// errors when a permission-denied error corrupts the watch stream state.
// These bypass onSnapshot error callbacks, so we suppress them here to
// prevent cascading crashes that take down the entire React tree.
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason);
  if (msg.includes('INTERNAL ASSERTION FAILED') || msg.includes('FIRESTORE')) {
    console.warn('[Firestore SDK] Suppressed internal assertion failure:', event.reason);
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  const msg = String(event.error?.message || event.message || '');
  if (msg.includes('INTERNAL ASSERTION FAILED') || msg.includes('FIRESTORE')) {
    console.warn('[Firestore SDK] Suppressed internal error:', msg);
    event.preventDefault();
    return true; // Prevents the error from propagating
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
);
