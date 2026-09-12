import { contextBridge, ipcRenderer } from 'electron';
import { APP_EVENTS, IPC_METHODS, type AppEvent, type ShortStackApi } from '../shared/ipc';

// Each method forwards to a channel of the same name; the contract is the single source of truth,
// so preload and renderer cannot disagree about what exists.
const api = Object.fromEntries(
  IPC_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(method, ...args)])
) as unknown as ShortStackApi;

api.on = (event: AppEvent, listener: (payload: unknown) => void): (() => void) => {
  if (!APP_EVENTS.includes(event)) throw new Error(`Unknown event: ${event}`);
  const handler = (_: unknown, payload: unknown): void => listener(payload);
  ipcRenderer.on(event, handler);
  // Returning the unsubscribe is what stops listeners piling up on every remount.
  return () => ipcRenderer.removeListener(event, handler);
};

contextBridge.exposeInMainWorld('api', api);
