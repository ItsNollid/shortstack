import { Menu, Tray, nativeImage } from 'electron';
import { brandIconPng } from './brandIcon';

export interface TrayDeps {
  showWindow(): void;
  quit(): void;
  isPaused(): boolean;
  setPaused(paused: boolean): void;
  describeStatus(): string;
}

/**
 * A real tray icon. The old build passed nativeImage.createEmpty(), so the tray was invisible
 * while the app kept running in the background with no way to reach it.
 */
export function createTray(deps: TrayDeps): Tray {
  const tray = new Tray(nativeImage.createFromBuffer(brandIconPng(16)));

  const refresh = (): void => {
    const paused = deps.isPaused();
    tray.setToolTip(`ShortStack — ${deps.describeStatus()}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open ShortStack', click: () => deps.showWindow() },
        { type: 'separator' },
        { label: deps.describeStatus(), enabled: false },
        {
          label: paused ? 'Resume uploads' : 'Pause uploads',
          click: () => {
            deps.setPaused(!paused);
            refresh();
          }
        },
        { type: 'separator' },
        { label: 'Quit ShortStack', click: () => deps.quit() }
      ])
    );
  };

  tray.on('click', () => deps.showWindow());
  tray.on('double-click', () => deps.showWindow());
  refresh();

  return Object.assign(tray, { refresh }) as Tray & { refresh(): void };
}
