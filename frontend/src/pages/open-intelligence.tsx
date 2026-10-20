import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { RefreshCw } from 'lucide-react';
import { getCommonStaticProps } from '../lib/i18n-static-props';

interface Snapshot {
  observed_at: string;
  source_status: 'fetched' | 'not_modified';
  data: {
    url: string;
    license_spdx: string | null;
    archived: boolean;
    stars: number;
    forks: number;
    open_issues: number;
    default_branch: string;
    pushed_at: string | null;
  };
}

interface RepositoryEntry {
  repository: string;
  snapshot_count: number;
  latest: Snapshot | null;
  change: {
    stars_delta: number;
    forks_delta: number;
    open_issues_delta: number;
  } | null;
  history: Snapshot[];
}

interface EcosystemDataset {
  generated_at: string;
  source: {
    name: string;
    url: string;
    attribution: string;
    collection: string;
    rate_limit: string;
    data_policy: string;
  };
  research: {
    question: string;
    status: 'awaiting_first_collection' | 'baseline' | 'observed';
    tracked_repositories: number;
    repositories_with_data: number;
    pushed_within_7_days: number;
    limitations: string[];
  };
  update_status: {
    attempted_at?: string;
    complete?: boolean;
    sources?: Array<{
      repository: string;
      status: string;
      error?: string;
    }>;
  } | null;
  repositories: RepositoryEntry[];
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function Delta({ value }: { value: number }) {
  const color = value > 0 ? '#86efac' : value < 0 ? '#fca5a5' : '#9ca3af';
  const sign = value > 0 ? '+' : '';
  return <span style={{ color }}>{sign}{value}</span>;
}

export default function OpenIntelligencePage() {
  const { t } = useTranslation('common');
  const { locale: routeLocale } = useRouter();
  const [dataset, setDataset] = useState<EcosystemDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDataset = useCallback(async () => {
    const response = await fetch('/api/v1/open-intelligence/ecosystem?limit=30', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as EcosystemDataset;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDataset(await fetchDataset());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('oi_load_error', 'Unable to load the dataset'));
    } finally {
      setLoading(false);
    }
  }, [fetchDataset, t]);

