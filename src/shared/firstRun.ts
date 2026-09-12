// What, if anything, stands between the user and the app on this launch. Pure so the rule can be
// tested: getting it wrong either traps someone who already agreed, or lets someone past a gate
// the API Services policies require before any feature is used.
import type { AppSettings } from './settings';

export type FirstRunStage = 'legal' | 'setup' | null;

export function firstRunStage(settings: AppSettings | null, currentLegalVersion: string): FirstRunStage {
  // Nothing is shown until the settings are known, so a slow read cannot flash the gate at someone
  // who accepted it months ago.
  if (settings === null) return null;
  // A changed policy has to be accepted again, which is what storing the version is for.
  if (settings.legal_accepted_version !== currentLegalVersion) return 'legal';
  return settings.setup_complete ? null : 'setup';
}
