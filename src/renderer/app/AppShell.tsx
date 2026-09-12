import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Analytics } from '../pages/Analytics';
import { Calendar } from '../pages/Calendar';
import { Diagnostics } from '../pages/Diagnostics';
import { History } from '../pages/History';
import { Queue } from '../pages/Queue';
import { SettingsPage } from '../pages/Settings';
import { Banners } from './Banners';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { AppStatusProvider } from './status';
import styles from './AppShell.module.css';

export function AppShell(): React.JSX.Element {
  return (
    <AppStatusProvider>
      {/* Hash routing: a packaged app loads from file://, where path routing has no server. */}
      <HashRouter>
        <div className={styles.shell}>
          <TitleBar />
          <div className={styles.body}>
            <Sidebar />
            <main className={styles.main}>
              <div className={styles.banners}>
                <Banners />
              </div>
              <div className={styles.page}>
                <Routes>
                  <Route path="/queue" element={<Queue />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/diagnostics" element={<Diagnostics />} />
                  <Route path="*" element={<Navigate to="/queue" replace />} />
                </Routes>
              </div>
            </main>
          </div>
        </div>
      </HashRouter>
    </AppStatusProvider>
  );
}
