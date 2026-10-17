/**
 * KV Storage abstraction
 *
 * Production: Upstash Redis REST API
 * Development: in-memory fallback (no setup needed)
 *
 * Production requires KV_REST_API_URL and KV_REST_API_TOKEN. The in-memory
 * fallback is development-only because it is not shared or durable.
 */

import { Redis } from '@upstash/redis/cloudflare';
import { logger } from './logger';

// ── In-memory fallback for local dev ──────────────────────────────
const mem = new Map<string, { value: string; exp: number | null }>();
const ALLOW_MEMORY_FALLBACK = process.env.NODE_ENV !== 'production';

function handleRedisFailure(operation: string, error: unknown): void {
    const fallback = ALLOW_MEMORY_FALLBACK
        ? 'using in-memory fallback in development'
        : 'in-memory fallback is disabled in production';
    logger.error(`${operation} failed; ${fallback}`, error);
    if (!ALLOW_MEMORY_FALLBACK) throw error;
}

function memGet(key: string): string | null {
    const entry = mem.get(key);
    if (!entry) return null;
    if (entry.exp !== null && entry.exp < Date.now()) { mem.delete(key); return null; }
    return entry.value;
}
function memSet(key: string, value: string, ttlSec?: number): void {
    mem.set(key, { value, exp: ttlSec ? Date.now() + ttlSec * 1000 : null });
}
function memDel(key: string): void { mem.delete(key); }
function memKeys(prefix: string): string[] {
    const now = Date.now();
    return Array.from(mem.entries())
        .filter(([k, v]) => k.startsWith(prefix) && (v.exp === null || v.exp > now))
        .map(([k]) => k);
}

// ── Upstash Redis client ───────────────────────────────────────────
let _redis: Redis | null = null;

async function getRedis(): Promise<Redis | null> {
    if (_redis) return _redis;
    const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (!ALLOW_MEMORY_FALLBACK) {
            throw new Error('Upstash Redis credentials are required in production');
        }
        return null;
    }
    try {
        _redis = new Redis({ url, token });
        return _redis;
    } catch (error) {
        if (!ALLOW_MEMORY_FALLBACK) {
            logger.error('Failed to initialize Upstash Redis in production', error);
            throw error;
        }
        return null;
    }
}

// ── Public API ─────────────────────────────────────────────────────

export async function kvGet(key: string): Promise<string | null> {
    const r = await getRedis();
    if (r) {
        try {
            const val = await r.get(key);
            if (val == null) return null;
            // Upstash auto-parses JSON strings into objects — serialize back to string
            return typeof val === 'string' ? val : JSON.stringify(val);
        } catch (e) { handleRedisFailure(`kvGet('${key}')`, e); }
    }
    return memGet(key);
}

export async function kvSet(key: string, value: string, ttlSec?: number): Promise<void> {
    const r = await getRedis();
    if (r) {
        try {
            if (ttlSec) await r.set(key, value, { ex: ttlSec });
            else        await r.set(key, value);
            return;
        } catch (e) { handleRedisFailure(`kvSet('${key}')`, e); }
    }
    memSet(key, value, ttlSec);
}

export async function kvSetNX(key: string, value: string, ttlSec: number): Promise<boolean> {
    const r = await getRedis();
    if (r) {
        try {
            return (await r.set(key, value, { nx: true, ex: ttlSec })) === 'OK';
        } catch (e) { handleRedisFailure(`kvSetNX('${key}')`, e); }
    }
    if (memGet(key) !== null) return false;
    memSet(key, value, ttlSec);
    return true;
}

export type CampaignTaskReservation =
    | { status: 'reserved'; remainingBudget: number; nodeReward: number; protocolFee: number }
    | { status: 'not_found' | 'inactive' | 'expired' | 'exhausted' | 'invalid' };

