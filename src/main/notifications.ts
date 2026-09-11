import { Notification } from 'electron';
import { getMainWindow } from './index';

export const sendNotification = (title: string, body: string) => {
  new Notification({ title, body }).show();
};

export const sendToRenderer = (channel: string, data: any) => {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(channel, data);
  }
};
