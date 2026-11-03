import {TonConnectError,UserRejectsError,BadRequestError,UnknownError,WalletNotConnectedError,WalletWrongNetworkError,WalletNotSupportFeatureError} from '@tonconnect/sdk';
export const escrowWalletErrorCodes=['validation','rejected','bad_request','wallet_unknown','disconnected','wrong_network','unsupported','transport_or_ui'] as const;
export type EscrowWalletErrorCode=typeof escrowWalletErrorCodes[number];
/** SDK validation runs before transport. Production minification renames error classes. */
export function isEscrowRequestValidationError(error:unknown):boolean{
 return error instanceof TonConnectError&&/^\[TON_CONNECT_SDK_ERROR\] [^\r\n]+\nSendTransactionRequest validation failed: /.test(error.message);
}
/** Fixed public codes only: never expose provider messages, URLs, payloads or credentials. */
export function escrowWalletErrorCode(error:unknown):EscrowWalletErrorCode{
 if(isEscrowRequestValidationError(error))return 'validation';
 if(error instanceof UserRejectsError)return 'rejected';
 if(error instanceof BadRequestError)return 'bad_request';
 if(error instanceof WalletNotConnectedError)return 'disconnected';
 if(error instanceof WalletWrongNetworkError)return 'wrong_network';
 if(error instanceof WalletNotSupportFeatureError)return 'unsupported';
 if(error instanceof UnknownError)return 'wallet_unknown';
 return 'transport_or_ui';
}
