# Free-tier request budget

Updated 2026-10-26. Keep the existing Cloudflare free plan; no paid resources or extra services are required by this change.

- One inference poller per integrated node. PlatformLink polls after 30 seconds of idle time and wakes immediately when its gateway submits a real chat task. After successful work it briefly checks again after five seconds. Other task kinds remain supported by the separate slower general queue.
- Inference polling backs off from 60 seconds to five minutes on errors, respects numeric Retry-After on quota/server errors, and prevents chat wakeups from bypassing that backoff. Concurrent polls are coalesced.
- The redundant SwarmAgent priority loop is not started in the integrated node. General non-inference polling is once per minute. Registry peer refresh is once per five minutes rather than multiple times per minute. Direct P2P transport remains active.
- Signed PlatformLink and uptime heartbeats are four minutes apart, inside the ten-minute liveness lease. The old unsigned cron heartbeat for a duplicate Pi alias is removed from this installation, with its previous crontab backed up.
- Public website status uses one statistics request every two minutes, rather than statistics plus health every minute. Hidden tabs pause periodic work. Platform public dashboards also refresh every two minutes. The shared polling hook pauses hidden tabs and prevents overlapping callbacks.
- Statistics expose historical registration events separately; repeated registrations are not additional physical nodes or offline machines. Registry totals describe currently retained, deduplicated records, not an independently audited lifetime hardware count.

For the changed idle node loops, configured schedules fall from roughly 42,000 to 5,000 platform requests/day (about 88% fewer). This is a schedule estimate, not a Cloudflare usage measurement or total-account guarantee. Actual traffic also includes users, tasks, other modules and deployments. A directly submitted queue task after a long idle period can wait up to 30 seconds for pickup; gateway chat wakes the worker immediately. No task type is removed.

Cache headers can reduce repeat client/Redis work, but Worker-side Cache API alone does not eliminate incoming Worker invocations. Budget claims must distinguish those costs. Never cache wallet, authenticated results, task assignment, heartbeat or Telegram webhook mutations as public data. Do not add aggressive availability probes or repeated preview deployments as a workaround for quota exhaustion.
