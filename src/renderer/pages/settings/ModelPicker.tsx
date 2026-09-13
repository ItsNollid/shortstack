import React, { useState } from 'react';
import { Button, Banner, Select } from '../../components/ui';
import { findModel, type AiModel } from '../../../shared/aiModels';
import styles from './Settings.module.css';

export interface ModelPickerProps {
  models: readonly AiModel[];
  value: string;
  onChange: (model: string) => void;
}

type Check = { state: 'idle' } | { state: 'running' } | { state: 'ok'; model: string } | { state: 'failed'; reason: string };

/**
 * A name typed by hand is only a guess that something will work. Installing a model, naming it
 * correctly and still having it fail to load is a real state — Ollama can no longer run some
 * architectures it used to — so the list comes from Ollama and the button proves the choice.
 */
export function ModelPicker({ models, value, onChange }: ModelPickerProps): React.JSX.Element {
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  // Ollama lists "llama3.2:latest" but accepts "llama3.2", so a setting written before this was a
  // list still names a real model and must not be shown as a missing one.
  const installed = findModel(models, value);
  const selected = installed?.name ?? value;

  const runCheck = async (): Promise<void> => {
    setCheck({ state: 'running' });
    const result = await window.api.aiTest(selected);
    setCheck(result.ok ? { state: 'ok', model: selected } : { state: 'failed', reason: result.error.message });
  };

  const options = models.map((model) => ({
    value: model.name,
    label: model.vision ? `${model.name} — can see the video` : `${model.name} — text only`
  }));

  if (value !== '' && installed === undefined) options.unshift({ value, label: `${value} — not installed` });

  return (
    <div>
      <div className={styles.pair}>
        <Select
          label="Model"
          value={selected}
          onChange={(next) => {
            setCheck({ state: 'idle' });
            onChange(next);
          }}
          options={options.length === 0 ? [{ value: '', label: 'No models installed' }] : options}
          disabled={options.length === 0}
          hint={
            models.length === 0
              ? 'Start Ollama, then install one: ollama pull qwen3-vl'
              : 'A model that can see the video is shown stills from three points in the clip.'
          }
        />
        <div className={styles.checkRow}>
          <Button onClick={() => void runCheck()} disabled={value === '' || check.state === 'running'}>
            {check.state === 'running' ? 'Loading the model…' : 'Check this model'}
          </Button>
        </div>
      </div>

      {check.state === 'ok' && check.model === selected && (
        <Banner kind="success" title={`${selected} works`}>
          It loaded and answered. Suggestions will use it.
        </Banner>
      )}
      {check.state === 'failed' && <Banner kind="warning" title="That model did not run">{check.reason}</Banner>}
    </div>
  );
}
