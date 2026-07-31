import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { IN_EXTENSION } from './ext/api';
import { markSurface } from './ext/panel';

// Before first paint, so the popup and the sidebar are laid out for the room
// they have rather than reflowing once React arrives.
markSurface();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installed to a home screen, the app has to open without a network. The worker
// only caches the shell and the hashed assets — data lives in localStorage and
// the API is never intercepted. Dev is left alone so hot reload keeps working,
// and the extension has no use for it: its assets are already on disk.
if ('serviceWorker' in navigator && import.meta.env.PROD && !IN_EXTENSION) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}
