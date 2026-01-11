import { Address, toNano } from '@ton/core';
import { EscrowComplete } from '../wrappers/EscrowComplete';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // Ваш единый адрес для владения и комиссии
    const MY_ADDRESS = Address.parse("UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED"); 

    const escrowComplete = provider.open(await EscrowComplete.fromInit(
        MY_ADDRESS, // Owner
        MY_ADDRESS  // Treasury
    ));

    console.log('🚀 Начинаем деплой EscrowComplete...');
    console.log('Используемый адрес:', MY_ADDRESS.toString());

    await escrowComplete.send(
        provider.sender(),
        {
            value: toNano('0.15'), // Газ + Storage Fee
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(escrowComplete.address);

    console.log('✅ КОНТРАКТ ЗАДЕПЛОЕН!');
    console.log('📍 АДРЕС КОНТРАКТА ДЛЯ .ENV:', escrowComplete.address.toString());
}
