# Reviewed host offers

The public catalog is at `/host-offers` with filters for GPU, minimum single-device VRAM and exact inference model. It shows the full current GSTD ledger price per request with a USD reference. The API exposes the executor, protocol and reserve shares and the market observation timestamp. The existing checkout fixes the amount in an expiring request quote. The catalog has no hourly rental or on-chain gas charge per API request.

The Worker binding `GSTD_VERIFIED_HOST_GPUS` is an operator-maintained JSON array of reviews. Leave it unset until GPU hardware has been independently inspected. Each entry contains:

- `node_id` and the verified registry `public_key`
- `endpoint`, matching the exact verified HTTPS origin
- `gpu` and `vram_mib`, recorded from the inspected device
- `checked_at`, the UTC time of the review in Unix milliseconds

Record one inspected GPU per node. Verify the hardware and device memory on the host, run a local model with GPU offload, and bind the result to the node’s verified endpoint key. Replace the review if the GPU, endpoint or key changes. A review expires after 30 days. The catalog requires a live endpoint proof, linked payout, an active offer and availability outside scheduled maintenance. A node heartbeat cannot create a hardware review. The proof binds the endpoint to the node, and the hardware review comes from the operator’s inspection.
