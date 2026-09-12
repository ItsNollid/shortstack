import React, { useState } from 'react';
import { ChartColumn } from 'lucide-react';
import type { ChannelAnalytics } from '../../shared/analytics';
import { areaPath, linePath, niceMax, plotPoints } from '../../shared/chart';
import type { Result } from '../../shared/ipc';
import { PageHeader } from '../components/PageHeader';
import { Banner, Button, EmptyState, FilterChips, Skeleton } from '../components/ui';
import { useAppStatus } from '../app/status';
import { useApiQuery } from '../hooks/useApi';
import styles from './Analytics.module.css';

const RANGES = ['7', '28', '90'] as const;
type Range = (typeof RANGES)[number];

const CHART = { width: 720, height: 180, padding: 18 };

const whole = (value: number): string => Math.round(value).toLocaleString();

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'up' | 'down' }): React.JSX.Element {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={`${styles.kpiValue} ${tone === undefined ? '' : styles[tone]}`}>{value}</div>
      {note !== undefined && <div className={styles.kpiNote}>{note}</div>}
    </div>
  );
}

function ViewsChart({ data }: { data: ChannelAnalytics }): React.JSX.Element {
  const values = data.days.map((day) => day.views);
  const max = niceMax(values);
  const points = plotPoints(values, CHART, max);
  const baseline = CHART.height - CHART.padding;
  const first = data.days[0]?.date ?? data.startDate;
  const last = data.days[data.days.length - 1]?.date ?? data.endDate;

  return (
    <svg className={styles.chart} viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" role="img"
      aria-label={`Views per day, ${whole(Math.max(...values, 0))} at the highest`}>
      <line className={styles.grid} x1="0" y1={baseline} x2={CHART.width} y2={baseline} />
      <line className={styles.grid} x1="0" y1="0" x2={CHART.width} y2="0" />
      <path className={styles.area} d={areaPath(points, baseline)} />
      <path className={styles.line} d={linePath(points)} vectorEffect="non-scaling-stroke" />
      <text className={styles.axis} x="0" y={CHART.height - 4}>
        {first}
      </text>
      <text className={styles.axis} x={CHART.width} y={CHART.height - 4} textAnchor="end">
        {last}
      </text>
      <text className={styles.axis} x="0" y="12">
        {whole(max)}
      </text>
    </svg>
  );
}

export function Analytics(): React.JSX.Element {
  const { auth } = useAppStatus();
  const [range, setRange] = useState<Range>('28');
  const analytics = useApiQuery(
    (): Promise<Result<ChannelAnalytics>> => window.api.analyticsGet(Number(range)),
    { key: `analytics:${range}`, enabled: auth?.state === 'ok' }
  );

  const data = analytics.data;
  const hours = data === null ? 0 : data.totals.minutesWatched / 60;
  const net = data?.totals.netSubscribers ?? 0;

  return (
    <>
      <PageHeader title="Analytics" subtitle="How your channel has been doing" />

      {auth !== null && auth.state !== 'ok' ? (
        <EmptyState icon={<ChartColumn size={24} />} title="Not connected">
          Connect your channel in Settings to see how it is doing.
        </EmptyState>
      ) : (
        <>
          <div className={styles.filters}>
            <FilterChips
              chips={RANGES.map((id) => ({ id, label: `${id} days` }))}
              selected={range}
              onSelect={setRange}
              label="Time range"
            />
          </div>

          {analytics.error !== null && (
            <Banner
              kind="warning"
              title="Could not read your analytics"
              actions={
                <Button size="small" onClick={analytics.refresh}>
                  Try again
                </Button>
              }
            >
              {analytics.error}
            </Banner>
          )}

          {analytics.loading && <Skeleton height={120} radius="var(--radius)" />}

          {data !== null && (
            <>
              <div className={styles.kpis}>
                <Kpi label="Views" value={whole(data.totals.views)} />
                {/* Minutes are what the API returns; hours are what people think in. */}
                <Kpi label="Watch time" value={`${whole(hours)} h`} note={`${whole(data.totals.minutesWatched)} minutes`} />
                <Kpi label="Likes" value={whole(data.totals.likes)} />
                <Kpi
                  label="Subscribers"
                  value={`${net > 0 ? '+' : ''}${whole(net)}`}
                  note={`${whole(data.totals.subscribersGained)} joined, ${whole(data.totals.subscribersLost)} left`}
                  tone={net > 0 ? 'up' : net < 0 ? 'down' : undefined}
                />
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardTitle}>Views per day</span>
                  <span className={styles.range}>
                    {data.startDate} to {data.endDate}
                  </span>
                </div>
                {data.days.length === 0 ? (
                  <EmptyState title="Nothing to chart yet">
                    YouTube has not reported any days in this range. New channels and new videos can take
                    a day or two to appear.
                  </EmptyState>
                ) : (
                  <ViewsChart data={data} />
                )}
                {/* Attribution where YouTube data is shown, as the API Services terms require. */}
                <div className={styles.attribution}>
                  Figures from YouTube Analytics.
                  <button
                    type="button"
                    className={styles.attributionLink}
                    onClick={() => void window.api.openExternal('https://studio.youtube.com/channel/analytics')}
                  >
                    Open YouTube Studio
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