export async function kvReserveCampaignTask(
    campaignKey: string,
    queueKey: string,
    taskJson: string,
    ttlSec: number,
    nowMs: number,
    expiresAtMs: number,
): Promise<CampaignTaskReservation> {
    const r = await getRedis();
    if (r) {
        const script = `
            local campaignRaw = redis.call('GET', KEYS[1])
            if not campaignRaw then return {'not_found'} end
            local ok, campaign = pcall(cjson.decode, campaignRaw)
            if not ok or type(campaign) ~= 'table' then return {'invalid'} end
            if campaign.active ~= true then return {'inactive'} end
            local reward = tonumber(campaign.reward_per_task)
            local budget = tonumber(campaign.remaining_budget)
            if not reward or reward <= 0 or not budget then return {'invalid'} end
            if tonumber(ARGV[4]) >= tonumber(ARGV[5]) then return {'expired'} end
            if budget < reward then return {'exhausted'} end
            local taskOk, task = pcall(cjson.decode, ARGV[1])
            if not taskOk or type(task) ~= 'table' then return {'invalid'} end

            local queueType = redis.call('TYPE', KEYS[2]).ok
            local taskStatsType = redis.call('TYPE', KEYS[3]).ok
            local rewardStatsType = redis.call('TYPE', KEYS[4]).ok
            if (queueType ~= 'none' and queueType ~= 'list')
                or (taskStatsType ~= 'none' and taskStatsType ~= 'string')
                or (rewardStatsType ~= 'none' and rewardStatsType ~= 'string') then
                return {'invalid'}
            end
            local taskCount = redis.call('GET', KEYS[3])
            local rewardTotal = redis.call('GET', KEYS[4])
            if (taskCount and not tonumber(taskCount)) or (rewardTotal and not tonumber(rewardTotal)) then
                return {'invalid'}
            end

            local protocolFee = math.floor(reward * tonumber(ARGV[2]) * 100 + 0.5) / 100
            local nodeReward = math.floor((reward - protocolFee) * 100 + 0.5) / 100
            local remaining = math.floor((budget - reward) * 100 + 0.5) / 100
            campaign.remaining_budget = remaining
            task.campaign_id = campaign.id
            task.company = campaign.company
            task.reward_gstd = nodeReward
            task.protocol_fee = protocolFee
            if task.required_caps == nil or task.required_caps == cjson.null then task.required_caps = campaign.required_caps or {} end
            if task.min_resources == nil or task.min_resources == cjson.null then task.min_resources = campaign.min_resources or {} end
            if task.requester == nil or task.requester == cjson.null then task.requester = campaign.company end

            redis.call('LPUSH', KEYS[2], cjson.encode(task))
            redis.call('SET', KEYS[1], cjson.encode(campaign), 'EX', tonumber(ARGV[3]))
            redis.call('INCR', KEYS[3])
            redis.call('INCRBYFLOAT', KEYS[4], tostring(nodeReward))
            return {'reserved', tostring(remaining), tostring(nodeReward), tostring(protocolFee)}
        `;
        try {
            const result = await r.eval<
                [string, string, string, string, string],
                [string, string?, string?, string?]
            >(
                script,
                [campaignKey, queueKey, 'stats:total_tasks_submitted', 'stats:total_reward_gstd'],
                [taskJson, '0.1', String(ttlSec), String(nowMs), String(expiresAtMs)],
            );
            const status = result[0];
            if (status !== 'reserved') {
                if (status === 'not_found' || status === 'inactive' || status === 'expired'
                    || status === 'exhausted' || status === 'invalid') {
                    return { status };
                }
                return { status: 'invalid' };
            }
            return {
                status: 'reserved',
                remainingBudget: Number(result[1]),
                nodeReward: Number(result[2]),
                protocolFee: Number(result[3]),
            };
        } catch (e) { handleRedisFailure(`kvReserveCampaignTask('${campaignKey}')`, e); }
    }

    const raw = memGet(campaignKey);
    if (!raw) return { status: 'not_found' };
    let campaign: Record<string, any>;
    let task: Record<string, any>;
    try {
        campaign = JSON.parse(raw);
        task = JSON.parse(taskJson);
    } catch {
        return { status: 'invalid' };
    }
    if (campaign.active !== true) return { status: 'inactive' };
    const reward = Number(campaign.reward_per_task);
    const budget = Number(campaign.remaining_budget);
    const expiry = Date.parse(campaign.expires_at);
    if (!Number.isFinite(reward) || reward <= 0 || !Number.isFinite(budget) || !Number.isFinite(expiry)) {
        return { status: 'invalid' };
    }
    if (nowMs >= expiry) return { status: 'expired' };
    if (budget < reward) return { status: 'exhausted' };

    const protocolFee = Math.round(reward * 0.1 * 100) / 100;
    const nodeReward = Math.round((reward - protocolFee) * 100) / 100;
    const remainingBudget = Math.round((budget - reward) * 100) / 100;
    campaign.remaining_budget = remainingBudget;
    task.campaign_id = campaign.id;
    task.company = campaign.company;
    task.reward_gstd = nodeReward;
    task.protocol_fee = protocolFee;
    if (task.required_caps == null) task.required_caps = campaign.required_caps || [];
    if (task.min_resources == null) task.min_resources = campaign.min_resources || {};
    if (task.requester == null) task.requester = campaign.company;

    const rawQueue = memGet(queueKey);
    const queue: string[] = rawQueue ? JSON.parse(rawQueue) : [];
    queue.push(JSON.stringify(task));
    memSet(queueKey, JSON.stringify(queue));
    memSet(campaignKey, JSON.stringify(campaign), ttlSec);
    memSet('stats:total_tasks_submitted', String((parseInt(memGet('stats:total_tasks_submitted') || '0', 10) || 0) + 1));
    const rewardTotal = (parseFloat(memGet('stats:total_reward_gstd') || '0') || 0) + nodeReward;
    memSet('stats:total_reward_gstd', String(Math.round(rewardTotal * 1e6) / 1e6));
    return { status: 'reserved', remainingBudget, nodeReward, protocolFee };
}

