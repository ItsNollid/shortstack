import React from 'react';
import type { ChannelAnalytics, NamedShare, TopVideo } from '../../../shared/analytics';
import { ageGroupName, countryName, duration, genderName, percentOf, trafficSourceName } from '../../../shared/analyticsCopy';
import { EmptyState } from '../../components/ui';
import styles from '../Analytics.module.css';

const whole = (value: number): string => Math.round(value).toLocaleString();
const oneDecimal = (value: number): string => `${value.toFixed(1)}%`;

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{title}</span>
        {note !== undefined && <span className={styles.range}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** A row of label, bar and number. Used for anything that is a share of a total. */
function Bars({ rows }: { rows: ReadonlyArray<{ label: string; value: number; note?: string }> }): React.JSX.Element {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className={styles.bars}>
      {rows.map((row) => (
        <div key={row.label} className={styles.barRow}>
          <span className={styles.barLabel} title={row.label}>
            {row.label}
          </span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${percentOf(row.value, total)}%` }} />
          </span>
          <span className={styles.barValue}>{row.note ?? whole(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The one that matters for a channel posting the same videos again to reach people who missed them:
 * it answers whether that is working, which nothing else on this page does.
 */
export function ReachSection({ data }: { data: ChannelAnalytics }): React.JSX.Element | null {
  const split = data.subscriberSplit;
  if (split === null) return null;

  const total = split.subscribedViews + split.unsubscribedViews;
  if (total === 0) {
    return (
      <Card title="Who watched">
        <EmptyState title="No views in this range yet">
          Once videos have views, this says how many came from people who had not subscribed.
        </EmptyState>
      </Card>
    );
  }

  const newShare = percentOf(split.unsubscribedViews, total);
  return (
    <Card title="Who watched" note={`${oneDecimal(newShare)} of views were from people who had not subscribed`}>
      <Bars
        rows={[
          { label: 'Not subscribed', value: split.unsubscribedViews, note: `${whole(split.unsubscribedViews)} views` },
          { label: 'Already subscribed', value: split.subscribedViews, note: `${whole(split.subscribedViews)} views` }
        ]}
      />
      <div className={styles.footnote}>
        They watched {oneDecimal(split.unsubscribedRetention)} of a video on average; subscribers watched{' '}
        {oneDecimal(split.subscribedRetention)}.
      </div>
    </Card>
  );
}

export function TopVideosSection({ videos }: { videos: TopVideo[] | null }): React.JSX.Element | null {
  if (videos === null) return null;
  if (videos.length === 0) {
    return (
      <Card title="Best performing">
        <EmptyState title="Nothing published in this range">
          Videos appear here once YouTube has reported views for them.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card title="Best performing" note="Worth putting back in rotation">
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Video</th>
              <th scope="col" className={styles.numeric}>
                Views
              </th>
              <th scope="col" className={styles.numeric}>
                Watched
              </th>
              <th scope="col" className={styles.numeric}>
                Likes
              </th>
              <th scope="col" className={styles.numeric}>
                Subs
              </th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.videoId}>
                <td>
                  <button
                    type="button"
                    className={styles.videoLink}
                    onClick={() => void window.api.openExternal(`https://www.youtube.com/watch?v=${video.videoId}`)}
                  >
                    {video.title ?? video.videoId}
                  </button>
                </td>
                <td className={styles.numeric}>{whole(video.views)}</td>
                <td className={styles.numeric}>{oneDecimal(video.averageViewPercentage)}</td>
                <td className={styles.numeric}>{whole(video.likes)}</td>
                <td className={styles.numeric}>{video.subscribersGained > 0 ? `+${whole(video.subscribersGained)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function SourcesSection({ sources }: { sources: NamedShare[] | null }): React.JSX.Element | null {
  if (sources === null || sources.length === 0) return null;
  return (
    <Card title="Where views came from">
      <Bars rows={sources.map((source) => ({ label: trafficSourceName(source.key), value: source.views }))} />
    </Card>
  );
}

export function CountriesSection({ countries }: { countries: NamedShare[] | null }): React.JSX.Element | null {
  if (countries === null || countries.length === 0) return null;
  return (
    <Card title="Where viewers are">
      <Bars rows={countries.map((country) => ({ label: countryName(country.key), value: country.views }))} />
    </Card>
  );
}

export function AudienceSection({ data }: { data: ChannelAnalytics }): React.JSX.Element | null {
  const slices = data.demographics;
  if (slices === null || slices.length === 0) return null;

  return (
    <Card title="Who your viewers are" note="Share of views by age and gender">
      <Bars
        rows={slices.slice(0, 8).map((slice) => ({
          label: `${genderName(slice.gender)}, ${ageGroupName(slice.ageGroup)}`,
          value: slice.viewerPercentage,
          note: oneDecimal(slice.viewerPercentage)
        }))}
      />
    </Card>
  );
}

/** Retention and the engagement counts, which the original page did not show at all. */
export function DepthKpis({ data }: { data: ChannelAnalytics }): React.JSX.Element {
  const { totals } = data;
  return (
    <div className={styles.kpis}>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Average view</div>
        <div className={styles.kpiValue}>{duration(totals.averageViewDuration)}</div>
        <div className={styles.kpiNote}>{oneDecimal(totals.averageViewPercentage)} of the video</div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Comments</div>
        <div className={styles.kpiValue}>{whole(totals.comments)}</div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Shares</div>
        <div className={styles.kpiValue}>{whole(totals.shares)}</div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Views per day</div>
        <div className={styles.kpiValue}>{whole(data.days.length === 0 ? 0 : totals.views / data.days.length)}</div>
        <div className={styles.kpiNote}>across {data.days.length} days</div>
      </div>
    </div>
  );
}
