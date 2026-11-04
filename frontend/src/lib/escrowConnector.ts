import TonConnect,{CHAIN} from '@tonconnect/sdk';
// Connection migration only. Existing escrow drafts and pending-operation records stay under v1.
export const testnetConnectionPrefix='gstd_escrow_testnet_connection_v2:';
export function createEscrowConnector(origin:string,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>):TonConnect{
 const connector=new TonConnect({manifestUrl:new URL('/tonconnect-testnet-manifest.json',origin).toString(),storage:{
  getItem:async key=>storage.getItem(testnetConnectionPrefix+key),
  setItem:async(key,value)=>{storage.setItem(testnetConnectionPrefix+key,value);},
  removeItem:async key=>{storage.removeItem(testnetConnectionPrefix+key);},
 }});
 connector.setConnectionNetwork(CHAIN.TESTNET);
 return connector;
}

export const mainnetConnectionPrefix='gstd_escrow_mainnet_connection_v1:';
export function createMainnetEscrowConnector(origin:string,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>):TonConnect{
 const connector=new TonConnect({manifestUrl:new URL('/tonconnect-mainnet-escrow-manifest.json',origin).toString(),storage:{getItem:async key=>storage.getItem(mainnetConnectionPrefix+key),setItem:async(key,value)=>{storage.setItem(mainnetConnectionPrefix+key,value);},removeItem:async key=>{storage.removeItem(mainnetConnectionPrefix+key);}}});
 connector.setConnectionNetwork(CHAIN.MAINNET);return connector;
}
