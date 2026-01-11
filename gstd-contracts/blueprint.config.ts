import { Config } from '@ton/blueprint';

export const config: Config = {
    network: {
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        version: 'v2',
        type: 'mainnet', // Mainnet configuration
    },
    requestTimeout: 15_000, // 15 seconds
};

// Force mainnet for TonConnect
// Note: When using TonConnect, the network is determined by the wallet connection
// Make sure your wallet (Tonkeeper) is connected to MAINNET, not testnet
