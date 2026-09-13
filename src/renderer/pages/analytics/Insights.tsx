import React from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import type { Brief, Fact } from '../../../shared/insights';
import type { ChannelAdvice, Result } from '../../../shared/ipc';
import { Banner, Button, Skeleton } from '../../components/ui';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import styles from '../Analytics.module.css';

/**
 * Two halves, deliberately in this order. What was measured comes first and is always shown; the
 * model's reading of it comes second and only when asked for. Someone who never presses the button
 * still gets everything that is true — the findings are the product, the advice is a convenience.
 */
export function Insights({ days }: { days: number }): React.JSX.Element {
  const brief = useApiQuery((): Promise<Result<Brief>> => window.api.insightsGet(days), { key: `insights:${days}` });
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
            <div key={item.action} className={styles.recommendation}>
              <div className={styles.action}>{item.action}</div>
              <div className={styles.because}>{item.because}</div>
            </div>
          ))}
        </div>
      )}
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
