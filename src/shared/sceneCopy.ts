// How each kind of still is named on screen: as a caption under a still, and inside a sentence.
import type { Scene } from './videoReading';

export const SCENE_LABELS: Record<Scene, string> = {
  gameplay: 'Gameplay',
  menu: 'Menu',
  lobby: 'Lobby',
  loading: 'Loading screen',
  black: 'Black screen',
  face: 'Face cam',
  text: 'Text',
  other: 'Other'
};

export const SCENE_NOUNS: Record<Scene, string> = {
  gameplay: 'gameplay',
  menu: 'a menu',
  lobby: 'a lobby',
  loading: 'a loading screen',
  black: 'a black screen',
  face: 'a face cam',
  text: 'text',
  other: 'something else'
};

/** "a lobby", "a lobby and a menu", "a lobby, a menu and a loading screen". */
export function joinScenes(scenes: readonly Scene[]): string {
  const nouns = scenes.map((scene) => SCENE_NOUNS[scene]);
  if (nouns.length <= 1) return nouns[0] ?? '';
  return `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1] as string}`;
}