  useEffect(() => {
    let active = true;
    void fetchDataset()
      .then(data => { if (active) setDataset(data); })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : t('oi_load_error', 'Unable to load the dataset'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchDataset, t]);

  const locale = routeLocale === 'ru' ? 'ru-RU' : 'en-US';
  const number = (value: number) => formatNumber(value, locale);
  const date = (value: string | null) => formatDate(value, locale);
  const status = dataset?.research.status;

  return (
    <main style={{ minHeight: '100vh', padding: '88px 20px 48px', color: '#f9fafb', background: '#030014' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}>
          <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
            {t('oi_eyebrow', 'GSTD Open Intelligence')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, margin: '8px 0' }}>
                {t('oi_title', 'Ecosystem activity')}
              </h1>
              <p style={{ color: '#9ca3af', maxWidth: 760, margin: 0 }}>
                {t('oi_question', 'A transparent daily view of public repository metadata — not a measure of network usage or project quality.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                color: '#f9fafb', background: '#ffffff12', border: '1px solid #ffffff22',
                borderRadius: 10, cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={15} />
              {loading ? t('oi_loading', 'Loading…') : t('oi_refresh', 'Refresh data')}
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" style={{ padding: 16, marginBottom: 20, border: '1px solid #7f1d1d', borderRadius: 12, color: '#fecaca', background: '#450a0a55' }}>
            {t('oi_load_error', 'Unable to load the dataset')}: {error}
          </div>
        )}

        {dataset && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                [t('oi_repositories', 'Tracked repositories'), `${dataset.research.repositories_with_data}/${dataset.research.tracked_repositories}`],
                [t('oi_recent_updates', 'Pushed in last 7 days'), number(dataset.research.pushed_within_7_days)],
                [t('oi_research_status', 'Evidence status'), t(`oi_status_${status}`, status === 'baseline' ? 'Baseline' : status === 'observed' ? 'Observed' : 'Awaiting first collection')],
                [t('oi_generated_at', 'Dataset generated'), date(dataset.generated_at)],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 18, border: '1px solid #ffffff12', borderRadius: 14, background: '#ffffff08' }}>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </section>

            {status === 'baseline' && (
              <p style={{ padding: 14, borderRadius: 10, color: '#fde68a', background: '#78350f33', border: '1px solid #f59e0b33' }}>
                {t('oi_baseline_notice', 'This is a baseline snapshot. Trend comparisons will be available after a later daily observation.')}
              </p>
            )}

            {dataset.update_status && (
              <section aria-live="polite" style={{ padding: 16, margin: '18px 0', border: `1px solid ${dataset.update_status.complete ? '#166534' : '#92400e'}`, borderRadius: 12, background: dataset.update_status.complete ? '#052e1622' : '#451a0322' }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>
                  {t('oi_collection_status', 'Latest collection')}
                  {' · '}
                  {dataset.update_status.complete
                    ? t('oi_collection_complete', 'All sources collected')
                    : t('oi_collection_partial', 'Some sources unavailable')}
                </h2>
                <div style={{ display: 'grid', gap: 6, color: '#d1d5db', fontSize: 12 }}>
                  {dataset.update_status.sources?.map((source) => (
                    <div key={source.repository}>
                      <strong>gstdcoin/{source.repository}</strong>
                      {' · '}{t(`oi_source_status_${source.status}`, source.status)}
                      {source.error && <span style={{ color: '#fca5a5' }}> — {source.error}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {dataset.repositories.map((entry) => {
              const snapshot = entry.latest;
              return (
                <section key={entry.repository} style={{ margin: '18px 0', padding: 20, border: '1px solid #ffffff12', borderRadius: 16, background: '#ffffff06' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 20 }}>
                      {snapshot
                        ? <a href={snapshot.data.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fbbf24', textDecoration: 'none' }}>gstdcoin/{entry.repository}</a>
                        : `gstdcoin/${entry.repository}`}
                    </h2>
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>
                      {snapshot
                        ? `${t('oi_observed_at', 'Observed')} ${date(snapshot.observed_at)} · ${snapshot.source_status === 'not_modified' ? t('oi_unchanged_source', 'Source unchanged') : t('oi_fetched_source', 'Fetched from source')}`
                        : t('oi_waiting', 'Waiting for first collection')}
                    </span>
                  </div>
                  {snapshot ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 18 }}>
                        {[
                          [t('oi_stars', 'Stars'), snapshot.data.stars, entry.change?.stars_delta],
                          [t('oi_forks', 'Forks'), snapshot.data.forks, entry.change?.forks_delta],
                          [t('oi_open_issues', 'Open issues'), snapshot.data.open_issues, entry.change?.open_issues_delta],
                        ].map(([label, value, delta]) => (
                          <div key={String(label)} style={{ padding: 12, borderRadius: 10, background: '#00000030' }}>
                            <div style={{ color: '#9ca3af', fontSize: 11 }}>{label}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                              {number(Number(value))}
                              {typeof delta === 'number' && entry.history.length > 1 && <small style={{ marginLeft: 8, fontSize: 12 }}><Delta value={delta} /></small>}
                            </div>
                          </div>
                        ))}
                        <div style={{ padding: 12, borderRadius: 10, background: '#00000030' }}>
                          <div style={{ color: '#9ca3af', fontSize: 11 }}>{t('oi_last_push', 'Last pushed')}</div>
                          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{date(snapshot.data.pushed_at)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 14, color: '#9ca3af', fontSize: 12 }}>
                        {t('oi_branch', 'Default branch')}: <code>{snapshot.data.default_branch}</code>
                        {' · '}{t('oi_license', 'License')}: {snapshot.data.license_spdx || t('oi_unspecified', 'not specified')}
                        {snapshot.data.archived && ` · ${t('oi_archived', 'Archived')}`}
                        {' · '}{number(entry.snapshot_count)} {t('oi_observations', 'daily observations')}
                      </div>
                      {entry.history.length > 1 && (
                        <details style={{ marginTop: 14, color: '#d1d5db' }}>
                          <summary style={{ cursor: 'pointer', fontSize: 13 }}>{t('oi_history', 'Observation history')}</summary>
                          <div style={{ overflowX: 'auto', marginTop: 10 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                              <thead>
                                <tr style={{ color: '#9ca3af' }}>
                                  {[t('oi_observed_at', 'Observed'), t('oi_stars', 'Stars'), t('oi_forks', 'Forks'), t('oi_open_issues', 'Open issues')].map((label) => (
                                    <th key={label} style={{ padding: '8px 10px', borderBottom: '1px solid #ffffff18' }}>{label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {entry.history.slice(-7).reverse().map((point) => (
                                  <tr key={point.observed_at}>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #ffffff0c' }}>{date(point.observed_at)}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #ffffff0c' }}>{number(point.data.stars)}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #ffffff0c' }}>{number(point.data.forks)}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #ffffff0c' }}>{number(point.data.open_issues)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <p style={{ color: '#9ca3af', marginBottom: 0 }}>{t('oi_no_snapshot', 'No verified snapshot is available yet.')}</p>
                  )}
                </section>
              );
            })}

            <section style={{ marginTop: 28, padding: 20, border: '1px solid #ffffff12', borderRadius: 16 }}>
              <h2 style={{ marginTop: 0 }}>{t('oi_methodology', 'Source and methodology')}</h2>
              <p style={{ color: '#d1d5db' }}>{dataset.source.attribution}</p>
              <p style={{ color: '#9ca3af', fontSize: 13 }}>{dataset.source.collection}</p>
              <p style={{ color: '#9ca3af', fontSize: 13 }}>{dataset.source.rate_limit}</p>
              <p style={{ color: '#9ca3af', fontSize: 13 }}>{dataset.source.data_policy}</p>
              <ul style={{ color: '#9ca3af', paddingLeft: 20 }}>
                {dataset.research.limitations.map((limitation) => <li key={limitation} style={{ marginTop: 6 }}>{limitation}</li>)}
              </ul>
              <a href={dataset.source.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fbbf24' }}>
                {t('oi_source_docs', 'GitHub API source documentation')}
              </a>
            </section>
          </>
        )}

        {!dataset && !loading && !error && (
          <p style={{ color: '#9ca3af' }}>{t('oi_empty', 'No dataset has been published yet.')}</p>
        )}
      </div>
    </main>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
