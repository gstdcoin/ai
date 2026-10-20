import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    appendDailySnapshot,
    deriveRepositoryChange,
    getGithubEcosystemDataset,
    harvestGithubEcosystem,
    normalizeCommitFeed,
    type RepositorySnapshot,
    type TrackedRepository,
} from './openIntelligence';

const branches: Record<TrackedRepository, string> = {
    ai: 'main',
    gstdbot: 'main',
    A2A: 'master',
    web: 'main',
};

function commitId(index: number): string {
    return index.toString(16).padStart(40, '0');
}

function atomFeed(repository: TrackedRepository, ids = [1]) {
    const entries = ids.map((id, index) => `
      <entry>
        <id>tag:github.com,2008:Grit::Commit/${commitId(id)}</id>
        <updated>2026-10-${String(19 - index).padStart(2, '0')}T12:00:00Z</updated>
        <title>ignored commit message</title>
        <author><name>ignored author</name></author>
      </entry>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <id>tag:github.com,2008:/gstdcoin/${repository}/commits/${branches[repository]}</id>
        ${entries}
      </feed>`;
}

function response(body: string, status = 200, headers: Record<string, string> = {}) {
    return new Response(status === 304 ? null : body, {
        status,
        headers: { 'content-type': 'application/atom+xml; charset=utf-8', ...headers },
    });
}

describe('GSTD Open Intelligence collector', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('validates Atom feed identity and retains commit metadata only', () => {
        const normalized = normalizeCommitFeed('ai', atomFeed('ai'));
        expect(normalized.commits).toEqual([{
            id: commitId(1),
            committed_at: '2026-10-19T12:00:00Z',
        }]);
        expect(normalized.latest_commit_at).toBe('2026-10-19T12:00:00Z');
        expect(JSON.stringify(normalized)).not.toContain('ignored commit message');
        expect(JSON.stringify(normalized)).not.toContain('ignored author');
        expect(() => normalizeCommitFeed('ai', atomFeed('gstdbot'))).toThrow(/identity/);
        expect(() => normalizeCommitFeed('ai', '<!DOCTYPE feed [<!ENTITY x "y">]><feed/>')).toThrow(/safe Atom feed/);
    });

    it('deduplicates one daily observation and bounds retained history', () => {
        const snapshot = (date: string): RepositorySnapshot => ({
            observed_at: `${date}T04:15:00.000Z`,
            source_url: 'https://github.com/gstdcoin/ai/commits/main.atom',
            source_status: 'fetched',
            schema_version: 2,
            quality: { valid: true, warnings: [] },
            data: {
                name: 'gstdcoin/ai',
                url: 'https://github.com/gstdcoin/ai',
                default_branch: 'main',
                commits: [{ id: commitId(1), committed_at: `${date}T00:00:00Z` }],
                latest_commit_id: commitId(1),
                latest_commit_at: `${date}T00:00:00Z`,
                new_commits: 0,
                new_commits_is_lower_bound: false,
            },
        });
        const a = snapshot('2026-10-18');
        const sameDay = snapshot('2026-10-18');
        const nextDay = snapshot('2026-10-19');
        expect(appendDailySnapshot([a], sameDay)).toEqual([sameDay]);
        expect(appendDailySnapshot([a], nextDay)).toEqual([a, nextDay]);
    });

    it('derives visible new commits and does not claim a count without history', () => {
        const make = (date: string, id: number, newCommits: number | null): RepositorySnapshot => ({
            observed_at: date,
            source_url: 'https://github.com/gstdcoin/ai/commits/main.atom',
            source_status: 'fetched',
            schema_version: 2,
            quality: { valid: true, warnings: [] },
            data: {
                name: 'gstdcoin/ai',
                url: 'https://github.com/gstdcoin/ai',
                default_branch: 'main',
                commits: [{ id: commitId(id), committed_at: date }],
                latest_commit_id: commitId(id),
                latest_commit_at: date,
                new_commits: newCommits,
                new_commits_is_lower_bound: false,
            },
        });
        const earlier = make('2026-10-18T04:00:00.000Z', 1, null);
        const latest = make('2026-10-19T04:00:00.000Z', 2, 1);
        expect(deriveRepositoryChange('ai', undefined, latest)).toBeNull();
        expect(deriveRepositoryChange('ai', earlier, latest)).toMatchObject({
            latest_commit_changed: true,
            new_commits: 1,
        });
    });

    it('harvests bounded daily feeds, skips duplicate requests, then uses ETags', async () => {
        let requestCount = 0;
        const requestOrder: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            requestCount += 1;
            const repository = String(input).split('/').at(-3) as TrackedRepository;
            requestOrder.push(repository);
            return response(atomFeed(repository), 200, { ETag: `"${repository}-v1"` });
        }));
        const firstRun = await harvestGithubEcosystem(Date.parse('2041-01-01T04:15:00Z'));
        expect(firstRun.ok).toBe(true);
        expect(firstRun.sources).toHaveLength(4);
        expect(requestCount).toBe(4);
        expect(requestOrder).toEqual(['ai', 'gstdbot', 'A2A', 'web']);

        const sameDay = await harvestGithubEcosystem(Date.parse('2041-01-01T12:00:00Z'));
        expect(sameDay.sources.every(source => source.status === 'skipped_today')).toBe(true);
        expect(requestCount).toBe(4);

        vi.stubGlobal('fetch', vi.fn(async () => {
            requestCount += 1;
            return response('', 304);
        }));
        const nextDay = await harvestGithubEcosystem(Date.parse('2041-01-02T04:15:00Z'));
        expect(nextDay.sources.every(source => source.status === 'not_modified')).toBe(true);
        expect(requestCount).toBe(8);
    }, 15_000);

    it('does not retry a failed repository request on the same UTC day', async () => {
        let requestCount = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            requestCount += 1;
            return response('rate limited', 403, { 'X-RateLimit-Remaining': '0' });
        }));

        const firstRun = await harvestGithubEcosystem(Date.parse('2042-01-01T04:15:00Z'));
        expect(firstRun.sources.every(source => source.status === 'error')).toBe(true);
        expect(firstRun.sources[0].error).toMatch(/rate limited/);
        expect(requestCount).toBe(4);

        const retry = await harvestGithubEcosystem(Date.parse('2042-01-01T12:00:00Z'));
        expect(retry.sources.every(source => source.status === 'skipped_after_attempt')).toBe(true);
        expect(requestCount).toBe(4);
    });

    it('publishes a versioned baseline and marks non-overlapping feed counts as lower bounds', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const repository = String(input).split('/').at(-3) as TrackedRepository;
            return response(atomFeed(repository, [2]));
        }));
        await harvestGithubEcosystem(Date.parse('2043-01-01T04:15:00Z'));

        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const repository = String(input).split('/').at(-3) as TrackedRepository;
            return response(atomFeed(repository, [3]));
        }));
        await harvestGithubEcosystem(Date.parse('2043-01-02T04:15:00Z'));

        const dataset = await getGithubEcosystemDataset(30, Date.parse('2043-01-02T04:15:00Z'));
        expect(dataset.schema_version).toBe(2);
        expect(dataset.research.repositories_with_data).toBe(4);
        expect(dataset.repositories[0].latest?.data.new_commits).toBe(1);
        expect(dataset.repositories[0].latest?.data.new_commits_is_lower_bound).toBe(true);
    }, 15_000);
});
