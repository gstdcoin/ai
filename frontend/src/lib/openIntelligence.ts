import { kvDel, kvGet, kvSet, kvSetNX } from './kv';

export const OPEN_INTELLIGENCE_DATASET = 'gstd-ecosystem-repository-activity';
export const OPEN_INTELLIGENCE_ALGORITHM = 'github-atom-commit-observation-v1';
export const OPEN_INTELLIGENCE_HISTORY_LIMIT = 180;
export const OPEN_INTELLIGENCE_REPOSITORIES = [
    'ai',
    'gstdbot',
    'A2A',
    'web',
] as const;

const OWNER = 'gstdcoin';
const SOURCE_BASE = 'https://github.com';
const STATE_PREFIX = 'open-intelligence:github:v2:';
const STATUS_KEY = 'open-intelligence:github:status:v2';
const LOCK_KEY = 'open-intelligence:github:harvest-lock:v2';
const ATTEMPT_KEY_PREFIX = 'open-intelligence:github:attempt:v2:';
const MAX_RESPONSE_BYTES = 256 * 1024;
const LOCK_TTL_SECONDS = 600;
const ATTEMPT_TTL_SECONDS = 2 * 86_400;
const SOURCE_REQUEST_GAP_MS = 1_000;
const COMMIT_FEED_LIMIT = 20;
const DEFAULT_BRANCHES: Record<TrackedRepository, string> = {
    ai: 'main',
    gstdbot: 'main',
    A2A: 'master',
    web: 'main',
};

export type TrackedRepository = typeof OPEN_INTELLIGENCE_REPOSITORIES[number];

export interface RepositoryMetadata {
    name: string;
    url: string;
    default_branch: string;
    commits: Array<{ id: string; committed_at: string }>;
    latest_commit_id: string | null;
    latest_commit_at: string | null;
    new_commits: number | null;
    new_commits_is_lower_bound: boolean;
}

export interface RepositorySnapshot {
    observed_at: string;
    source_url: string;
    source_status: 'fetched' | 'not_modified';
    schema_version: 2;
    quality: {
        valid: true;
        warnings: string[];
    };
    data: RepositoryMetadata;
}

interface RepositoryState {
    schema_version: 2;
    etag: string | null;
    snapshots: RepositorySnapshot[];
}

export interface RepositoryChange {
    repository: TrackedRepository;
    from: string;
    to: string;
    latest_commit_changed: boolean;
    new_commits: number | null;
}

export interface HarvestSourceResult {
    repository: TrackedRepository;
    status: 'updated' | 'not_modified' | 'skipped_today' | 'skipped_after_attempt' | 'error';
    observed_at?: string;
    error?: string;
}

