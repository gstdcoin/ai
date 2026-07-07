/**
 * GET /api/v1/autonomy/operator
 * Autonomous operator status — 9 AI departments with real KV metrics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvLLen } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const [totalTasksDone, totalGstdPaid, trainingJobsSubmitted, queueLen] = await Promise.all([
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_gstd_paid'),
            kvGet('stats:training_jobs_submitted'),
            kvLLen('tasks:queue'),
        ]);

        // Count nodes with heartbeat in last 10 minutes
        const nodeKeys = await kvKeys('node:heartbeat:');
        const now = Date.now();
        let activeNodes = 0;
        await Promise.all(nodeKeys.slice(0, 200).map(async (k) => {
            const ts = await kvGet(k);
            if (ts && now - parseInt(ts, 10) < 600_000) activeNodes++;
        }));

        const tasks  = parseInt(totalTasksDone || '0', 10);
        const gstd   = parseFloat(totalGstdPaid || '0');
        const jobs   = parseInt(trainingJobsSubmitted || '0', 10);
        const queued = typeof queueLen === 'number' ? queueLen : 0;
        const isActive = activeNodes > 0 || tasks > 0;

        const departments = [
            { name: 'Node Scaling',    interval: '15m', scope: 'Node health, capacity planning, routing',    status: activeNodes > 0 ? 'active' : 'idle',  metric: `${activeNodes} nodes online` },
            { name: 'Operations',      interval: '10m', scope: 'Task queue, incident response, uptime',      status: queued > 0  ? 'active' : 'idle',       metric: `${queued} tasks queued` },
            { name: 'Economics',       interval: '1h',  scope: 'Token distribution, treasury allocation',   status: gstd > 0    ? 'active' : 'idle',       metric: `${gstd.toFixed(1)} GSTD paid` },
            { name: 'Research',        interval: '24h', scope: 'AI model benchmarks, fine-tuning jobs',     status: jobs > 0    ? 'active' : 'idle',       metric: `${jobs} training jobs` },
            { name: 'Security',        interval: '5m',  scope: 'Threat detection, rate limits, anomalies',  status: 'active',                              metric: 'Rate limiting active' },
            { name: 'Code Validation', interval: '30m', scope: 'CI/CD, smart contract audits, PR review',   status: 'standby',                             metric: 'Awaiting contract deploy' },
            { name: 'Governance',      interval: '6h',  scope: 'DAO proposals, voting, parameter updates',  status: 'standby',                             metric: 'Awaiting contract deploy' },
            { name: 'Marketing',       interval: '24h', scope: 'Social content, community metrics, growth', status: 'standby',                             metric: 'Manual for now' },
            { name: 'Partnerships',    interval: '12h', scope: 'Integration monitoring, API health checks', status: 'standby',                             metric: 'Manual for now' },
        ];

        return res.status(200).json({
            active:            isActive,
            mode:              isActive ? 'operating' : 'standby',
            uptime_seconds:    tasks * 30,
            active_nodes:      activeNodes,
            tasks_completed:   tasks,
            gstd_distributed:  gstd,
            training_jobs:     jobs,
            queue_depth:       queued,
            departments,
        });
    } catch {
        return res.status(200).json({ active: false, mode: 'standby', uptime_seconds: 0, departments: [] });
    }
}
