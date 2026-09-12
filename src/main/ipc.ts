import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import { getMainWindow } from './index';
import { 
  getDb,
  getAllVideos, 
  getAllQueueItems, 
  approveQueueItem, 
  rejectQueueItem, 
  updateQueueItem, 
  getAllUploads, 
  getSettings, 
  setSetting 
} from './database';
import { startOAuth, getAuthStatus } from './youtube/auth';
import { fetchChannelAnalytics } from './youtube/analytics';
import { startTikTokAuth } from './platforms/tiktok';
import { startInstagramAuth } from './platforms/instagram';
// uploader is unused right now in IPC directly but imported in prompt, wait "import all service functions from ... './youtube/uploader'"
import * as uploader from './youtube/uploader';
import { scanFolder } from './files/scanner';
import { pause, resume, getStatus } from './scheduler';
import { generateMetadata, listModels } from './ai/ollamaClient';
import { readSettings } from './db/settingsRepo';

export const registerIpcHandlers = () => {
  ipcMain.handle(IPC_CHANNELS.GET_VIDEOS, () => getAllVideos());
  
  ipcMain.handle(IPC_CHANNELS.SCAN_FOLDER, () => scanFolder(getDb()));
  
  ipcMain.handle(IPC_CHANNELS.GET_QUEUE, () => getAllQueueItems());
  
  ipcMain.handle(IPC_CHANNELS.APPROVE_QUEUE_ITEM, (_, id) => approveQueueItem(id));
  
  ipcMain.handle(IPC_CHANNELS.REJECT_QUEUE_ITEM, (_, id) => rejectQueueItem(id));
  
  ipcMain.handle(IPC_CHANNELS.UPDATE_QUEUE_ITEM, (_, id, data) => updateQueueItem(id, data));
  
  ipcMain.handle(IPC_CHANNELS.BULK_UPDATE_QUEUE, (_, ids, data) => {
    for (const id of ids) {
      updateQueueItem(id, data);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.GET_UPLOADS, () => getAllUploads());
  
  ipcMain.handle(IPC_CHANNELS.GET_ANALYTICS, () => []);
  
  ipcMain.handle(IPC_CHANNELS.GET_CHANNEL_ANALYTICS, () => fetchChannelAnalytics());
  
  ipcMain.handle(IPC_CHANNELS.GENERATE_METADATA, async (_, filename: string) => {
    const { settings } = readSettings(getDb());
    const installed = await listModels({ host: settings.ai_host });
    if (settings.ai_model === '' && !installed.ok) return installed;
    const model = settings.ai_model !== '' ? settings.ai_model : installed.ok ? installed.value[0] : '';
    return generateMetadata({ filename, model }, { host: settings.ai_host });
  });
  
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => getSettings());
  
  ipcMain.handle(IPC_CHANNELS.SET_SETTING, (_, key, value) => setSetting(key, value));
  
  ipcMain.handle(IPC_CHANNELS.PAUSE_SCHEDULE, () => pause());
  
  ipcMain.handle(IPC_CHANNELS.RESUME_SCHEDULE, () => resume());
  
  ipcMain.handle(IPC_CHANNELS.GET_SCHEDULE_STATUS, () => getStatus());
  
  ipcMain.handle(IPC_CHANNELS.START_OAUTH, async () => {
    await startOAuth();
    const status = await getAuthStatus();
    return { success: true, channelName: status.channelName };
  });

  ipcMain.handle(IPC_CHANNELS.START_TIKTOK_AUTH, async () => {
    return await startTikTokAuth();
  });

  ipcMain.handle(IPC_CHANNELS.START_INSTAGRAM_AUTH, async () => {
    return await startInstagramAuth();
  });
  
  ipcMain.handle(IPC_CHANNELS.GET_AUTH_STATUS, () => getAuthStatus());
  
  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
};
