// What listening to a video needs: the whisper.cpp engine and one of its models. Both are downloaded only when
// the person asks, from the official sources, and checked against the checksums those sources publish before
// anything is run or loaded.

export type EngineKind = 'cpu' | 'gpu';

export interface EngineDownload {
  kind: EngineKind;
  label: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  text: string;
}

/** The whisper.cpp build these come from, at github.com/ggml-org/whisper.cpp. Checksums as GitHub publishes them. */
export const ENGINE_RELEASE = 'b5130';
const releaseUrl = (file: string): string => `https://github.com/ggml-org/whisper.cpp/releases/download/${ENGINE_RELEASE}/${file}`;

export const ENGINES: Record<EngineKind, EngineDownload> = {
  cpu: {
    kind: 'cpu',
    label: 'Processor',
    file: 'whisper-bin-x64.zip',
    url: releaseUrl('whisper-bin-x64.zip'),
    bytes: 8_573_270,
    sha256: 'f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c',
    text: 'Runs on any Windows PC. Slower, especially with the larger models.'
  },
  gpu: {
    kind: 'gpu',
    label: 'NVIDIA graphics card',
    file: 'whisper-cublas-12.4.0-bin-x64.zip',
    url: releaseUrl('whisper-cublas-12.4.0-bin-x64.zip'),
    bytes: 674_539_285,
    sha256: 'af520ddd034d985b55dfeea3e465ed93653ba2aee1a55e865033edc548c272a7',
    // Measured: the smaller CUDA 11.8 build leaves out cublas64_11.dll, which its GPU module needs, so on a PC
    // without NVIDIA's toolkit it quietly ran on the processor instead.
    text: 'Much faster on an NVIDIA card. A large download, because it carries the NVIDIA libraries it needs.'
  }
};

export interface ModelDownload {
  id: string;
  label: string;
  file: string;
  bytes: number;
  sha256: string;
  /** English only, which is smaller and more accurate for English speech than the same size in every language. */
  englishOnly: boolean;
  /** Whether it is only quick enough with a graphics card. */
  wantsGpu: boolean;
  text: string;
}

export const MODEL_SOURCE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
export const modelUrl = (model: ModelDownload): string => `${MODEL_SOURCE}${model.file}`;

/** Quantized builds of each size: a fraction of the download, for little loss. Sizes and checksums from the source. */
export const MODELS: readonly ModelDownload[] = [
  {
    id: 'tiny.en-q5_1',
    label: 'Tiny',
    file: 'ggml-tiny.en-q5_1.bin',
    bytes: 32_166_155,
    sha256: 'c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b',
    englishOnly: true,
    wantsGpu: false,
    text: 'The lightest, for older or low-power PCs. It misses the most words.'
  },
  {
    id: 'base.en-q5_1',
    label: 'Base',
    file: 'ggml-base.en-q5_1.bin',
    bytes: 59_721_011,
    sha256: '4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f',
    englishOnly: true,
    wantsGpu: false,
    text: 'Light enough for most laptops.'
  },
  {
    id: 'small.en-q5_1',
    label: 'Small',
    file: 'ggml-small.en-q5_1.bin',
    bytes: 190_098_681,
    sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
    englishOnly: true,
    wantsGpu: false,
    text: 'The best balance on a PC without an NVIDIA graphics card.'
  },
  {
    id: 'medium.en-q5_0',
    label: 'Medium',
    file: 'ggml-medium.en-q5_0.bin',
    bytes: 539_225_533,
    sha256: '76733e26ad8fe1c7a5bf7531a9d41917b2adc0f20f2e4f5531688a8c6cd88eb0',
    englishOnly: true,
    wantsGpu: true,
    text: 'More accurate, and quick with an NVIDIA graphics card.'
  },
  {
    id: 'large-v3-turbo-q5_0',
    label: 'Large turbo',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    bytes: 574_041_195,
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    englishOnly: false,
    wantsGpu: true,
    text: 'The most accurate, in any language. Needs an NVIDIA graphics card to be quick.'
  }
];

