import { contractAddress } from '@ton/core';
import { EscrowComplete } from '../build/EscrowComplete/EscrowComplete_EscrowComplete';

async function main() {
    console.log("Compiling/Loading init data...");
    const init = await EscrowComplete.init();
    const address = contractAddress(0, init);
    console.log("Contract Address (Bounceable):", address.toString({ bounceable: true, urlSafe: true }));
    console.log("Contract Address (Non-Bounceable):", address.toString({ bounceable: false, urlSafe: true }));
    console.log("Contract Address (Raw):", address.toRawString());
}

main().catch(console.error);
