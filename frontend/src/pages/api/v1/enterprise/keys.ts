/**
 * Enterprise API Key Management
 * GET    /api/v1/enterprise/keys           — list keys (requires master_key header)
 * POST   /api/v1/enterprise/keys           — create key
 * DELETE /api/v1/enterprise/keys?id=<id>   — revoke key
 *
 * Auth: X-Master-Key header (set ENTERPRISE_MASTER_KEY env var)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys, kvDel } from '../../../../lib/kv';
import { createHash, randomBytes } from 'crypto';

function generateApiKey(): string {
    return 'gstd_' + randomBytes(24).toString('base64url');
}

function hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

export interface EnterpriseKey {
    id:          string;
    name:        string;
    org:         string;
    key_prefix:  string;   // first 12 chars, shown in UI
    key_hash:    string;   // sha256 of full key
    tier:        'starter' | 'professional' | 'enterprise';
    monthly_limit_tokens: number;
    rpm_limit:   number;
    created_at:  number;
    expires_at:  number | null;
    active:      boolean;
    allowed_models: string[];  // empty = all models
}

const TIER_LIMITS = {
    starter:      { monthly_tokens: 10_000_000,  rpm: 10  },
    professional: { monthly_tokens: 100_000_000, rpm: 60  },
    enterprise:   { monthly_tokens: 1_000_000_000, rpm: 500 },
};

function getMasterKey(): string {
    return process.env.ENTERPRISE_MASTER_KEY || 'dev_master_key_change_in_production';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Auth check
    const masterKey = req.headers['x-master-key'];
    if (masterKey !== getMasterKey()) {
        return res.status(401).json({ error: 'Invalid or missing X-Master-Key header' });
    }

    if (req.method === 'GET') {
        // List all keys
        const keyNames = await kvKeys('enterprise_key:*').catch(() => [] as string[]);
        const keys: EnterpriseKey[] = [];

        for (const kn of keyNames) {
            const raw = await kvGet(kn).catch(() => null);
            if (!raw) continue;
            try {
                keys.push(JSON.parse(raw as string));
            } catch { /* skip */ }
        }

        return res.status(200).json({
            total: keys.length,
            keys:  keys.sort((a, b) => b.created_at - a.created_at),
        });
    }

    if (req.method === 'POST') {
        const {
            name, org, tier = 'starter',
            monthly_limit_tokens, rpm_limit,
            expires_in_days,
            allowed_models = [],
        } = req.body as {
            name?: string; org?: string;
            tier?: string; monthly_limit_tokens?: number; rpm_limit?: number;
            expires_in_days?: number; allowed_models?: string[];
        };

        if (!name || !org) {
            return res.status(400).json({ error: 'name and org are required' });
        }

        const validTiers = ['starter', 'professional', 'enterprise'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({ error: `tier must be one of: ${validTiers.join(', ')}` });
        }

        const tierDefaults = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
        const rawKey = generateApiKey();
        const keyId  = 'ek_' + randomBytes(8).toString('hex');

        const keyRecord: EnterpriseKey = {
            id:           keyId,
            name,
            org,
            key_prefix:   rawKey.slice(0, 12),
            key_hash:     hashKey(rawKey),
            tier:         tier as EnterpriseKey['tier'],
            monthly_limit_tokens: monthly_limit_tokens || tierDefaults.monthly_tokens,
            rpm_limit:    rpm_limit || tierDefaults.rpm,
            created_at:   Date.now(),
            expires_at:   expires_in_days ? Date.now() + expires_in_days * 86400_000 : null,
            active:       true,
            allowed_models,
        };

        await kvSet(`enterprise_key:${keyId}`, JSON.stringify(keyRecord));

        // Return the raw key ONCE — not stored, only hash is kept
        return res.status(201).json({
            ...keyRecord,
            api_key: rawKey,
            warning: 'Store this key securely — it will not be shown again.',
            usage:   `Authorization: Bearer ${rawKey}`,
            endpoint: 'https://app.gstdtoken.com/api/v1/chat/completions',
        });
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: 'id query param required' });
        }

        const raw = await kvGet(`enterprise_key:${id}`).catch(() => null);
        if (!raw) return res.status(404).json({ error: 'Key not found' });

        const record = JSON.parse(raw as string) as EnterpriseKey;
        record.active = false;
        await kvSet(`enterprise_key:${id}`, JSON.stringify(record));

        return res.status(200).json({ id, revoked: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Exported validator used by chat completions middleware ───────────────────
export async function validateEnterpriseKey(rawKey: string): Promise<EnterpriseKey | null> {
    if (!rawKey.startsWith('gstd_')) return null;

    const hash = hashKey(rawKey);
    const allKeys = await kvKeys('enterprise_key:*').catch(() => [] as string[]);

    for (const kn of allKeys) {
        const raw = await kvGet(kn).catch(() => null);
        if (!raw) continue;
        try {
            const record = JSON.parse(raw as string) as EnterpriseKey;
            if (record.key_hash === hash && record.active) {
                if (record.expires_at && Date.now() > record.expires_at) return null;
                return record;
            }
        } catch { /* skip */ }
    }
    return null;
}