export const findModel = (id: string): ModelDownload | undefined => MODELS.find((model) => model.id === id);

export interface MachineFacts {
  hasNvidia: boolean;
  /** Installed memory. */
  memoryBytes: number;
}

export interface ListeningRecommendation {
  engine: EngineKind;
  model: ModelDownload;
}

const GIB = 1024 ** 3;

/** What to offer first. The person can pick anything; this only decides the order and the label. */
export function recommendListening(machine: MachineFacts): ListeningRecommendation {
  if (machine.hasNvidia) return { engine: 'gpu', model: findModel('medium.en-q5_0') as ModelDownload };
  if (machine.memoryBytes > 0 && machine.memoryBytes < 8 * GIB) return { engine: 'cpu', model: findModel('base.en-q5_1') as ModelDownload };
  return { engine: 'cpu', model: findModel('small.en-q5_1') as ModelDownload };
}

/** "539 MB", "8.6 MB", "32 MB", the way a download size is read. */
export function downloadSize(bytes: number): string {
  const megabytes = bytes / 1_000_000;
  if (megabytes >= 1000) return `${(megabytes / 1000).toFixed(1)} GB`;
  return megabytes < 10 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`;
}

export type EngineChoice = 'auto' | EngineKind;

export interface ListeningChoice {
  engine: EngineChoice;
  installedEngines: readonly EngineKind[];
  modelId: string;
  modelFile: string;
  installedModels: readonly string[];
}

export interface ResolvedListening {
  engine: EngineKind;
  /** A downloaded model's id, or null for a file chosen from this computer. */
  modelId: string | null;
  modelFile: string | null;
  englishOnly: boolean;
  label: string;
}

/** What would listen right now, or why nothing can yet, in words the Settings screen can show. */
export function resolveListening(choice: ListeningChoice): { ok: true; value: ResolvedListening } | { ok: false; reason: string } {
  const installed = (kind: EngineKind): boolean => choice.installedEngines.includes(kind);
  const engine: EngineKind | null =
    choice.engine === 'auto' ? (installed('gpu') ? 'gpu' : installed('cpu') ? 'cpu' : null) : installed(choice.engine) ? choice.engine : null;
  if (engine === null) {
    return {
      ok: false,
      reason: choice.engine === 'auto' ? 'Download a listening engine first' : `The ${ENGINES[choice.engine].label.toLowerCase()} engine is not downloaded`
    };
  }

  if (choice.modelFile !== '') {
    const name = choice.modelFile.split(/[\\/]/).pop() ?? choice.modelFile;
    return { ok: true, value: { engine, modelId: null, modelFile: choice.modelFile, englishOnly: /\.en[.-]/i.test(name), label: name } };
  }
  const model = findModel(choice.modelId);
  if (model === undefined) return { ok: false, reason: 'Choose a listening model' };
  if (!choice.installedModels.includes(model.id)) return { ok: false, reason: `Download the ${model.label} model first` };
  return { ok: true, value: { engine, modelId: model.id, modelFile: null, englishOnly: model.englishOnly, label: model.label } };
}

export interface ListeningDownload {
  engine: EngineKind | null;
  modelId: string | null;
  label: string;
  received: number;
  total: number;
}

export interface ListeningStatus {
  machine: { hasNvidia: boolean; cards: string[]; memoryBytes: number };
  recommended: { engine: EngineKind; modelId: string };
  engines: EngineKind[];
  models: string[];
  downloading: ListeningDownload | null;
  /** Why the last download failed, until the next one starts. */
  problem: string | null;
  /** Where the last listen ran, which is how a graphics card build that fell back to the processor shows itself. */
  lastBackend: 'gpu' | 'cpu' | 'unknown' | null;
  resolved: ResolvedListening | null;
  notReady: string | null;
}
