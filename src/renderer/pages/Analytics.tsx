import React, { useEffect, useState } from 'react';
import { ChartColumn, RotateCw } from 'lucide-react';
import type { ChannelAnalytics } from '../../shared/analytics';
import {
  REFRESH_MINUTE_CHOICES,
  maxAgeFor,
  pulledAgo,
  type MaxAge,
  type PullReason,
  type Pulled
} from '../../shared/analyticsRefresh';
import { areaPath, linePath, niceMax, plotPoints } from '../../shared/chart';
import type { Result } from '../../shared/ipc';
import { PageHeader } from '../components/PageHeader';
import { Banner, Button, EmptyState, FilterChips, Skeleton } from '../components/ui';
import { useAppStatus } from '../app/status';
import { useApiQuery } from '../hooks/useApi';
import { Insights } from './analytics/Insights';
import { AudienceSection, CountriesSection, DepthKpis, ReachSection, SourcesSection, TopVideosSection } from './analytics/Sections';
import { useSettings } from './settings/useSettings';
import styles from './Analytics.module.css';

const RANGES = ['7', '28', '90'] as const;
type Range = (typeof RANGES)[number];

const CHART = { width: 720, height: 180, padding: 18 };
/**
 * How often an interval looks again while the page is open. Each look is answered from what is kept
 * until it is older than the interval, so looking every minute costs nothing until then.
 */
const REFRESH_TICK_MS = 60_000;

/** One look at the numbers: a new id makes the page ask again, with how old an answer may be. */
interface PullRequest {
  id: number;
  maxAge: MaxAge;
}

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

/** When the numbers were pulled, when they will be pulled again, and a button to pull them now. */
function RefreshControls({
  pulledAt,
  fetching,
  onRefresh
}: {
  pulledAt: string | null;
  fetching: boolean;
  onRefresh: () => void;
}): React.JSX.Element | null {
  const writer = useSettings();
  const settings = writer.settings;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (settings === null) return null;

  const minutes = settings.analytics_refresh_minutes;
  const minuteChoices = REFRESH_MINUTE_CHOICES.includes(minutes)
    ? REFRESH_MINUTE_CHOICES
    : [...REFRESH_MINUTE_CHOICES, minutes].sort((a, b) => a - b);
  const choice = settings.analytics_refresh === 'interval' ? String(minutes) : settings.analytics_refresh;
  const choose = (value: string): void => {
    if (value === 'manual' || value === 'on_open') writer.set('analytics_refresh', value);
    else void writer.setSequence([['analytics_refresh', 'interval'], ['analytics_refresh_minutes', Number(value)]]);
  };

  return (
    <div className={styles.pullBar}>
      <span className={styles.pulledAt}>
        {fetching ? 'Pulling from YouTube…' : pulledAt === null ? 'Not pulled yet' : `Updated ${pulledAgo(pulledAt, now)}`}
      </span>
      <select className={styles.refreshChoice} aria-label="When to refresh" value={choice} onChange={(event) => choose(event.target.value)}>
        <option value="manual">Only when I press Refresh</option>
        {minuteChoices.map((each) => (
          <option key={each} value={String(each)}>
            Every {each} minutes
          </option>
        ))}
        <option value="on_open">Every time I open Analytics</option>
      </select>
      <Button size="small" icon={<RotateCw size={14} aria-hidden />} disabled={fetching} onClick={onRefresh}>
        Refresh
      </Button>
    </div>
  );
}

export function Analytics(): React.JSX.Element {
  const { auth, settings } = useAppStatus();
  const [range, setRange] = useState<Range>('28');
  const [pull, setPull] = useState<PullRequest | null>(null);
  const mode = settings?.analytics_refresh;
  const minutes = settings?.analytics_refresh_minutes;
  const settingsReady = settings !== null;

  const ask = (reason: PullReason): void => {
    if (mode === undefined || minutes === undefined) return;
    const maxAge = maxAgeFor(mode, minutes, reason);
    setPull((current) => ({ id: (current?.id ?? 0) + 1, maxAge }));
  };

  // The first look waits for the settings, because they decide whether opening the page asks YouTube at all.
  useEffect(() => {
    if (settingsReady && pull === null) ask('open');
  }, [settingsReady]);

  useEffect(() => {
    if (mode !== 'interval' || !settingsReady) return;
    const timer = window.setInterval(() => ask('tick'), REFRESH_TICK_MS);
    return () => window.clearInterval(timer);
  }, [mode, minutes, settingsReady]);

  const connected = auth?.state === 'ok';
  const analytics = useApiQuery(
    (): Promise<Result<Pulled<ChannelAnalytics> | null>> => window.api.analyticsGet(Number(range), pull?.maxAge ?? null),
    { key: `analytics:${range}:${pull?.id ?? 0}`, enabled: connected && pull !== null }
  );

  const pulled = analytics.data;
  const data = pulled?.value ?? null;
  const hours = data === null ? 0 : data.totals.minutesWatched / 60;
  const net = data?.totals.netSubscribers ?? 0;
  const notPulled = pull !== null && pulled === null && !analytics.fetching && analytics.error === null;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How your channel has been doing"
        actions={
          connected ? (
            <RefreshControls pulledAt={pulled?.pulledAt ?? null} fetching={analytics.fetching} onRefresh={() => ask('button')} />
          ) : undefined
        }
      />

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
              onSelect={(next) => {
                setRange(next);
                ask('range');
              }}
              label="Time range"
            />
          </div>

          {analytics.error !== null && (
            <Banner
              kind="warning"
              title="Could not read your analytics"
              actions={
                <Button size="small" onClick={() => ask('button')}>
                  Try again
                </Button>
              }
            >
              {analytics.error}
            </Banner>
          )}

          {analytics.fetching && data === null && <Skeleton height={120} radius="var(--radius)" />}

          {notPulled && (
            <EmptyState
              icon={<ChartColumn size={24} />}
              title="Not pulled yet"
              action={
                <Button variant="primary" icon={<RotateCw size={14} aria-hidden />} onClick={() => ask('button')}>
                  Pull analytics now
                </Button>
              }
            >
              Analytics is set to ask YouTube only when you say so, and nothing has been pulled since ShortStack started.
            </EmptyState>
          )}

          {data !== null && pull !== null && (
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

              <DepthKpis data={data} />
              <Insights days={Number(range)} pullId={pull.id} maxAge={pull.maxAge} />
              <ReachSection data={data} />
              <TopVideosSection videos={data.topVideos} />
              <div className={styles.columns}>
                <SourcesSection sources={data.trafficSources} />
                <CountriesSection countries={data.countries} />
              </div>
              <AudienceSection data={data} />
            </>
          )}
        </>
      )}
    </>
  );
}
