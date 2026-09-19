import React from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import type { MaxAge } from '../../../shared/analyticsRefresh';
import type { Brief, Fact } from '../../../shared/insights';
import { describeChange, type SettingChange } from '../../../shared/channelActions';
import type { AdviceItemDTO, ChannelAdvice, Result } from '../../../shared/ipc';
import { Banner, Button, Skeleton } from '../../components/ui';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import styles from '../Analytics.module.css';

/**
 * Two halves, deliberately in this order. What was measured comes first and is always shown; the
 * model's reading of it comes second and only when asked for. Someone who never presses the button
 * still gets everything that is true — the findings are the product, the advice is a convenience.
 *
 * Measured whenever the numbers above are pulled, and kept the same way, so opening the page does
 * not measure again. `pullId` changes with each look the page takes.
 */
export function Insights({ days, pullId, maxAge }: { days: number; pullId: number; maxAge: MaxAge }): React.JSX.Element {
  const brief = useApiQuery((): Promise<Result<Brief | null>> => window.api.insightsGet(days, maxAge), {
    key: `insights:${days}:${pullId}`
  });
  const advise = useApiMutation((): Promise<Result<ChannelAdvice>> => window.api.insightsAdvise(days));

  if (brief.loading) return <Skeleton height={160} radius="var(--radius)" />;
  if (brief.error !== null) {
    return (
      <Banner kind="warning" title="Could not work out what your videos have in common" actions={<Button size="small" onClick={brief.refresh}>Try again</Button>}>
        {brief.error}
      </Banner>
    );
  }
  if (brief.data === null) return <></>;

  const { usable, missing, videoCount, tooEarly } = brief.data;
  const advice = advise.data;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>What your own videos say</span>
        <span className={styles.range}>measured across {videoCount} videos</span>
      </div>
      {/* Required by YouTube for anything worked out from its data: say plainly whose numbers these are. */}
      <div className={styles.ownWork}>
        ShortStack’s own calculations from your YouTube figures — estimates, not data published or approved by YouTube.
      </div>

      {tooEarly ? (
        <Banner kind="info" title="Not enough to go on yet">
          Nothing here can be measured from {videoCount} videos. What is missing is listed below, and each line says what
          would produce it.
        </Banner>
      ) : (
        <ul className={styles.findings}>
          {usable.map((fact) => (
            <Finding key={fact.id} fact={fact} />
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <details className={styles.missing}>
          <summary className={styles.missingHead}>
            {missing.length} thing{missing.length === 1 ? '' : 's'} that cannot be measured yet
          </summary>
          <ul className={styles.findings}>
            {missing.map((fact) => (
              <li key={fact.id} className={styles.findingMuted}>
                {fact.statement}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={styles.adviceBar}>
        <Button onClick={() => void advise.run()} disabled={advise.pending}>
          <Sparkles size={14} />
          {advise.pending ? 'Thinking it over…' : advice === null ? 'What should I do about it?' : 'Ask again'}
        </Button>
        <span className={styles.footnote}>
          The findings above are measured. Pressing this asks the model on your computer to turn them into things to do.
        </span>
      </div>

      {advise.error !== null && (
        <Banner kind="warning" title="The model could not answer">
          {advise.error}
        </Banner>
      )}

      {advice !== null && (
        <div className={styles.advice}>
          {advice.headline !== '' && (
            <div className={styles.adviceHead}>
              <Lightbulb size={16} />
              <span>{advice.headline}</span>
            </div>
          )}
          {advice.recommendations.map((item) => (
            <Recommendation key={item.action} item={item} findings={usable} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One recommendation, with a button only when it carries a change ShortStack can actually make and
 * that would actually change something. The button says what it will do before it does it: nobody
 * should have to trust a sentence to know what pressing it means.
 */
function Recommendation({ item, findings }: { item: AdviceItemDTO; findings: readonly Fact[] }): React.JSX.Element {
  const change = item.change;
  const preview = useApiQuery(
    (): Promise<Result<SettingChange | null>> =>
      change === undefined
        ? Promise.resolve({ ok: true, data: null })
        : window.api.actionPreview(change),
    { key: `preview:${JSON.stringify(change ?? null)}` }
  );
  const apply = useApiMutation(() => window.api.actionApply(change as NonNullable<typeof change>), {
    onDone: preview.refresh
  });

  const proposed = preview.data;

  return (
    <div className={styles.recommendation}>
      <div className={styles.action}>{item.action}</div>
      {/* The finding itself, word for word. Asked to restate one, the model produced a single
          percentage and put it on three unrelated recommendations. */}
      <div className={styles.because}>{findings.find((fact) => fact.id === item.basedOn)?.statement ?? ""}</div>

      {apply.data !== null ? (
        <div className={styles.applied}>Done — {describeChange(apply.data)}</div>
      ) : (
        proposed !== null &&
        proposed !== undefined && (
          <div className={styles.changeRow}>
            <code className={styles.diff}>{describeChange(proposed)}</code>
            <Button size="small" disabled={apply.pending} onClick={() => void apply.run()}>
              {apply.pending ? 'Changing…' : 'Make this change'}
            </Button>
          </div>
        )
      )}
      {apply.error !== null && <div className={styles.because}>{apply.error}</div>}
    </div>
  );
}

/** A weak finding is marked as one: acting on three videos is a different decision from thirty. */
function Finding({ fact }: { fact: Fact }): React.JSX.Element {
  return (
    <li className={styles.finding}>
      <span>{fact.statement}</span>
      {fact.confidence === 'weak' && <span className={styles.weak}>few videos</span>}
    </li>
  );
}
