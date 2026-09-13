import React, { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Analytics } from '../pages/Analytics';
import { Calendar } from '../pages/calendar/Calendar';
import { Diagnostics } from '../pages/Diagnostics';
import { History } from '../pages/History';
import { Queue } from '../pages/Queue';
import { Review } from '../pages/review/Review';
import { SettingsPage } from '../pages/settings/Settings';
import { FirstRun } from '../pages/setup/FirstRun';
import { WhatsNew } from '../components/WhatsNew';
import { VideoDetails } from '../pages/VideoDetails';
import { Banners } from './Banners';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { ApprovalProvider, useRequestApproval } from './approval';
import { AppStatusProvider } from './status';
import { ToastProvider } from './toast';
import styles from './AppShell.module.css';

function VideoDetailsRoute(): React.JSX.Element {
  const requestApproval = useRequestApproval();
  return <VideoDetails onApprove={(item) => requestApproval([item])} />;
}

/** A file dragged in from the desktop and dropped anywhere would otherwise navigate the window to
 *  that file. Only drags carrying files are blocked; the calendar's own drags are untouched. */
function useBlockFileDrops(): void {
  useEffect(() => {
    const block = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files') === true) event.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);
}

export function AppShell(): React.JSX.Element {
  useBlockFileDrops();

  return (
    <AppStatusProvider>
      <ToastProvider>
        <ApprovalProvider>
          {/* Covers everything until the policies are accepted and setup is done. */}
          <FirstRun />
          {/* After it, so an update notice never appears on top of a gate that has to be dealt with. */}
          <WhatsNew />
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
                    <Route path="/review" element={<Review />} />
                      <Route path="/calendar" element={<Calendar />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/analytics" element={<Analytics />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/video/:id" element={<VideoDetailsRoute />} />
                      <Route path="/diagnostics" element={<Diagnostics />} />
                      <Route path="*" element={<Navigate to="/queue" replace />} />
                    </Routes>
                  </div>
                </main>
              </div>
            </div>
          </HashRouter>
        </ApprovalProvider>
      </ToastProvider>
    </AppStatusProvider>
  );
}