function stateKey(repository: TrackedRepository): string {
    return `${STATE_PREFIX}${repository}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDateTime(value: unknown): value is string {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseState(raw: string | null): RepositoryState {
    if (!raw) return { schema_version: 2, etag: null, snapshots: [] };
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            !isRecord(parsed)
            || parsed.schema_version !== 2
            || !Array.isArray(parsed.snapshots)
            || (parsed.etag !== null && typeof parsed.etag !== 'string')
        ) {
            throw new Error('stored repository state has an unsupported schema');
        }
        return parsed as unknown as RepositoryState;
    } catch (error) {
        throw new Error(
            `could not read stored GitHub history: ${error instanceof Error ? error.message : 'invalid JSON'}`,
        );
    }
}

export function normalizeCommitFeed(
    repository: TrackedRepository,
    value: string,
): RepositoryMetadata {
    if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_RESPONSE_BYTES) {
        throw new Error('GitHub Atom feed exceeded the size limit');
    }
    if (!/<feed(?:\s|>)/.test(value) || /<!DOCTYPE|<!ENTITY/i.test(value)) {
        throw new Error('GitHub response was not a safe Atom feed');
    }
    const branch = DEFAULT_BRANCHES[repository];
    const feedId = value.match(/<feed(?:\s[^>]*)?>[\s\S]*?<id>([^<]+)<\/id>/)?.[1]?.trim();
    if (feedId !== `tag:github.com,2008:/${OWNER}/${repository}/commits/${branch}`) {
        throw new Error('GitHub Atom feed repository identity did not match');
    }
    const commits: RepositoryMetadata['commits'] = [];
    for (const entry of value.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
        const id = entry[1].match(/<id>([^<]+)<\/id>/)?.[1]?.trim();
        const committedAt = entry[1].match(/<updated>([^<]+)<\/updated>/)?.[1]?.trim();
        const commitId = id?.match(/^tag:github\.com,2008:Grit::Commit\/([0-9a-f]{40,64})$/i)?.[1];
        if (!commitId || !isDateTime(committedAt)) {
            throw new Error('GitHub Atom feed entry failed commit metadata validation');
        }
        if (!commits.some(commit => commit.id === commitId)) {
            commits.push({ id: commitId.toLowerCase(), committed_at: committedAt });
        }
        if (commits.length >= COMMIT_FEED_LIMIT) break;
    }
    commits.sort((a, b) => Date.parse(b.committed_at) - Date.parse(a.committed_at));
    const latest = commits[0];
    return {
        name: `${OWNER}/${repository}`,
        url: `https://github.com/${OWNER}/${repository}`,
        default_branch: branch,
        commits,
        latest_commit_id: latest?.id ?? null,
        latest_commit_at: latest?.committed_at ?? null,
        new_commits: null,
        new_commits_is_lower_bound: false,
    };
}

export function appendDailySnapshot(
    snapshots: RepositorySnapshot[],
    snapshot: RepositorySnapshot,
): RepositorySnapshot[] {
    const day = snapshot.observed_at.slice(0, 10);
    const next = snapshots.filter(item => item.observed_at.slice(0, 10) !== day);
    next.push(snapshot);
    next.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    return next.slice(-OPEN_INTELLIGENCE_HISTORY_LIMIT);
}

export function deriveRepositoryChange(
    repository: TrackedRepository,
    previous: RepositorySnapshot | undefined,
    latest: RepositorySnapshot | undefined,
): RepositoryChange | null {
    if (!previous || !latest) return null;
    return {
        repository,
        from: previous.observed_at,
        to: latest.observed_at,
        latest_commit_changed: previous.data.latest_commit_id !== latest.data.latest_commit_id,
        new_commits: latest.data.new_commits,
    };
}

function emptyChange(
    repository: TrackedRepository,
    latest: RepositorySnapshot,
): RepositoryChange {
    return {
        repository,
        from: latest.observed_at,
        to: latest.observed_at,
        latest_commit_changed: false,
        new_commits: latest.data.new_commits,
    };
}

