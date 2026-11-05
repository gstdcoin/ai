import {MAINNET_ESCROW} from './mainnetEscrowManifest';
/** Explicit token identities, never ticker-only links or inferred cross-chain assets. */
export const GSTD_PURCHASE=Object.freeze({
 network:'TON mainnet (-239)',
 master:MAINNET_ESCROW.master,
 friendlyMaster:'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
 usdtMaster:'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
 wallet:'https://tonkeeper.com/',
});
export function gstdSwapLink(source:'TON'|'USDT'){
 const params=new URLSearchParams({ft:source==='TON'?'TON':GSTD_PURCHASE.usdtMaster,tt:GSTD_PURCHASE.friendlyMaster});
 return 'https://app.ston.fi/swap?'+params.toString();
}
