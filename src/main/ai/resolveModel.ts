// Which installed model to ask, from a preferred name — the same rules the Analytics advice follows, kept here
// for the assistant. An empty preference means the first model installed.
import { findModel } from '../../shared/aiModels';
import { listModels, type AiResult } from './ollamaClient';

export interface ResolvedModel {
  name: string;
  /** Whether it reasons before answering, which ShortStack always tells it not to. */
  thinking: boolean;
}

export async function resolveModel(host: string, preferred: string, doFetch?: typeof fetch): Promise<AiResult<ResolvedModel>> {
  const installed = await listModels({ host, fetch: doFetch });
  if (!installed.ok && preferred === '') return installed;
  const available = installed.ok ? installed.value : [];
  const chosen = findModel(available, preferred) ?? (preferred === '' ? available[0] : undefined);
  const name = chosen?.name ?? preferred;
  if (name === '') return { ok: false, code: 'no_models', reason: 'Choose a model in Settings first' };
  return { ok: true, value: { name, thinking: chosen?.thinking === true } };
}
