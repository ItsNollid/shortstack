// One subscription to the app-wide facts (profile, connection, scheduler, settings) shared by the
// title bar, the sidebar and every page, so they can never disagree about the current state.
import React, { createContext, useContext, useMemo } from 'react';
import type { AppInfo, AuthStatus, Result, SchedulerStatus } from '../../shared/ipc';
import type { AppSettings } from '../../shared/settings';
import { useApiQuery } from '../hooks/useApi';

export interface AppStatus {
  info: AppInfo | null;
  auth: AuthStatus | null;
  scheduler: SchedulerStatus | null;
  settings: AppSettings | null;
  refreshAuth: () => void;
  refreshScheduler: () => void;
  refreshSettings: () => void;
}

const StatusContext = createContext<AppStatus | null>(null);

// appInfo cannot fail, so it is the one call that is not already a Result.
const readInfo = async (): Promise<Result<AppInfo>> => ({ ok: true, data: await window.api.appInfo() });
const readAuth = (): Promise<Result<AuthStatus>> => window.api.authStatus();
const readScheduler = (): Promise<Result<SchedulerStatus>> => window.api.schedulerStatus();
const readSettings = (): Promise<Result<AppSettings>> => window.api.settingsGetAll();

export function AppStatusProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const info = useApiQuery(readInfo, { key: 'appInfo' });
  const auth = useApiQuery(readAuth, { key: 'auth', invalidateOn: ['auth:changed'] });
  const scheduler = useApiQuery(readScheduler, { key: 'scheduler', invalidateOn: ['scheduler:status', 'queue:changed'] });
  const settings = useApiQuery(readSettings, { key: 'settings' });

  const value = useMemo<AppStatus>(
    () => ({
      info: info.data,
      auth: auth.data,
      scheduler: scheduler.data,
      settings: settings.data,
      refreshAuth: auth.refresh,
      refreshScheduler: scheduler.refresh,
      refreshSettings: settings.refresh
    }),
    [info.data, auth.data, scheduler.data, settings.data, auth.refresh, scheduler.refresh, settings.refresh]
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useAppStatus(): AppStatus {
  const value = useContext(StatusContext);
  if (value === null) throw new Error('useAppStatus must be used inside AppStatusProvider');
  return value;
}
