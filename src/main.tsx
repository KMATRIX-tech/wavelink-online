import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully handle iframe cross-origin authentication ping rejections in embedded environments
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = (reason && (reason.message || String(reason))) || '';
    const code = (reason && reason.code) || '';
    if (
      code === 'auth/network-request-failed' ||
      msg.includes('auth/network-request-failed') ||
      msg.includes('network-request-failed')
    ) {
      // Prevent browser host/console from flagging this as an unhandled app crash
      event.preventDefault();
      console.warn('Caught and handled cross-origin Firebase Auth network notice:', msg);
    }
  });
}

// Register PWA service worker for offline shell and installability
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('ServiceWorker registration note:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
