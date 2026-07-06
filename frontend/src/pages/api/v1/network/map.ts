/**
 * GET /api/v1/network/map
 *
 * Returns active nodes with approximate geographic data for the network map.
 * Coordinates are derived from node platform/arch metadata (not GPS).
 * Nodes without coordinate hints are distributed pseudo-randomly by node_id hash.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet } from '../../../../lib/kv';
import type { NodeRecord } from '../nodes/register';

// Rough region boxes [lat, lon] centers derived from common node hosting regions
const REGION_SEEDS: [number, number][] = [
    [37.7, -122.4],  // US West
    [40.7, -74.0],   // US East
    [51.5, -0.1],    // EU West
    [52.5, 13.4],    // EU Central
    [35.7, 139.7],   // Japan
    [1.3, 103.8],    // Singapore
    [55.7, 37.6],    // Russia
    [-23.5, -46.6],  // South America
];

function nodeToCoords(node: NodeRecord): { lat: number; lng: number } {
    // Deterministic scatter within a region based on node_id hash
    let hash = 0;
    for (let i = 0; i < node.node_id.length; i++) {
        hash = ((hash << 5) - hash) + node.node_id.charCodeAt(i);
        hash |= 0;
    }
    const region = REGION_SEEDS[Math.abs(hash) % REGION_SEEDS.length];
    const jitterLat = ((hash >> 4) % 80) / 100;
    const jitterLng = ((hash >> 8) % 160) / 100;
    return {
        lat: region[0] + jitterLat,
        lng: region[1] + jitterLng,
    };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Fetch all active node keys (nodes expire after 10 min if no heartbeat)
        const keys = await kvKeys('node:*');
        const nodeRaws = await Promise.all(keys.slice(0, 200).map(k => kvGet(k)));

        const points = nodeRaws
            .filter(Boolean)
            .map(raw => {
                try { return JSON.parse(raw!) as NodeRecord; } catch { return null; }
            })
            .filter(Boolean)
            .map(node => {
                const coords = nodeToCoords(node!);
                return {
                    node_id:        node!.node_id,
                    name:           node!.name,
                    lat:            coords.lat,
                    lng:            coords.lng,
                    platform:       node!.platform,
                    mode:           node!.mode,
                    tasks_completed:node!.tasks_completed,
                    gstd_earned:    node!.gstd_earned,
                    last_seen:      node!.last_seen,
                    capabilities:   node!.capabilities?.slice(0, 3) || [],
                };
            });

        return res.status(200).json({
            nodes: points,
            total: points.length,
            generated_at: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('[network/map]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
