import React from 'react';
import { ENGINES, MODELS, downloadSize, type EngineKind, type ListeningStatus } from '../../../shared/listening';
import type { Result } from '../../../shared/ipc';
import { Banner, Button, Progress, Select, Switch } from '../../components/ui';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import type { SettingsWriter } from './useSettings';
import { Section } from './parts';
import styles from './ListeningSection.module.css';

const readStatus = (): Promise<Result<ListeningStatus>> => window.api.listeningStatus();

type Request = { engine: EngineKind } | { model: string };

const ENGINE_ORDER: readonly EngineKind[] = ['cpu', 'gpu'];

/**
 * Nothing downloads until a button here is pressed, and nothing listens until the switch is on. Both the engine
 * and the models come from whisper.cpp's official sources and are checked against their published checksums.
 */
export function ListeningSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const status = useApiQuery(readStatus, { key: 'listening-settings', invalidateOn: ['listening:changed'] });
  const download = useApiMutation((request: Request) => window.api.listeningDownload(request));
  const remove = useApiMutation((request: Request) => window.api.listeningRemove(request));
  const chooseFile = useApiMutation(() => window.api.listeningChooseModelFile());
  const { settings } = writer;
  if (settings === null) return <Section title="Listening to videos">Loading…</Section>;

  const data = status.data;
  const busy = data === null || data.downloading !== null;
  const problem = download.error ?? remove.error ?? chooseFile.error ?? data?.problem ?? null;
  const fellBack = data?.lastBackend === 'cpu' && data.resolved?.engine === 'gpu';

  const startModel = (id: string): void => {
    // The first model downloaded is the one used, unless something else was already chosen.
    if (settings.listen_model === '' && settings.listen_model_file === '') writer.set('listen_model', id);
    void download.run({ model: id });
  };

  return (
    <Section
      id="listening"
      title="Listening to videos"
      text="Optional. ShortStack can listen to what is said in a clip and use it when drafting titles. It all happens on this computer: the engine and a model download once, and your videos never leave the PC."
    >
      <Switch
        label="Listen to videos when drafting"
        hint={
          settings.listen_enabled
            ? 'Each video is listened to once, the first time details are drafted for it, and what was said is kept. The processor or graphics card is busy while it listens.'
            : 'Off: drafting uses the stills, the file name and your past uploads.'
        }
        checked={settings.listen_enabled}
        onChange={(value) => writer.set('listen_enabled', value)}
      />

      {settings.listen_enabled && data !== null && data.notReady !== null && (
        <Banner kind="warning" title="Not ready to listen yet">
          {data.notReady}.
        </Banner>
      )}
      {problem !== null && (
        <Banner kind="danger" title="That did not work">
          {problem}
        </Banner>
      )}
      {fellBack && (
        <Banner kind="warning" title="The graphics card engine ran on the processor">
          The last video was listened to on the processor, which means the NVIDIA libraries did not load. Updating the
          NVIDIA driver usually fixes it.
        </Banner>
      )}

      {data !== null && data.downloading !== null && (
        <div className={styles.progress}>
          <div className={styles.progressHead}>
            <span>
              Downloading the {data.downloading.label}: {downloadSize(data.downloading.received)} of {downloadSize(data.downloading.total)}
            </span>
            <Button size="small" variant="ghost" onClick={() => void window.api.listeningCancel()}>
              Cancel
            </Button>
          </div>
          <Progress
            value={data.downloading.total === 0 ? null : data.downloading.received / data.downloading.total}
            label={`Downloading the ${data.downloading.label}`}
          />
        </div>
      )}

      <div className={styles.group} role="group" aria-label="Listening engines">
        <div className={styles.groupTitle}>Engine</div>
        {ENGINE_ORDER.map((kind) => {
          const engine = ENGINES[kind];
          const installed = data?.engines.includes(kind) === true;
          return (
            <div key={kind} className={styles.row} role="group" aria-label={`${engine.label} engine`}>
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>
                  {engine.label}
                  {data?.recommended.engine === kind && <span className={styles.chip}>Suits this computer</span>}
                </div>
                <div className={styles.rowText}>
                  {engine.text} {downloadSize(engine.bytes)}.
                </div>
              </div>
              <div className={styles.rowActions}>
                {installed ? (
                  <>
                    <span className={styles.have}>Downloaded</span>
                    <Button size="small" variant="ghost" disabled={busy} onClick={() => void remove.run({ engine: kind })}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button size="small" disabled={busy} onClick={() => void download.run({ engine: kind })}>
                    Download
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {data !== null && (data.engines.length > 1 || settings.listen_engine !== 'auto') && (
          <Select
            label="Listen with"
            value={settings.listen_engine}
            onChange={(value) => writer.set('listen_engine', value as 'auto' | 'cpu' | 'gpu')}
            options={[
              { value: 'auto', label: 'The graphics card when its engine is downloaded' },
              { value: 'gpu', label: 'The graphics card' },
              { value: 'cpu', label: 'The processor' }
            ]}
          />
        )}
      </div>

      <div className={styles.group} role="group" aria-label="Listening models">
        <div className={styles.groupTitle}>Model</div>
        <div className={styles.rowText}>
          Larger models hear more accurately and take longer. English models are smaller, and more accurate for English.
        </div>
        {MODELS.map((model) => {
          const installed = data?.models.includes(model.id) === true;
          const inUse = settings.listen_model_file === '' && settings.listen_model === model.id;
          return (
            <div key={model.id} className={styles.row} role="group" aria-label={`${model.label} model`}>
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>
                  {model.label}
                  <span className={styles.tag}>{model.englishOnly ? 'English' : 'Any language'}</span>
                  {data?.recommended.modelId === model.id && <span className={styles.chip}>Suits this computer</span>}
                </div>
                <div className={styles.rowText}>
                  {model.text} {downloadSize(model.bytes)}.
                </div>
              </div>
              <div className={styles.rowActions}>
                {!installed && (
                  <Button size="small" disabled={busy} onClick={() => startModel(model.id)}>
                    Download
                  </Button>
                )}
                {installed && inUse && <span className={styles.have}>In use</span>}
                {installed && !inUse && (
                  <Button
                    size="small"
                    onClick={() => {
                      writer.set('listen_model', model.id);
                      if (settings.listen_model_file !== '') writer.set('listen_model_file', '');
                    }}
                  >
                    Use this
                  </Button>
                )}
                {installed && (
                  <Button size="small" variant="ghost" disabled={busy} onClick={() => void remove.run({ model: model.id })}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <div className={styles.row} role="group" aria-label="A model already on this computer">
          <div className={styles.rowBody}>
            <div className={styles.rowTitle}>A model already on this computer</div>
            <div className={styles.rowText}>
              {settings.listen_model_file === ''
                ? 'Such as one another whisper app downloaded. It has to be a whisper.cpp .bin file.'
                : settings.listen_model_file}
            </div>
          </div>
          <div className={styles.rowActions}>
            {settings.listen_model_file !== '' && <span className={styles.have}>In use</span>}
            <Button
              size="small"
              disabled={chooseFile.pending}
              onClick={() =>
                void chooseFile.run().then((file) => {
                  if (typeof file === 'string') writer.set('listen_model_file', file);
                })
              }
            >
              {settings.listen_model_file === '' ? 'Choose a file' : 'Choose another'}
            </Button>
            {settings.listen_model_file !== '' && (
              <Button size="small" variant="ghost" onClick={() => writer.set('listen_model_file', '')}>
                Stop using it
              </Button>
            )}
          </div>
        </div>
      </div>

      {data !== null && data.resolved !== null && (
        <div className={styles.ready}>
          Ready: the {data.resolved.label} model, on the {data.resolved.engine === 'gpu' ? 'graphics card' : 'processor'}.
        </div>
      )}
    </Section>
  );
}
