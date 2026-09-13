import type { IgnoredSetting } from '../../../shared/settings';
import { useAppStatus } from '../../app/status';
import { useApiQuery } from '../../hooks/useApi';

/** Stored settings that could not be used. Asked again whenever settings change, since saving a fixed value is what clears one. */
export function useIgnoredSettings(): IgnoredSetting[] {
  const { settings } = useAppStatus();
  const version = settings === null ? '' : JSON.stringify(settings);
  const query = useApiQuery(() => window.api.settingsIgnored(), { key: `ignored:${version}`, enabled: settings !== null });
  return query.data ?? [];
}
