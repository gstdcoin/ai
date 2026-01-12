import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { EscrowComplete } from '../build/EscrowComplete/EscrowComplete_EscrowComplete';
import '@ton/test-utils';

describe('EscrowComplete', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowComplete: SandboxContract<EscrowComplete>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        escrowComplete = blockchain.openContract(await EscrowComplete.fromInit());

        deployer = await blockchain.treasury('deployer');

        const deployResult = await escrowComplete.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowComplete.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and escrowComplete are ready to use
    });
});
