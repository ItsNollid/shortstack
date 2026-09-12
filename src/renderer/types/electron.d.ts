import type { ShortStackApi } from '../../shared/ipc';

declare global {
  interface Window {
    api: ShortStackApi;
  }
}

export {};
