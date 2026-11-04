import {it,expect,vi,afterEach} from 'vitest';
vi.mock('@opennextjs/cloudflare',()=>({getCloudflareContext:vi.fn()}));
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {escrowRuntimeSecret} from './escrowRuntimeSecrets';
import {mainnetRpcConfigured} from './mainnetJobs';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('reads a newly added Worker secret without requiring a build-time process.env entry',()=>{
 vi.stubEnv('ESCROW_MAINNET_TONCENTER_API_KEY','');
 vi.mocked(getCloudflareContext).mockReturnValue({env:{ESCROW_MAINNET_TONCENTER_API_KEY:'runtime-mainnet-fixture'}} as any);
 expect(escrowRuntimeSecret('ESCROW_MAINNET_TONCENTER_API_KEY')).toBe('runtime-mainnet-fixture');expect(mainnetRpcConfigured()).toBe(true);
});
it('prefers request-scoped bindings, separates networks and falls back only outside a Worker',()=>{
 vi.stubEnv('ESCROW_MAINNET_TONCENTER_API_KEY','process-mainnet-fixture');
 vi.mocked(getCloudflareContext).mockReturnValue({env:{ESCROW_MAINNET_TONCENTER_API_KEY:'bound-mainnet-fixture',ESCROW_TESTNET_TONCENTER_API_KEY:'bound-testnet-fixture'}} as any);
 expect(escrowRuntimeSecret('ESCROW_MAINNET_TONCENTER_API_KEY')).toBe('bound-mainnet-fixture');
 expect(escrowRuntimeSecret('ESCROW_TESTNET_TONCENTER_API_KEY')).toBe('bound-testnet-fixture');
 vi.mocked(getCloudflareContext).mockImplementation(()=>{throw Error('no Worker context');});
 expect(escrowRuntimeSecret('ESCROW_MAINNET_TONCENTER_API_KEY')).toBe('process-mainnet-fixture');
 expect(()=>escrowRuntimeSecret('UNRELATED_PRIVATE_KEY')).toThrow('unsupported_escrow_secret');
});