export async function kvAccrueTaskReward(
    taskId: string,
    walletKey: string,
    nodeId: string,
    nodeShare: number,
    communityShare: number,
    feeGstd: number,
): Promise<boolean> {
    const r = await getRedis();
    const seenKey = `reward_seen:${taskId}`;
    const pendingKey = `rewards:pending:${walletKey}`;
    const lifetimeKey = `rewards:lifetime:${nodeId}`;
    if (r) {
        const script = `
            if redis.call('SET', KEYS[1], '1', 'EX', ARGV[5], 'NX') then
                redis.call('INCRBYFLOAT', KEYS[2], ARGV[1])
                redis.call('INCRBYFLOAT', KEYS[3], ARGV[1])
                redis.call('INCRBYFLOAT', KEYS[4], ARGV[2])
                redis.call('INCRBYFLOAT', KEYS[5], ARGV[3])
                redis.call('SET', KEYS[6], ARGV[4])
                return 1
            end
            return 0
        `;
        try {
            const result = await r.eval<[string, string, string, string, number], number>(
                script,
                [seenKey, pendingKey, lifetimeKey, 'rewards:treasury', 'stats:total_gstd_paid', `rewards:node_wallet:${nodeId}`],
                [String(nodeShare), String(communityShare), String(feeGstd), walletKey, 86400 * 7],
            );
            return result === 1;
        } catch (e) { handleRedisFailure(`kvAccrueTaskReward('${taskId}')`, e); }
    }
    if (memGet(seenKey) !== null) return false;
    memSet(seenKey, '1', 86400 * 7);
    const add = (key: string, amount: number) => {
        memSet(key, String((parseFloat(memGet(key) || '0') || 0) + amount));
    };
    add(pendingKey, nodeShare);
    add(lifetimeKey, nodeShare);
    add('rewards:treasury', communityShare);
    add('stats:total_gstd_paid', feeGstd);
    memSet(`rewards:node_wallet:${nodeId}`, walletKey);
    return true;
}

export type TaskCompletionResult =
    | { status: 'completed'; assignment: string }
    | { status: 'duplicate'; assignment: string }
    | { status: 'invalid' }
    | { status: 'wallet_mismatch' };

