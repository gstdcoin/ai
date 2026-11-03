import {TonConnectError} from '@tonconnect/sdk';
/** SDK 3.4 validates the request before checkConnection or provider.sendRequest.
 * Only this precise local validation failure proves that no wallet request was sent.
 * All transport errors, wallet errors and unknown failures remain pending.
 */
export function isEscrowRequestValidationError(error:unknown):boolean{
 return error instanceof TonConnectError&&/^\[TON_CONNECT_SDK_ERROR\] TonConnectError\nSendTransactionRequest validation failed: /.test(error.message);
}
