import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    appendDailySnapshot,
    deriveRepositoryChange,
    harvestGithubEcosystem,
    normalizeRepositoryMetadata,
    type RepositorySnapshot,
} from './openIntelligence';

function apiRecord(repository: string, stars = 3) {
    return {
        full_name: `gstdcoin/${repository}`,
        html_url: `https://github.com/gstdcoin/${repository}`,
        license: { spdx_id: 'MIT' },
        archived: false,
        stargazers_count: stars,
        forks_count: 1,
        open_issues_count: 0,
        default_branch: 'main',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2026-10-19T00:00:00Z',
        pushed_at: '2026-10-19T00:00:00Z',
    };
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

describe('GSTD Open Intelligence collector', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('validates public GitHub metadata and rejects mismatched repository identity', () => {
        expect(normalizeRepositoryMetadata('ai', apiRecord('ai')).stars).toBe(3);
        expect(() => normalizeRepositoryMetadata('ai', apiRecord('gstdbot'))).toThrow(/identity/);
        expect(() => normalizeRepositoryMetadata('ai', { ...apiRecord('ai'), stargazers_count: -1 })).toThrow(/validation/);
    });

    it('deduplicates one daily observation and bounds retained history', () => {
        const snapshot = (date: string): RepositorySnapshot => ({
            observed_at: `${date}T04:15:00.000Z`,
            source_url: 'https://api.github.com/repos/gstdcoin/ai',
            source_status: 'fetched',
            schema_version: 1,
            quality: { valid: true, warnings: [] },
            data: normalizeRepositoryMetadata('ai', apiRecord('ai')),
        });
        const a = snapshot('2026-10-18');
        const sameDay = snapshot('2026-10-18');
        const nextDay = snapshot('2026-10-19');
        expect(appendDailySnapshot([a], sameDay)).toEqual([sameDay]);
        expect(appendDailySnapshot([a], nextDay)).toEqual([a, nextDay]);
    });

    it('derives transparent metadata changes and rejects no-history claims', () => {
        const make = (date: string, stars: number, pushed: string): RepositorySnapshot => ({
            observed_at: date,
            source_url: 'https://api.github.com/repos/gstdcoin/ai',
            source_status: 'fetched',
            schema_version: 1,
            quality: { valid: true, warnings: [] },
            data: normalizeRepositoryMetadata('ai', {
                ...apiRecord('ai', stars),
                pushed_at: pushed,
            }),
        });
        const earlier = make('2026-10-18T04:00:00.000Z', 3, '2026-10-17T12:00:00Z');
        const latest = make('2026-10-19T04:00:00.000Z', 5, '2026-10-18T12:00:00Z');
        expect(deriveRepositoryChange('ai', undefined, latest)).toBeNull();
        expect(deriveRepositoryChange('ai', earlier, latest, Date.parse('2026-10-19T12:00:00Z'))).toMatchObject({
            stars_delta: 2,
            pushed_at_changed: true,
            days_since_push: 1,
        });
    });

    it('harvests a bounded baseline, skips duplicate daily requests, then uses ETags', async () => {
        let requestCount = 0;
        const requestOrder: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            requestCount += 1;
            const repository = String(input).split('/').pop() || '';
            requestOrder.push(repository);
            return response(apiRecord(repository), 200, { ETag: `"${repository}-v1"` });
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
            return response(null, 304);
        }));
        const nextDay = await harvestGithubEcosystem(Date.parse('2041-01-02T04:15:00Z'));
        expect(nextDay.sources.every(source => source.status === 'not_modified')).toBe(true);
        expect(requestCount).toBe(8);
    }, 15_000);

    it('does not retry a failed repository request on the same UTC day', async () => {
        let requestCount = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            requestCount += 1;
            return response({ message: 'rate limited' }, 403, { 'X-RateLimit-Remaining': '0' });
        }));

        const firstRun = await harvestGithubEcosystem(Date.parse('2042-01-01T04:15:00Z'));
        expect(firstRun.sources.every(source => source.status === 'error')).toBe(true);
        expect(firstRun.sources[0].error).toMatch(/rate limited/);
        expect(requestCount).toBe(4);

        const retry = await harvestGithubEcosystem(Date.parse('2042-01-01T12:00:00Z'));
        expect(retry.sources.every(source => source.status === 'skipped_after_attempt')).toBe(true);
        expect(requestCount).toBe(4);
    });
});
