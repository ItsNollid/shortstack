import './bootstrap/profile';
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { initDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { startScheduler, stopScheduler, loadSchedulerState } from './scheduler';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0a0f',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
};

const createTray = () => {
  const icon = nativeImage.createEmpty(); // Replace with actual icon
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ShortStack', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Pause Schedule', click: () => stopScheduler() },
    { label: 'Resume Schedule', click: () => startScheduler() },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ShortStack Auto-Uploader');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow?.show();
  });
};

export const getMainWindow = () => mainWindow;

app.whenReady().then(async () => {
  initDatabase();
  registerIpcHandlers();
  createWindow();
  createTray();
  
  loadSchedulerState();
  startScheduler();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
