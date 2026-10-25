export interface NodeStatusRecord {
    node_id?: string;
    node_url?: string;
    multiaddrs?: string[];
    last_seen?: string | null;
}

const UUID_NODE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
export const NODE_ONLINE_WINDOW_MS = 10 * 60 * 1000;

export function dedupeNodeRecords<T extends NodeStatusRecord>(records: T[]): T[] {
    const sorted = [...records].sort((a, b) =>
        Number(UUID_NODE_ID_RE.test(a.node_id || '')) - Number(UUID_NODE_ID_RE.test(b.node_id || '')),
    );
    const seenUrls = new Set<string>();
    return sorted.filter(record => {
        const url = record.node_url || record.multiaddrs?.[0] || '';
        if (!url) return true;
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
    });
}

export function isNodeOnline(record: NodeStatusRecord, nowMs = Date.now()): boolean {
    const lastSeenMs = Date.parse(record.last_seen || '');
    const ageMs = nowMs - lastSeenMs;
    return Number.isFinite(lastSeenMs) && ageMs >= 0 && ageMs < NODE_ONLINE_WINDOW_MS;
}

/** Only registry records belong in node totals; the prefix also contains cache metadata. */
export function parseNodeRecords<T extends NodeStatusRecord = NodeStatusRecord>(values: readonly (string | null)[]): T[] {
    return values.flatMap(value => {
        if (!value) return [];
        try {
            const record = JSON.parse(value);
            return record && typeof record === 'object' && !Array.isArray(record)
                && typeof record.node_id === 'string' ? [record as T] : [];
        } catch { return []; }
    });
}
