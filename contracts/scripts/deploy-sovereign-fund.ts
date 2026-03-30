import { toNano } from '@ton/core';
import { SovereignFund } from '../build/SovereignFund/SovereignFund_SovereignFund';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address!;
    console.log('Deploying SovereignFund as', owner.toString());

    const fund = provider.open(await SovereignFund.fromInit(owner));

    await fund.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(fund.address);

    console.log('SovereignFund deployed at: ', fund.address.toString());
    
    // Output integration addresses for backend integration
    console.log('NEXT_PUBLIC_FUND_ADDRESS=', fund.address.toString());
}