export async function kvCompleteAssignedTask(
    taskId: string,
    nodeId: string,
    wallet: string,
    fallbackReward: number,
    communityTax: number,
    nodeTtlSec: number,
    completionTtlSec: number,
): Promise<TaskCompletionResult> {
    const assignmentKey = `task_assigned:${taskId}`;
    const completionKey = `task_completed:${taskId}`;
    const nodeKey = `node:${nodeId}`;
    const walletKey = wallet.toLowerCase();
    const keys = [
        assignmentKey,
        completionKey,
        nodeKey,
        `rewards:pending:${walletKey}`,
        `rewards:lifetime:${nodeId}`,
        'rewards:treasury',
        'stats:total_gstd_paid',
        `rewards:node_wallet:${nodeId}`,
        'stats:total_tasks_completed',
        `reward_seen:${taskId}`,
    ];
    const args = [
        nodeId,
        walletKey,
        String(fallbackReward),
        String(communityTax),
        String(nodeTtlSec),
        String(completionTtlSec),
    ];
    const timestamp = new Date().toISOString();
    args.push(timestamp);
    const r = await getRedis();
    if (r) {
        const script = `
            local completed = redis.call('GET', KEYS[2])
            if completed then
                local ok, previous = pcall(cjson.decode, completed)
                if ok and previous.node_id == ARGV[1] then
                    return {'duplicate', previous.assignment}
                end
                return {'invalid', ''}
            end
            local raw = redis.call('GET', KEYS[1])
            if not raw then return {'invalid', ''} end
            local ok, assignment = pcall(cjson.decode, raw)
            if not ok or assignment.node_id ~= ARGV[1] then return {'invalid', ''} end
            local nodeRaw = redis.call('GET', KEYS[3])
            if not nodeRaw then return {'invalid', ''} end
            local nodeOk, node = pcall(cjson.decode, nodeRaw)
            if not nodeOk then return {'invalid', ''} end
            local storedWallet = string.lower(node.wallet_address or '')
            if storedWallet == '' or storedWallet ~= ARGV[2] then return {'wallet_mismatch', ''} end

            local reward = tonumber(assignment.reward_gstd)
            if not reward or reward < 0 then reward = tonumber(ARGV[3]) end
            local tax = tonumber(ARGV[4])
            local nodeShare = math.floor((reward * (1 - tax) * 1000000) + 0.5) / 1000000
            local communityShare = math.floor((reward * tax * 1000000) + 0.5) / 1000000
            node.tasks_completed = (tonumber(node.tasks_completed) or 0) + 1
            node.gstd_earned = math.floor(((tonumber(node.gstd_earned) or 0) + reward) * 1000000 + 0.5) / 1000000
            node.last_seen = ARGV[7]
            redis.call('SET', KEYS[3], cjson.encode(node), 'EX', tonumber(ARGV[5]))
            redis.call('INCR', KEYS[9])

            if reward > 0 and redis.call('SET', KEYS[10], '1', 'EX', 604800, 'NX') then
                redis.call('INCRBYFLOAT', KEYS[4], nodeShare)
                redis.call('INCRBYFLOAT', KEYS[5], nodeShare)
                redis.call('INCRBYFLOAT', KEYS[6], communityShare)
                redis.call('INCRBYFLOAT', KEYS[7], reward)
                redis.call('SET', KEYS[8], ARGV[2])
            end

            local completion = cjson.encode({node_id = ARGV[1], assignment = raw})
            redis.call('SET', KEYS[2], completion, 'EX', tonumber(ARGV[6]))
            redis.call('DEL', KEYS[1])
            return {'completed', raw}
        `;
        try {
            const result = await r.eval<string[], unknown[]>(script, keys, args);
            const status = String(result?.[0] ?? 'invalid');
            if (status === 'completed' || status === 'duplicate') {
                const value = result[1];
                return {
                    status,
                    assignment: typeof value === 'string' ? value : JSON.stringify(value),
                };
            }
            return { status: status === 'wallet_mismatch' ? 'wallet_mismatch' : 'invalid' };
        } catch (e) { handleRedisFailure(`kvCompleteAssignedTask('${taskId}')`, e); }
    }

    const completionRaw = memGet(completionKey);
    if (completionRaw) {
        try {
            const previous = JSON.parse(completionRaw) as { node_id: string; assignment: string };
            return previous.node_id === nodeId
                ? { status: 'duplicate', assignment: previous.assignment }
                : { status: 'invalid' };
        } catch {
            memDel(completionKey);
        }
    }
    const raw = memGet(assignmentKey);
    if (!raw) return { status: 'invalid' };
    let assignment: { node_id?: string };
    try {
        assignment = JSON.parse(raw);
    } catch {
        return { status: 'invalid' };
    }
    if (assignment.node_id !== nodeId) return { status: 'invalid' };
    const nodeRaw = memGet(nodeKey);
    if (!nodeRaw) return { status: 'invalid' };
    let node: Record<string, any>;
    try {
        node = JSON.parse(nodeRaw);
    } catch {
        return { status: 'invalid' };
    }
    if (String(node.wallet_address || '').trim().toLowerCase() !== walletKey || !walletKey) {
        return { status: 'wallet_mismatch' };
    }
    node.tasks_completed = (Number(node.tasks_completed) || 0) + 1;
    const assignedReward = Number((JSON.parse(raw) as { reward_gstd?: unknown }).reward_gstd);
    const rewardGstd = Number.isFinite(assignedReward) && assignedReward >= 0 ? assignedReward : fallbackReward;
    const nodeShare = Math.round(rewardGstd * (1 - communityTax) * 1e6) / 1e6;
    const communityShare = Math.round(rewardGstd * communityTax * 1e6) / 1e6;
    node.gstd_earned = Math.round(((Number(node.gstd_earned) || 0) + rewardGstd) * 1e6) / 1e6;
    node.last_seen = timestamp;
    memSet(nodeKey, JSON.stringify(node), nodeTtlSec);
    const increment = (key: string, amount: number) => {
        memSet(key, String((parseFloat(memGet(key) || '0') || 0) + amount));
    };
    increment('stats:total_tasks_completed', 1);
    if (rewardGstd > 0 && memGet(`reward_seen:${taskId}`) === null) {
        memSet(`reward_seen:${taskId}`, '1', 604800);
        increment(`rewards:pending:${walletKey}`, nodeShare);
        increment(`rewards:lifetime:${nodeId}`, nodeShare);
        increment('rewards:treasury', communityShare);
        increment('stats:total_gstd_paid', rewardGstd);
        memSet(`rewards:node_wallet:${nodeId}`, walletKey);
    }
    memDel(assignmentKey);
    memSet(completionKey, JSON.stringify({ node_id: nodeId, assignment: raw }), completionTtlSec);
    return { status: 'completed', assignment: raw };
}

