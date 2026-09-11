import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  getVideos: () => ipcRenderer.invoke(IPC_CHANNELS.GET_VIDEOS),
  getQueue: () => ipcRenderer.invoke(IPC_CHANNELS.GET_QUEUE),
  approveQueueItem: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.APPROVE_QUEUE_ITEM, id),
  rejectQueueItem: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.REJECT_QUEUE_ITEM, id),
  updateQueueItem: (id: number, data: any) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_QUEUE_ITEM, id, data),
  bulkUpdateQueue: (ids: number[], data: any) => ipcRenderer.invoke(IPC_CHANNELS.BULK_UPDATE_QUEUE, ids, data),
  getUploads: () => ipcRenderer.invoke(IPC_CHANNELS.GET_UPLOADS),
  getAnalytics: (videoId?: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_ANALYTICS, videoId),
  getChannelAnalytics: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CHANNEL_ANALYTICS),
  generateMetadata: (filename: string) => ipcRenderer.invoke(IPC_CHANNELS.GENERATE_METADATA, filename),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSetting: (key: string, value: any) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTING, key, value),
  scanFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SCAN_FOLDER),
  pauseSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.PAUSE_SCHEDULE),
  resumeSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.RESUME_SCHEDULE),
  getScheduleStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SCHEDULE_STATUS),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),
  startOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.START_OAUTH),
  getAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AUTH_STATUS),
  startTikTokAuth: () => ipcRenderer.invoke(IPC_CHANNELS.START_TIKTOK_AUTH),
  startInstagramAuth: () => ipcRenderer.invoke(IPC_CHANNELS.START_INSTAGRAM_AUTH),
  
  onNotification: (callback: (event: any, msg: string) => void) => ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, callback),
  onUploadProgress: (callback: (event: any, data: any) => void) => ipcRenderer.on(IPC_CHANNELS.UPLOAD_PROGRESS, callback)
});
