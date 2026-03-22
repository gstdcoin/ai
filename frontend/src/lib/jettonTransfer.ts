/**
 * jettonTransfer.ts — Real GSTD Jetton transfer via TonConnect
 *
 * Builds a proper TEP-74 jetton transfer message:
 *   1. Query the GSTD jetton master to resolve the sender's jetton wallet
 *   2. Build the transfer Cell (op=0xf8a7ea5)
 *   3. Return a TonConnect-compatible transaction object
 *
 * Requires: @ton/ton and @ton/core (already used by @ston-fi/sdk)
 */

import { GSTD_CONTRACT_ADDRESS, ADMIN_WALLET_ADDRESS } from './config';

// ── Constants ──────────────────────────────────────────────────
const JETTON_TRANSFER_OP = 0xf8a7ea5;
const TON_CENTER_API = 'https://toncenter.com/api/v2';

// ── Types ──────────────────────────────────────────────────────
export interface JettonTransferParams {
  /** Recipient address (where GSTD tokens arrive) */
  recipientAddress: string;
  /** GSTD amount (human-readable, e.g. 10.5) */
  amount: number;
  /** Sender's TON wallet address (from TonConnect) */
  senderAddress: string;
  /** Optional forward comment (UTF-8 text) */
  comment?: string;
  /** Gas attached to the internal message (TON, default 0.05) */
  gasTon?: number;
  /** Forward TON amount for notification (default 0.01) */
  forwardTon?: number;
}

export interface TonConnectTransaction {
  validUntil: number;
  messages: Array<{
    address: string;
    amount: string;
    payload?: string;
  }>;
}

// ── Resolve sender's jetton wallet address ────────────────────
export async function resolveJettonWallet(
  ownerAddress: string,
  jettonMaster: string = GSTD_CONTRACT_ADDRESS,
): Promise<string> {
  // Use TON API to get jetton wallet address
  try {
    // Try tonapi.io first (more reliable)
    const res = await fetch(
      `https://tonapi.io/v2/accounts/${encodeURIComponent(ownerAddress)}/jettons/${encodeURIComponent(jettonMaster)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.wallet_address?.address) {
        return data.wallet_address.address;
      }
    }

    // Fallback: use toncenter get_wallet_address method on jetton master
    const rpcRes = await fetch(`${TON_CENTER_API}/runGetMethod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: jettonMaster,
        method: 'get_wallet_address',
        stack: [['tvm.Slice', ownerAddress]],
      }),
    });
    if (rpcRes.ok) {
      const rpcData = await rpcRes.json();
      const walletAddr = rpcData?.result?.stack?.[0]?.[1]?.bytes;
      if (walletAddr) return walletAddr;
    }
  } catch (err) {
    console.warn('Jetton wallet resolution failed, using estimate:', err);
  }

  // If all else fails, throw
  throw new Error('Could not resolve jetton wallet. Make sure you have GSTD tokens.');
}

// ── Build TonConnect transaction for jetton transfer ──────────
export async function buildJettonTransferTx(
  params: JettonTransferParams,
): Promise<TonConnectTransaction> {
  const {
    recipientAddress,
    amount,
    senderAddress,
    comment = '',
    gasTon = 0.065,
    forwardTon = 0.01,
  } = params;

  // Dynamic import to avoid SSR issues
  const { beginCell, toNano, Address } = await import('@ton/core');

  // 1. Resolve sender's GSTD jetton wallet
  const senderJettonWallet = await resolveJettonWallet(senderAddress);

  // 2. Build forward payload (comment)
  let forwardPayload = beginCell().endCell();
  if (comment) {
    forwardPayload = beginCell()
      .storeUint(0, 32) // op = 0 means text comment
      .storeStringTail(comment)
      .endCell();
  }

  // 3. Build the TEP-74 transfer body
  const transferBody = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32) // op: jetton transfer
    .storeUint(0, 64) // query_id
    .storeCoins(toNano(amount.toString())) // jetton amount
    .storeAddress(Address.parse(recipientAddress)) // destination
    .storeAddress(Address.parse(senderAddress)) // response_destination (excess back to sender)
    .storeBit(false) // no custom_payload
    .storeCoins(toNano(forwardTon.toString())) // forward_ton_amount
    .storeBit(true) // forward_payload in ref
    .storeRef(forwardPayload)
    .endCell();

  // 4. Build TonConnect transaction
  return {
    validUntil: Math.floor(Date.now() / 1000) + 600, // 10 min
    messages: [
      {
        address: senderJettonWallet, // send to sender's jetton wallet contract
        amount: toNano(gasTon.toString()).toString(), // gas for the transfer
        payload: transferBody.toBoc().toString('base64'),
      },
    ],
  };
}

// ── Convenience: build staking deposit tx ─────────────────────
export async function buildStakingDepositTx(
  senderAddress: string,
  gstdAmount: number,
  lockDays: number,
): Promise<TonConnectTransaction> {
  return buildJettonTransferTx({
    recipientAddress: ADMIN_WALLET_ADDRESS, // treasury / staking contract
    amount: gstdAmount,
    senderAddress,
    comment: `stake:${lockDays}d`,
    gasTon: 0.08, // slightly more gas for contract processing
    forwardTon: 0.02,
  });
}

// ── Convenience: build signal purchase tx ─────────────────────
export async function buildSignalPurchaseTx(
  senderAddress: string,
  signalId: string,
  priceGstd: number,
): Promise<TonConnectTransaction> {
  return buildJettonTransferTx({
    recipientAddress: ADMIN_WALLET_ADDRESS,
    amount: priceGstd,
    senderAddress,
    comment: `signal:${signalId}`,
  });
}

// ── Convenience: build bridge deposit tx ──────────────────────
export async function buildBridgeDepositTx(
  senderAddress: string,
  orderId: string,
  gstdAmount: number,
  destAddress: string,
): Promise<TonConnectTransaction> {
  return buildJettonTransferTx({
    recipientAddress: destAddress, // send directly to counterparty in P2P
    amount: gstdAmount,
    senderAddress,
    comment: `bridge:${orderId}`,
  });
}
