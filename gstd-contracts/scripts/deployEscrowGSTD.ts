import { Address, toNano } from '@ton/core';
import { EscrowGSTD } from '../wrappers/EscrowGSTD';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // Admin Wallet address (receives platform fees)
    // Address: UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED (non-bounceable)
    const ADMIN_WALLET = Address.parse("UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED");
    
    // Owner address (same as admin for simplicity, can be different)
    const OWNER_ADDRESS = ADMIN_WALLET;

    console.log('🚀 Начинаем деплой EscrowGSTD контракта...');
    console.log('📋 Параметры:');
    console.log('   Owner:', OWNER_ADDRESS.toString());
    console.log('   Admin Wallet:', ADMIN_WALLET.toString());
    console.log('   GSTD Jetton:', 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO');

    const escrow = provider.open(await EscrowGSTD.fromInit(
        OWNER_ADDRESS,    // Owner
        ADMIN_WALLET      // Admin Wallet (receives platform fees)
    ));

    console.log('\n📤 Отправка транзакции деплоя...');
    console.log('   Сумма: 0.15 TON (газ + storage fee)');

    await escrow.send(
        provider.sender(),
        {
            value: toNano('0.15'), // Gas + Storage Fee
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    console.log('\n⏳ Ожидание подтверждения деплоя...');
    await provider.waitForDeploy(escrow.address);

    console.log('\n✅ КОНТРАКТ УСПЕШНО ЗАДЕПЛОЕН!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 АДРЕС КОНТРАКТА (bounceable):');
    console.log('   ' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('\n📍 АДРЕС КОНТРАКТА (non-bounceable):');
    console.log('   ' + escrow.address.toString({ bounceable: false, urlSafe: true }));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 ОБНОВИТЕ docker-compose.yml:');
    console.log('   TON_CONTRACT_ADDRESS=' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('\n📝 ОБНОВИТЕ .env (если используется):');
    console.log('   TON_CONTRACT_ADDRESS=' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('   ADMIN_WALLET=UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED');
    console.log('   GSTD_JETTON_ADDRESS=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO');
    console.log('\n✅ Готово! Контракт готов к использованию.');
}