async function fetchRepository(
    repository: TrackedRepository,
    now: number,
): Promise<HarvestSourceResult> {
    const state = parseState(await kvGet(stateKey(repository)));
    const observedAt = new Date(now).toISOString();
    const today = observedAt.slice(0, 10);
    const latest = state.snapshots[state.snapshots.length - 1];
    if (latest?.observed_at.slice(0, 10) === today) {
        return { repository, status: 'skipped_today', observed_at: latest.observed_at };
    }
    if (!(await kvSetNX(
        `${ATTEMPT_KEY_PREFIX}${today}:${repository}`,
        observedAt,
        ATTEMPT_TTL_SECONDS,
    ))) {
        return {
            repository,
            status: 'skipped_after_attempt',
            error: 'A source request was already attempted today; retry after the next UTC day',
        };
    }

    const headers: Record<string, string> = {
        Accept: 'application/atom+xml',
        'User-Agent': 'GSTD-Open-Intelligence (+https://app.gstdtoken.com)',
    };
    if (state.etag) headers['If-None-Match'] = state.etag;

    const sourceUrl = `${SOURCE_BASE}/${OWNER}/${repository}/commits/${DEFAULT_BRANCHES[repository]}.atom`;
    const response = await fetch(sourceUrl, {
        headers,
        signal: AbortSignal.timeout(8_000),
    });

    let snapshot: RepositorySnapshot;
    let etag = response.headers.get('etag') || state.etag;
    if (response.status === 304) {
        if (!latest) throw new Error('GitHub returned 304 without a stored baseline');
        snapshot = {
            ...latest,
            observed_at: observedAt,
            source_status: 'not_modified',
            data: {
                ...latest.data,
                new_commits: latest.data.latest_commit_id ? 0 : null,
                new_commits_is_lower_bound: false,
            },
        };
    } else {
        if (!response.ok) {
            const remaining = response.headers.get('x-ratelimit-remaining');
            const retryAfter = response.headers.get('retry-after');
            if (response.status === 429 || remaining === '0' || retryAfter) {
                throw new Error(
                    `GitHub source rate limited (HTTP ${response.status}; remaining ${remaining ?? 'unknown'}; retry after ${retryAfter ?? 'unknown'})`,
                );
            }
            throw new Error(`GitHub source returned HTTP ${response.status}`);
        }
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_RESPONSE_BYTES) {
            throw new Error('GitHub Atom feed exceeded the size limit');
        }
        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
            throw new Error('GitHub Atom feed exceeded the size limit');
        }
        const metadata = normalizeCommitFeed(repository, body);
        const previousCommitIds = new Set(latest?.data.commits.map(commit => commit.id) || []);
        const newCommits = latest
            ? metadata.commits.filter(commit => !previousCommitIds.has(commit.id)).length
            : null;
        const overlapsPreviousFeed = metadata.commits.some(commit => previousCommitIds.has(commit.id));
        snapshot = {
            observed_at: observedAt,
            source_url: sourceUrl,
            source_status: 'fetched',
            schema_version: 2,
            quality: { valid: true, warnings: [] },
            data: {
                ...metadata,
                new_commits: newCommits,
                new_commits_is_lower_bound: Boolean(
                    latest && previousCommitIds.size > 0 && metadata.commits.length > 0 && !overlapsPreviousFeed,
                ),
            },
        };
        etag = response.headers.get('etag');
    }

    const snapshots = appendDailySnapshot(state.snapshots, snapshot);
    await kvSet(stateKey(repository), JSON.stringify({
        schema_version: 2,
        etag,
        snapshots,
    } satisfies RepositoryState));
    return {
        repository,
        status: snapshot.source_status === 'not_modified' ? 'not_modified' : 'updated',
        observed_at: observedAt,
    };
}

export async function harvestGithubEcosystem(now = Date.now()): Promise<{
    ok: boolean;
    acquired: boolean;
    attempted_at: string;
    sources: HarvestSourceResult[];
}> {
    const attemptedAt = new Date(now).toISOString();
    if (!(await kvSetNX(LOCK_KEY, attemptedAt, LOCK_TTL_SECONDS))) {
        return { ok: false, acquired: false, attempted_at: attemptedAt, sources: [] };
    }

    try {
        const sources: HarvestSourceResult[] = [];
        let previousRequestWasSent = false;
        for (const [index, repository] of OPEN_INTELLIGENCE_REPOSITORIES.entries()) {
            if (index > 0 && previousRequestWasSent) {
                await new Promise(resolve => setTimeout(resolve, SOURCE_REQUEST_GAP_MS));
            }
            try {
                const source = await fetchRepository(repository, now);
                sources.push(source);
                previousRequestWasSent = ['updated', 'not_modified', 'error'].includes(source.status);
            } catch (error) {
                sources.push({
                    repository,
                    status: 'error' as const,
                    error: error instanceof Error ? error.message.slice(0, 160) : 'unknown source error',
                });
                previousRequestWasSent = true;
            }
        }
        const succeeded = sources.filter(source =>
            source.status === 'updated' || source.status === 'not_modified' || source.status === 'skipped_today',
        ).length;
        const status = {
            schema_version: 2,
            attempted_at: attemptedAt,
            source_count: sources.length,
            succeeded,
            complete: succeeded === sources.length,
            sources,
        };
        await kvSet(STATUS_KEY, JSON.stringify(status), 30 * 86_400);
        return {
            ok: succeeded > 0,
            acquired: true,
            attempted_at: attemptedAt,
            sources,
        };
    } finally {
        await kvDel(LOCK_KEY);
    }
}

