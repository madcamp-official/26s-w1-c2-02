import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './shared/auth/AuthContext';
import './styles.css';

async function enableMocking() {
  if (!import.meta.env.DEV) {
    return;
  }
  // Mocks are on by default in dev. Set VITE_ENABLE_MOCKS=false to bypass MSW and
  // hit the real backend (see docs/integration-testing.md).
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') {
    return;
  }
  const { worker } = await import('./mocks/browser');
  return worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
});
