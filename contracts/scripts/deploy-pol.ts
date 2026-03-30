import { toNano } from '@ton/core';
import { ProofOfLiquidity } from '../build/ProofOfLiquidity/ProofOfLiquidity_ProofOfLiquidity';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address!;
    console.log('Deploying ProofOfLiquidity as', owner.toString());

    const pol = provider.open(await ProofOfLiquidity.fromInit(owner));

    await pol.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(pol.address);

    console.log('ProofOfLiquidity deployed at: ', pol.address.toString());
}
