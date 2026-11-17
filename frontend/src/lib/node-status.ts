export interface NodeStatusRecord {
    node_id?: string;
    node_url?: string;
    multiaddrs?: string[];
    last_seen?: string | null;
    maintenance_window?: { starts_at: number; ends_at: number } | null;
    maintenance_storage_error?: boolean;
}

export function nodeMaintenanceUpdate(value: unknown, error: unknown, now = Date.now()) {
    if (value === undefined && error === undefined) return {};
    const window = value as NodeStatusRecord['maintenance_window'];
    if (value !== null && (!window || !Number.isSafeInteger(window.starts_at) || !Number.isSafeInteger(window.ends_at)
        || window.starts_at < 0 || window.starts_at > now + 90 * 86400_000
        || window.ends_at <= window.starts_at || window.ends_at - window.starts_at > 7 * 86400_000)) return {};
    return {
        maintenance_window: window ? { starts_at: window.starts_at, ends_at: window.ends_at } : null,
        maintenance_storage_error: error === true,
    };
}

export function nodeAcceptingWork(record: NodeStatusRecord, now = Date.now()): boolean {
    const window = record.maintenance_window;
    return !record.maintenance_storage_error && !(window && now >= window.starts_at && now < window.ends_at);
}

const UUID_NODE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
export const NODE_ONLINE_WINDOW_MS = 10 * 60 * 1000;

export function dedupeNodeRecords<T extends NodeStatusRecord>(records: T[]): T[] {
    const sorted = [...records].sort((a, b) =>
        (Date.parse(b.last_seen || '') || 0) - (Date.parse(a.last_seen || '') || 0)
        || Number(UUID_NODE_ID_RE.test(a.node_id || '')) - Number(UUID_NODE_ID_RE.test(b.node_id || '')),
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
