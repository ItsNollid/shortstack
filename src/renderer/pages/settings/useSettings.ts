// Settings are written when a field is finished, not on every keystroke: the previous build saved
// per character, which raced the scheduler reading the same rows.
import { useCallback, useState } from 'react';
import type { AppSettings, SettingKey } from '../../../shared/settings';
import { validateSettingChange } from '../../../shared/settings';
import { useAppStatus } from '../../app/status';
import { useApiMutation } from '../../hooks/useApi';

export type SettingChange = { [K in SettingKey]: [K, AppSettings[K]] }[SettingKey];

export interface SettingsWriter {
  settings: AppSettings | null;
  /** Validates locally with the same rules the main process enforces, then writes. */
  set: <K extends SettingKey>(key: K, value: AppSettings[K]) => void;
  /** Applies changes in order, each validated against the settings the previous write returned.
   *  Consent timestamps have to land before the setting they unlock. */
  setSequence: (changes: readonly SettingChange[]) => Promise<boolean>;
  problemFor: (key: SettingKey) => string | null;
  pending: boolean;
}

export function useSettings(): SettingsWriter {
  const { settings, refreshSettings } = useAppStatus();
  const [problems, setProblems] = useState<Partial<Record<SettingKey, string>>>({});
  const write = useApiMutation((key: SettingKey, value: unknown) => window.api.settingsSet(key, value), {
    onDone: refreshSettings
  });

  const note = useCallback((key: SettingKey, problem: string | null): void => {
    setProblems((current) => ({ ...current, [key]: problem ?? undefined }));
  }, []);

  const setSequence = useCallback(
    async (changes: readonly SettingChange[]): Promise<boolean> => {
      let current = settings;
      if (current === null) return false;
      for (const [key, value] of changes) {
        const problem = validateSettingChange(current, key, value);
        note(key, problem);
        if (problem !== null) return false;
        const updated = await write.run(key, value);
        if (updated === null) {
          note(key, 'Could not save that');
          return false;
        }
        current = updated;
      }
      return true;
    },
    [settings, write, note]
  );

  const set = useCallback(
    <K extends SettingKey>(key: K, value: AppSettings[K]): void => {
      void setSequence([[key, value] as SettingChange]);
    },
    [setSequence]
  );

  const problemFor = useCallback((key: SettingKey): string | null => problems[key] ?? null, [problems]);

  return { settings, set, setSequence, problemFor, pending: write.pending };
}
