const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { TonClient, WalletContractV4 } = require('@ton/ton');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
let mnemonic = process.env.DEPLOYER_MNEMONIC;

async function execute() {
    if (!mnemonic) {
        // Read from local deployer.json if exists
        const deployerPath = path.join(__dirname, '..', 'deployer.json');
        if (fs.existsSync(deployerPath)) {
            const data = JSON.parse(fs.readFileSync(deployerPath, 'utf8'));
            mnemonic = data.mnemonic;
        } else {
            // Generate new
            const newMnemonic = await mnemonicNew();
            mnemonic = newMnemonic.join(' ');
            fs.writeFileSync(deployerPath, JSON.stringify({ mnemonic }, null, 2));
            console.log("✅ Сгенерирован новый кошелек для деплоя (deployer.json)");
        }
    } else {
        console.log("✅ Используется DEPLOYER_MNEMONIC из .env");
    }

    const key = await mnemonicToPrivateKey(mnemonic.split(' '));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const address = wallet.address.toString({ testOnly: false, bounceable: false });

    console.log("\n=======================================================");
    console.log("🚀 АДРЕС ДЛЯ ДЕПЛОЯ (Deployer Address):");
    console.log(address);
    console.log("=======================================================\n");

    const endpoints = {
        mainnet: 'https://toncenter.com/api/v2/jsonRPC',
        testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    };
    
    // Check balance on both just in case, default mainnet
    const client = new TonClient({
        endpoint: endpoints.mainnet,
    });

    try {
        const balance = await client.getBalance(wallet.address);
        const tonBalance = Number(balance) / 1e9;
        console.log(`💰 Текущий баланс на Mainnet: ${tonBalance} TON`);
        
        if (tonBalance < 1.5) {
            console.log(`⚠️ ВНИМАНИЕ: Баланс ${tonBalance} TON. Ожидание пополнения 1.5 TON на адрес:\n${address}`);
            while (true) {
                await new Promise(r => setTimeout(r, 10000));
                const newBalance = await client.getBalance(wallet.address);
                const newTonBalance = Number(newBalance) / 1e9;
                if (newTonBalance >= 1.5) {
                    console.log(`✅ Пополнение получено! Текущий баланс: ${newTonBalance} TON`);
                    break;
                }
                process.stdout.write(".");
            }
        }
        
        console.log("✅ Баланс достаточен для деплоя! Запускаю deploy-mainnet.js...");
    } catch (err) {
        console.error("Ошибка при проверке баланса:", err.message);
    }
}

execute();
