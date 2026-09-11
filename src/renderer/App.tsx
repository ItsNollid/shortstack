import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Queue from './pages/Queue';
import History from './pages/History';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import Analytics from './pages/Analytics';
import Calendar from './pages/Calendar';

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isSetup = location.pathname === '/setup';

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {!isSetup && <Sidebar />}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const settings = await window.api.getSettings();
        if (settings && settings.setup_complete) {
          setIsSetupComplete(true);
        } else {
          setIsSetupComplete(false);
        }
      } catch (err) {
        console.error("Error checking setup:", err);
      } finally {
        setLoading(false);
      }
    }
    checkSetup();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>Loading...</div>;
  }

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={isSetupComplete ? <Queue /> : <Navigate to="/setup" replace />} />
          <Route path="/history" element={isSetupComplete ? <History /> : <Navigate to="/setup" replace />} />
          <Route path="/analytics" element={isSetupComplete ? <Analytics /> : <Navigate to="/setup" replace />} />
          <Route path="/calendar" element={isSetupComplete ? <Calendar /> : <Navigate to="/setup" replace />} />
          <Route path="/settings" element={isSetupComplete ? <Settings /> : <Navigate to="/setup" replace />} />
          <Route path="/setup" element={<Setup onComplete={() => setIsSetupComplete(true)} />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  );
}