export async function getGithubEcosystemDataset(limit = 30, now = Date.now()) {
    const historyLimit = Math.max(1, Math.min(OPEN_INTELLIGENCE_HISTORY_LIMIT, Math.floor(limit) || 30));
    const states = await Promise.all(OPEN_INTELLIGENCE_REPOSITORIES.map(async repository => ({
        repository,
        ...parseState(await kvGet(stateKey(repository))),
    })));
    const repositories = states.map(({ repository, snapshots }) => {
        const history = snapshots.slice(-historyLimit);
        const latest = history[history.length - 1] || null;
        const previous = history.length > 1 ? history[history.length - 2] : undefined;
        const change = latest
            ? deriveRepositoryChange(repository, previous, latest) || emptyChange(repository, latest)
            : null;
        return {
            repository,
            snapshot_count: snapshots.length,
            first_seen_at: snapshots[0]?.observed_at || null,
            latest,
            change,
            history,
        };
    });
    const latest = repositories.flatMap(entry => entry.latest ? [entry.latest] : []);
    const recentCommitRepositories = latest.filter(snapshot => {
        const committedAt = snapshot.data.latest_commit_at ? Date.parse(snapshot.data.latest_commit_at) : NaN;
        return Number.isFinite(committedAt) && now >= committedAt && now - committedAt <= 7 * 86_400_000;
    }).length;
    const statusRaw = await kvGet(STATUS_KEY);
    let updateStatus: unknown = null;
    if (statusRaw) {
        try {
            updateStatus = JSON.parse(statusRaw);
        } catch {
            updateStatus = { error: 'Stored update status is invalid' };
        }
    }

    return {
        dataset: OPEN_INTELLIGENCE_DATASET,
        schema_version: 2,
        algorithm_version: OPEN_INTELLIGENCE_ALGORITHM,
        generated_at: new Date(now).toISOString(),
        source: {
            id: 'github-atom-commit-feed',
            name: 'GitHub Atom commit feeds',
            url: 'https://github.com/gstdcoin/ai/commits/main.atom',
            attribution: 'Commit timestamps and identifiers are derived from GitHub public Atom feeds; each repository links to its canonical GitHub page.',
            collection: 'Unauthenticated conditional GET, at most once per repository per UTC day; ETag used when available. At most the 20 newest feed entries are observed per repository.',
            data_policy: 'Only canonical repository URL, configured branch, commit identifiers, and commit timestamps are retained. Commit messages, authors, source code, and raw feed content are not stored.',
            rate_limit: 'GitHub does not publish a fixed Atom feed request quota. Collection is capped at four requests per UTC day across the tracked repositories.',
        },
        research: {
            question: 'What recent commit activity is visible in the GSTD ecosystem repositories?',
            status: latest.length === 0
                ? 'awaiting_first_collection'
                : repositories.some(entry => entry.snapshot_count < 2) ? 'baseline' : 'observed',
            method: 'Compare the newest 20 commit identifiers in each daily Atom feed with the previous observation; count distinct newly visible commits and track the latest commit timestamp.',
            tracked_repositories: OPEN_INTELLIGENCE_REPOSITORIES.length,
            repositories_with_data: latest.length,
            repositories_with_commit_in_7_days: recentCommitRepositories,
            limitations: [
                'The feed exposes only its newest 20 entries; when observations do not overlap, the new-commit count is reported as a lower bound.',
                'Commit activity is not a measure of code quality, user demand, project health, or production activity.',
                'A first snapshot is only a baseline. Trend comparisons require at least two observations.',
                'GitHub is the sole source; default branches are configured in this collector and have not been independently verified.',
            ],
        },
        update_status: updateStatus,
        repositories,
    };
}
