import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import { AppShell } from './app/AppShell';
import './styles/base.css';

// Opened in a plain browser for visual checks, there is no preload bridge to talk to. The import is
// dynamic and behind a build-time flag so the sample data never reaches a packaged build.
async function start(): Promise<void> {
  if (import.meta.env.DEV && window.api === undefined) {
    const { installDevApiStub } = await import('./devApiStub');
    installDevApiStub();
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>
  );
}

void start();
