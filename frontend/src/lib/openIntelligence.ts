import { kvDel, kvGet, kvSet, kvSetNX } from './kv';

export const OPEN_INTELLIGENCE_DATASET = 'gstd-ecosystem-repository-activity';
export const OPEN_INTELLIGENCE_ALGORITHM = 'github-repository-metadata-diff-v1';
export const OPEN_INTELLIGENCE_HISTORY_LIMIT = 180;
export const OPEN_INTELLIGENCE_REPOSITORIES = [
    'ai',
    'gstdbot',
    'A2A',
    'web',
] as const;

const OWNER = 'gstdcoin';
const SOURCE_BASE = 'https://api.github.com/repos';
const STATE_PREFIX = 'open-intelligence:github:v1:';
const STATUS_KEY = 'open-intelligence:github:status:v1';
const LOCK_KEY = 'open-intelligence:github:harvest-lock:v1';
const ATTEMPT_KEY_PREFIX = 'open-intelligence:github:attempt:v1:';
const MAX_RESPONSE_BYTES = 128 * 1024;
const LOCK_TTL_SECONDS = 600;
const ATTEMPT_TTL_SECONDS = 2 * 86_400;
const SOURCE_REQUEST_GAP_MS = 1_000;

export type TrackedRepository = typeof OPEN_INTELLIGENCE_REPOSITORIES[number];

export interface RepositoryMetadata {
    name: string;
    url: string;
    license_spdx: string | null;
    archived: boolean;
    stars: number;
    forks: number;
    open_issues: number;
    default_branch: string;
    created_at: string;
    updated_at: string;
    pushed_at: string | null;
}

export interface RepositorySnapshot {
    observed_at: string;
    source_url: string;
    source_status: 'fetched' | 'not_modified';
    schema_version: 1;
    quality: {
        valid: true;
        warnings: string[];
    };
    data: RepositoryMetadata;
}

interface RepositoryState {
    schema_version: 1;
    etag: string | null;
    snapshots: RepositorySnapshot[];
}

export interface RepositoryChange {
    repository: TrackedRepository;
    from: string;
    to: string;
    days_since_push: number | null;
    pushed_at_changed: boolean;
    stars_delta: number;
    forks_delta: number;
    open_issues_delta: number;
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

function nonNegativeInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) >= 0;
}

