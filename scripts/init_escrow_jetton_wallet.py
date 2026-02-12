#!/usr/bin/env python3
"""
Инициализация Jetton-кошелька GSTD для Escrow-контракта.

Jetton-кошелёк создаётся автоматически при первом переводе GSTD на адрес Escrow.
Скрипт отправляет минимальную сумму (0.01 GSTD) для создания кошелька.

Требования:
- Кошелёк-отправитель с GSTD (>= 0.01) и TON для газа (~0.05)
- INIT_ESCROW_WALLET_MNEMONIC или путь к wallet.json (~/.gstd/wallet.json, /data/.gstd/wallet.json)

Использование:
  INIT_ESCROW_WALLET_MNEMONIC="word1 word2 ..." python3 scripts/init_escrow_jetton_wallet.py
  python3 scripts/init_escrow_jetton_wallet.py  # использует ~/.gstd/wallet.json
"""
import os
import sys
import json

# Escrow и GSTD из .env
ESCROW_ADDRESS = os.getenv("TON_CONTRACT_ADDRESS", "EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi")
GSTD_JETTON = os.getenv("GSTD_JETTON_ADDRESS", "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO")
AMOUNT_GSTD = 0.01  # Минимальная сумма для создания кошелька
COMMENT = "init_jetton_wallet"


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    for p in [os.path.join(root, "A2A", "python-sdk"), root]:
        if p not in sys.path:
            sys.path.insert(0, p)
    try:
        from gstd_a2a.gstd_wallet import GSTDWallet
    except ImportError:
        print("❌ Установите: cd A2A && pip install -e python-sdk")
        sys.exit(1)

    mnemonic = os.getenv("INIT_ESCROW_WALLET_MNEMONIC")
    wallet_path = None
    for p in [os.path.expanduser("~/.gstd/wallet.json"), "/data/.gstd/wallet.json"]:
        if os.path.exists(p):
            wallet_path = p
            break

    if mnemonic:
        wallet = GSTDWallet(mnemonic=mnemonic)
    elif wallet_path:
        wallet = GSTDWallet.load(wallet_path)
    else:
        print("❌ Укажите INIT_ESCROW_WALLET_MNEMONIC или ~/.gstd/wallet.json с GSTD")
        sys.exit(1)

    print(f"📤 Отправитель: {wallet.address[:12]}...{wallet.address[-8:]}")
    print(f"📥 Escrow: {ESCROW_ADDRESS}")
    print(f"💰 Сумма: {AMOUNT_GSTD} GSTD (создание Jetton-кошелька)")

    bal = wallet.check_gstd_balance()
    if bal < AMOUNT_GSTD:
        print(f"❌ Недостаточно GSTD: {bal:.4f} (нужно >= {AMOUNT_GSTD})")
        print(f"   Отправьте вручную: {ESCROW_ADDRESS}, {AMOUNT_GSTD} GSTD, комментарий: {COMMENT}")
        sys.exit(1)
    print(f"✅ Баланс GSTD: {bal:.4f}")

    api_key = os.getenv("TON_API_KEY")
    result = wallet.send_gstd(
        to_address=ESCROW_ADDRESS,
        amount_gstd=AMOUNT_GSTD,
        comment=COMMENT,
        jetton_master_address=GSTD_JETTON,
        api_key=api_key,
    )

    if "error" in result:
        print(f"❌ Ошибка отправки: {result['error']}")
        print(f"   Отправьте вручную: {ESCROW_ADDRESS}, {AMOUNT_GSTD} GSTD")
        sys.exit(1)

    print(f"✅ Jetton-кошелёк создан! Tx: {result.get('tx_hash', result)}")
    sys.exit(0)


if __name__ == "__main__":
    main()
