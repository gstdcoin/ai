import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvSet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const hasRedisUrl   = !!(process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL);
    const hasRedisToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);

    // Write a test key, read it back
    let writeRead = 'untested';
    try {
        await kvSet('debug:ping', 'pong', 30);
        const val = await kvGet('debug:ping');
        writeRead = val === 'pong' ? 'ok' : `got: ${val}`;
    } catch (e: any) {
        writeRead = `error: ${e.message}`;
    }

    const nodeUrlKeys  = await kvKeys('node_url:').catch(() => []);
    const nodeKeys     = await kvKeys('node:').catch(() => []);

    return res.status(200).json({
        redis_url_set:    hasRedisUrl,
        redis_token_set:  hasRedisToken,
        write_read_test:  writeRead,
        node_url_keys:    nodeUrlKeys,
        node_keys:        nodeKeys,
    });
}
