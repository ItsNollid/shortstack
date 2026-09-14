// What this computer has to listen with: whether there is an NVIDIA graphics card, and how much memory. Used only
// to decide which engine and model to offer first; the person can choose anything.
import * as os from 'os';
import type { MachineFacts } from '../../shared/listening';
import { runTool, type RunTool } from '../media/renderRunner';

/** The cards `nvidia-smi -L` lists, one per line: "GPU 0: NVIDIA GeForce RTX 3080 (UUID: GPU-…)". */
export function parseGpuList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => /^GPU \d+:\s*(.+?)\s*(?:\(UUID:.*\))?$/.exec(line.trim())?.[1])
    .filter((name): name is string => name !== undefined && name !== '');
}

/** The NVIDIA driver puts nvidia-smi on the path; without the driver there is no card CUDA can use. */
export async function nvidiaCards(run: RunTool = runTool): Promise<string[]> {
  try {
    return parseGpuList(await run('nvidia-smi', ['-L'], 5_000));
  } catch {
    return [];
  }
}

export async function machineFacts(run: RunTool = runTool): Promise<MachineFacts & { cards: string[] }> {
  const cards = await nvidiaCards(run);
  return { hasNvidia: cards.length > 0, memoryBytes: os.totalmem(), cards };
}
