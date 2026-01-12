import { Address, toNano, beginCell, contractAddress } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { EscrowComplete } from '../build/EscrowComplete/EscrowComplete_EscrowComplete';

export async function run(provider: NetworkProvider) {
    // Admin Wallet address (receives platform fees)
    // Address: UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED (non-bounceable)
    const ADMIN_WALLET = Address.parse("UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED");
    
    // Owner address (same as admin for simplicity, can be different)
    const OWNER_ADDRESS = ADMIN_WALLET;

    console.log('🚀 Начинаем деплой EscrowComplete контракта на MAINNET...');
    console.log('⚠️ ВНИМАНИЕ: Это MAINNET деплой с реальными TON!');
    console.log('📋 Параметры:');
    console.log('   Owner:', OWNER_ADDRESS.toString());
    console.log('   Admin Wallet:', ADMIN_WALLET.toString());
    console.log('   GSTD Jetton:', 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO');
    console.log('   Network: MAINNET');
    console.log('\n⚠️ ВНИМАНИЕ: Используется упрощенная версия escrow_complete.tact');
    console.log('   без параметров инициализации (контракт без параметров).');

    // Get contract init (escrow_complete.tact doesn't have init parameters)
    const init = await EscrowComplete.init();
    
    // Calculate contract address
    const contractAddr = contractAddress(0, init);

    // Create contract instance
    const escrow = provider.open(
        EscrowComplete.fromAddress(contractAddr)
    );

    console.log('\n📤 Отправка транзакции деплоя на MAINNET...');
    console.log('   Сумма: 0.2 TON (газ + storage fee для mainnet)');
    console.log('   Адрес контракта:', escrow.address.toString({ bounceable: true, urlSafe: true }));

    // Send deploy transaction with init
    await provider.sender().send({
        to: escrow.address,
        value: toNano('0.2'), // More TON for mainnet
        init: init,
        body: beginCell().endCell(),
        bounce: false
    });

    console.log('\n⏳ Ожидание подтверждения деплоя на MAINNET...');
    await provider.waitForDeploy(escrow.address);

    console.log('\n✅ КОНТРАКТ УСПЕШНО ЗАДЕПЛОЕН НА MAINNET!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 АДРЕС КОНТРАКТА (bounceable):');
    console.log('   ' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('\n📍 АДРЕС КОНТРАКТА (non-bounceable):');
    console.log('   ' + escrow.address.toString({ bounceable: false, urlSafe: true }));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🌐 Просмотр на TONScan:');
    console.log('   https://tonscan.org/address/' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('\n📝 ОБНОВИТЕ docker-compose.yml:');
    console.log('   TON_CONTRACT_ADDRESS=' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('\n📝 ОБНОВИТЕ .env (если используется):');
    console.log('   TON_CONTRACT_ADDRESS=' + escrow.address.toString({ bounceable: true, urlSafe: true }));
    console.log('   ADMIN_WALLET=UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED');
    console.log('   GSTD_JETTON_ADDRESS=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO');
    console.log('\n✅ Готово! Контракт готов к использованию на MAINNET.');
    console.log('\n⚠️ ВАЖНО: Контракт escrow_complete.tact - упрощенная версия.');
    console.log('   Для production рекомендуется использовать версию с параметрами init().');
}