function parseState(raw: string | null): RepositoryState {
    if (!raw) return { schema_version: 1, etag: null, snapshots: [] };
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            !isRecord(parsed)
            || parsed.schema_version !== 1
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

export function normalizeRepositoryMetadata(
    repository: TrackedRepository,
    value: unknown,
): RepositoryMetadata {
    if (!isRecord(value)) throw new Error('GitHub response must be an object');
    const expectedName = `${OWNER}/${repository}`;
    if (value.full_name !== expectedName) throw new Error('GitHub response repository identity did not match');
    if (
        typeof value.html_url !== 'string'
        || value.html_url !== `https://github.com/${expectedName}`
        || typeof value.archived !== 'boolean'
        || !nonNegativeInteger(value.stargazers_count)
        || !nonNegativeInteger(value.forks_count)
        || !nonNegativeInteger(value.open_issues_count)
        || typeof value.default_branch !== 'string'
        || !value.default_branch
        || !isDateTime(value.created_at)
        || !isDateTime(value.updated_at)
        || (value.pushed_at !== null && !isDateTime(value.pushed_at))
    ) {
        throw new Error('GitHub response failed repository metadata validation');
    }
    if (Date.parse(value.updated_at) < Date.parse(value.created_at)) {
        throw new Error('repository updated_at predates created_at');
    }
    const license = isRecord(value.license) && typeof value.license.spdx_id === 'string'
        ? value.license.spdx_id
        : null;

    return {
        name: expectedName,
        url: `https://github.com/${expectedName}`,
        license_spdx: license,
        archived: value.archived,
        stars: value.stargazers_count,
        forks: value.forks_count,
        open_issues: value.open_issues_count,
        default_branch: value.default_branch,
        created_at: value.created_at,
        updated_at: value.updated_at,
        pushed_at: value.pushed_at as string | null,
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
    now = Date.now(),
): RepositoryChange | null {
    if (!previous || !latest) return null;
    const pushedAt = latest.data.pushed_at ? Date.parse(latest.data.pushed_at) : NaN;
    return {
        repository,
        from: previous.observed_at,
        to: latest.observed_at,
        days_since_push: Number.isFinite(pushedAt)
            ? Math.max(0, Math.floor((now - pushedAt) / 86_400_000))
            : null,
        pushed_at_changed: previous.data.pushed_at !== latest.data.pushed_at,
        stars_delta: latest.data.stars - previous.data.stars,
        forks_delta: latest.data.forks - previous.data.forks,
        open_issues_delta: latest.data.open_issues - previous.data.open_issues,
    };
}

function emptyChange(
    repository: TrackedRepository,
    latest: RepositorySnapshot,
    now: number,
): RepositoryChange {
    const pushedAt = latest.data.pushed_at ? Date.parse(latest.data.pushed_at) : NaN;
    return {
        repository,
        from: latest.observed_at,
        to: latest.observed_at,
        days_since_push: Number.isFinite(pushedAt)
            ? Math.max(0, Math.floor((now - pushedAt) / 86_400_000))
            : null,
        pushed_at_changed: false,
        stars_delta: 0,
        forks_delta: 0,
        open_issues_delta: 0,
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
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GSTD-Open-Intelligence (+https://app.gstdtoken.com)',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (state.etag) headers['If-None-Match'] = state.etag;

    const sourceUrl = `${SOURCE_BASE}/${OWNER}/${repository}`;
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
        };
    } else {
        if (!response.ok) {
            const remaining = response.headers.get('x-ratelimit-remaining');
            const retryAfter = response.headers.get('retry-after');
            if (response.status === 429 || remaining === '0' || retryAfter) {
                throw new Error(
                    `GitHub API rate limited (HTTP ${response.status}; remaining ${remaining ?? 'unknown'}; retry after ${retryAfter ?? 'unknown'})`,
                );
            }
            throw new Error(`GitHub API returned HTTP ${response.status}`);
        }
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_RESPONSE_BYTES) {
            throw new Error('GitHub response exceeded the size limit');
        }
        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
            throw new Error('GitHub response exceeded the size limit');
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            throw new Error('GitHub response was not valid JSON');
        }
        snapshot = {
            observed_at: observedAt,
            source_url: sourceUrl,
            source_status: 'fetched',
            schema_version: 1,
            quality: { valid: true, warnings: [] },
            data: normalizeRepositoryMetadata(repository, parsed),
        };
        etag = response.headers.get('etag');
    }

    const snapshots = appendDailySnapshot(state.snapshots, snapshot);
    await kvSet(stateKey(repository), JSON.stringify({
        schema_version: 1,
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
            schema_version: 1,
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
            ? deriveRepositoryChange(repository, previous, latest, now) || emptyChange(repository, latest, now)
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
    const recentPushes = latest.filter(snapshot => {
        const pushedAt = snapshot.data.pushed_at ? Date.parse(snapshot.data.pushed_at) : NaN;
        return Number.isFinite(pushedAt) && now - pushedAt <= 7 * 86_400_000;
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
        schema_version: 1,
        algorithm_version: OPEN_INTELLIGENCE_ALGORITHM,
        generated_at: new Date(now).toISOString(),
        source: {
            id: 'github-rest-repository-metadata',
            name: 'GitHub REST API - repository metadata',
            url: 'https://docs.github.com/en/rest/repos/repos#get-a-repository',
            attribution: 'Data retrieved from GitHub public repository metadata; each repository links to its canonical GitHub page.',
            collection: 'Unauthenticated conditional GET, at most once per repository per UTC day; ETag used when available.',
            data_policy: 'Only repository-level counts, dates, license identifier, branch name, archive flag, and canonical URL are retained. No source code, issue text, release text, account data, or raw API payload is stored.',
            rate_limit: 'Unauthenticated GitHub REST API limit is 60 requests per hour per originating IP; this collector is capped at four repository requests per UTC day.',
        },
        research: {
            question: 'What is the recent public repository update footprint of the GSTD ecosystem?',
            status: latest.length === 0
                ? 'awaiting_first_collection'
                : repositories.some(entry => entry.snapshot_count < 2) ? 'baseline' : 'observed',
            method: 'Count the tracked repositories with GitHub pushed_at timestamps within the last seven days; compare consecutive daily snapshots for metadata deltas.',
            tracked_repositories: OPEN_INTELLIGENCE_REPOSITORIES.length,
            repositories_with_data: latest.length,
            pushed_within_7_days: recentPushes,
            limitations: [
                'GitHub pushed_at is a repository metadata timestamp, not a measure of code quality, user demand, project health, or production activity.',
                'A first snapshot is only a baseline. Trend comparisons require at least two observations.',
                'GitHub is the sole source; values have not been independently verified.',
            ],
        },
        update_status: updateStatus,
        repositories,
    };
}
