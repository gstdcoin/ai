/** Public deployment policy. Recipients explicitly selected by the owner: node payout wallet. */
export const MAINNET_ESCROW = Object.freeze({
 bootstrapNode:'d8edbeee-909a-49e5-908d-922b9bf98c43',version:1,network:'-239' as const,mode:'controlled_pilot' as const,
 master:'0:efe9c616f673622a337737097c0fa0018d4887d6061f59519985f3fbfbdb59b2',
 decimals:9,
 protocol:'0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9',
 reserve:'0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9',
 pilotPayers:['0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9'] as readonly string[],
 walletCodeHash:'a46ef8746f4ea669c2ce9455be129b693cd1c638cb021faaac58c7df01e0a163',
 coordinatorCodeHash:'4ea8dbe18b3bf18207703e8c64fef6fc9b1e2ead8a533f9cd5aab84e08a72717',
 shareCodeHash:'c364ece101f8156c13755dfd013d427e8438bb425435e7a317a240e3a403f8d9',
 maxBudgetNano:'1000000000',maxTokens:512,minExecutionWindowSeconds:300,
});
