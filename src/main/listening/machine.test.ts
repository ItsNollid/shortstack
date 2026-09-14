import { describe, expect, it } from 'vitest';
import { machineFacts, nvidiaCards, parseGpuList } from './machine';

describe('finding an NVIDIA card', () => {
  it('reads the cards nvidia-smi lists', () => {
    expect(parseGpuList('GPU 0: NVIDIA GeForce RTX 3080 (UUID: GPU-8a1b2c3d-0000-1111-2222-333344445555)\r\n')).toEqual(['NVIDIA GeForce RTX 3080']);
    expect(parseGpuList('GPU 0: Tesla T4\nGPU 1: Tesla T4 (UUID: GPU-x)\n')).toEqual(['Tesla T4', 'Tesla T4']);
    expect(parseGpuList('')).toEqual([]);
  });

  it('finds none when there is no driver to ask', async () => {
    const missing = async (): Promise<string> => {
      throw new Error("'nvidia-smi' is not recognized");
    };
    expect(await nvidiaCards(missing)).toEqual([]);
    expect(await machineFacts(missing)).toMatchObject({ hasNvidia: false, cards: [] });
  });

  it('says there is one when the driver lists a card', async () => {
    const facts = await machineFacts(async () => 'GPU 0: NVIDIA GeForce RTX 3080 (UUID: GPU-1)\n');
    expect(facts.hasNvidia).toBe(true);
    expect(facts.memoryBytes).toBeGreaterThan(0);
  });
});