export async function kvGetDelForNode(key: string, nodeId: string): Promise<string | null> {
    const r = await getRedis();
    if (r) {
        const script = `
            local value = redis.call('GET', KEYS[1])
            if not value then return nil end
            local ok, assignment = pcall(cjson.decode, value)
            if not ok or assignment.node_id ~= ARGV[1] then return nil end
            redis.call('DEL', KEYS[1])
            return value
        `;
        try {
            const value = await r.eval<[string], unknown>(script, [key], [nodeId]);
            if (value == null) return null;
            return typeof value === 'string' ? value : JSON.stringify(value);
        } catch (e) { handleRedisFailure(`kvGetDelForNode('${key}')`, e); }
    }
    const value = memGet(key);
    if (!value) return null;
    try {
        if (JSON.parse(value).node_id !== nodeId) return null;
    } catch {
        memDel(key);
        return null;
    }
    memDel(key);
    return value;
}

export async function kvDel(key: string): Promise<void> {
    const r = await getRedis();
    if (r) { try { await r.del(key); return; } catch (e) { handleRedisFailure(`kvDel('${key}')`, e); } }
    memDel(key);
}

export async function kvKeys(prefix: string): Promise<string[]> {
    const safePrefix = prefix.replace(/\*+$/, '');
    const r = await getRedis();
    if (r) {
        try {
            const keys = await r.keys(`${safePrefix}*`);
            return keys as string[];
        } catch (e) { handleRedisFailure(`kvKeys('${safePrefix}')`, e); }
    }
    return memKeys(safePrefix);
}

export async function kvIncrByFloat(key: string, delta: number): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.incrbyfloat(key, delta); }
        catch (e) { handleRedisFailure(`kvIncrByFloat('${key}')`, e); }
    }
    const cur = parseFloat(memGet(key) || '0') + delta;
    memSet(key, String(cur));
    return cur;
}

export async function kvMGet(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const r = await getRedis();
    if (r) {
        try {
            const vals = await r.mget(...keys);
            return (vals as (unknown | null)[]).map(v => v == null ? null : String(v));
        } catch (e) { handleRedisFailure(`kvMGet(${keys.length} keys)`, e); }
    }
    return keys.map(k => memGet(k));
}

// ── Queue helpers (LPUSH / RPOP) ───────────────────────────────────

export async function kvPush(key: string, ...values: string[]): Promise<void> {
    const r = await getRedis();
    if (r) {
        try { await r.lpush(key, ...values); return; } catch (e) { handleRedisFailure(`kvPush('${key}')`, e); }
    }
    const raw = memGet(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    list.push(...values);
    memSet(key, JSON.stringify(list));
}

export async function kvPop(key: string): Promise<string | null> {
    const r = await getRedis();
    if (r) {
        try {
            const val = await r.rpop(key);
            return val == null ? null : String(val);
        } catch (e) { handleRedisFailure(`kvPop('${key}')`, e); }
    }
    const raw = memGet(key);
    if (!raw) return null;
    const list: string[] = JSON.parse(raw);
    const val = list.shift() ?? null;
    if (list.length > 0) memSet(key, JSON.stringify(list));
    else memDel(key);
    return val;
}

export async function kvLLen(key: string): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.llen(key); } catch (e) { handleRedisFailure(`kvLLen('${key}')`, e); }
    }
    const raw = memGet(key);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
}

export async function kvIncr(key: string): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.incr(key); }
        catch (e) { handleRedisFailure(`kvIncr('${key}')`, e); }
    }
    const cur = parseInt(memGet(key) || '0', 10) + 1;
    memSet(key, String(cur));
    return cur;
}
