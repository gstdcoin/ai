const fs = require('fs');

const FILE_PATH = '/home/ubuntu/frontend/src/pages/monitor/index.tsx';
let content = fs.readFileSync(FILE_PATH, 'utf-8');

const newContent = `const ACTIVE_SIGNALS: GlobalSignal[] = [
    // ─── MEV & ARBITRAGE ───────────────────────────────────────────
    {
        id: 'mev_mempool', title: 'Mempool MEV Alpha Sniping',
        description: 'Scan Ethereum and Solana mempools for unbribed DEX transactions to front-run or sandwich attack for instant risk-free yield.',
        source: 'Jito / Flashbots', severity: 'critical', location: 'Solana/ETH Mempool',
        dataVolume: '45.8 TB/s', icon: Zap, color: 'text-amber-400', bgColor: 'bg-amber-500/10',
        starsCost: 3500, gstdReward: 280, platformFee: 70, category: 'MEV & Arbitrage',
        progress: 92, contributors: 412, impact: 'Extract $1.2M daily from inefficient router paths'
    },
    {
        id: 'cross_chain_arb', title: 'Cross-Chain Liquidity Arbitrage',
        description: 'Detect 10+ millisecond discrepancies in token pricing between Binance, OKX, and on-chain DEXes to execute highly profitable flash loans.',
        source: 'Binance / OKX / Raydium', severity: 'high', location: 'Global CEX/DEX',
        dataVolume: '18.1 PB/day', icon: Network, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'MEV & Arbitrage',
        progress: 88, contributors: 320, impact: 'Capitalize on CEX/DEX spread lagging'
    },
    
    // ─── ALPHA & TOKENOMICS ────────────────────────────────────────
    {
        id: 'memecoin_prophet', title: 'Memecoin Sentiment Prophet',
        description: 'NLP analysis over 1M+ Telegram and Twitter crypto groups to detect organic virality of newly deployed memecoins before pump.',
        source: 'Twitter / Telegram Firehose', severity: 'critical', location: 'Crypto Twitter',
        dataVolume: '5.2 TB/hr', icon: Flame, color: 'text-orange-400', bgColor: 'bg-orange-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Alpha & Tokens',
        progress: 95, contributors: 890, impact: 'Predict 100x memecoin runs 2 hours in advance'
    },
    {
        id: 'whale_tracker', title: 'On-Chain Whale Copy-Trading',
        description: 'AI clustering of historical profitable whale wallets. Automatically front-runs trades of 14,000+ top performing smart money addresses.',
        source: 'Nansen / Arkham', severity: 'high', location: 'Smart Money Wallets',
        dataVolume: '850 GB/day', icon: TrendingUp, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10',
        starsCost: 4000, gstdReward: 320, platformFee: 80, category: 'Alpha & Tokens',
        progress: 76, contributors: 610, impact: 'Mirror trades of top 1% most profitable accounts'
    },
    {
        id: 'insider_wallet_detect', title: 'Insider Wallet Clustering',
        description: 'Graph analysis connecting fund deployments ahead of major CEX listings (Binance/Upbit) to identify dev & insider wallets.',
        source: 'Etherscan / Solscan API', severity: 'high', location: 'Layer 1 Chains',
        dataVolume: '1.2 TB/day', icon: PersonStanding, color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-500/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Alpha & Tokens',
        progress: 60, contributors: 215, impact: 'Detect dev-controlled token dumps'
    },

    // ─── SECURITY & EXPLOITS ────────────────────────────────────────
    {
        id: 'zero_day_scanner', title: '0-Day Contract Exploit Scanner',
        description: 'Simulate symbolic execution across all newly deployed EVM and Solana smart contracts to find logic vulnerabilities for white-hat or black-hat mitigation.',
        source: 'On-Chain Bytecode', severity: 'critical', location: 'All Blockchains',
        dataVolume: '2.4 TB/sync', icon: ShieldCheck, color: 'text-rose-400', bgColor: 'bg-rose-500/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Security',
        progress: 81, contributors: 145, impact: 'Discover $500M+ in smart contract vulnerabilities'
    },
    {
        id: 'rug_pull_detect', title: 'Honeypot & Rug Pull Preventer',
        description: 'Decompile contract states to identify hidden mint functions, blocked transfers, and liquidity lock evasion in fresh tokens.',
        source: 'GoPlus Security V3', severity: 'medium', location: 'DEX Listings',
        dataVolume: '14 GB/min', icon: AlertTriangle, color: 'text-red-400', bgColor: 'bg-red-500/10',
        starsCost: 1500, gstdReward: 120, platformFee: 30, category: 'Security',
        progress: 98, contributors: 1200, impact: 'Save users from buying un-sellable tokens'
    },

    // ─── DEFI & YIELD ──────────────────────────────────────────────
    {
        id: 'yield_farming_opt', title: 'Autonomous Yield Farming',
        description: 'Autocompound and bridge assets dynamically across 40+ chains to chase highest risk-adjusted APY in lending pools and liquidity farms.',
        source: 'DefiLlama / Protocols', severity: 'high', location: 'Layer 1 / Layer 2',
        dataVolume: '1.2 TB/day', icon: Database, color: 'text-sky-400', bgColor: 'bg-sky-500/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'DeFi & Yield',
        progress: 64, contributors: 430, impact: 'Boost portfolio APY by automatically hunting yields'
    },
    {
        id: 'liq_drain_predict', title: 'Liquidity Drain Predictor',
        description: 'Monitor LP token withdraws and unbonding queues to predict when a pool is about to collapse, exiting our positions before a crash.',
        source: 'Curve / Uniswap V3', severity: 'high', location: 'DEX Pools',
        dataVolume: '400 GB/hr', icon: Droplets, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'DeFi & Yield',
        progress: 55, contributors: 310, impact: 'Avoid impermanent loss and sudden LP drains'
    },

    // ─── AI & AUTONOMY ─────────────────────────────────────────────
    {
        id: 'ai_agent_war', title: 'Autonomous AI Agent Wars',
        description: 'Deploy aggressive market-making AI agents that corner orderbooks and squeeze opponent bots out of liquidity matrixes.',
        source: 'GSTD Neural Net', severity: 'critical', location: 'Deep Web',
        dataVolume: '1.1 PB/sec', icon: BrainCircuit, color: 'text-violet-400', bgColor: 'bg-violet-500/10',
        starsCost: 10000, gstdReward: 800, platformFee: 200, category: 'AI Autonomy',
        progress: 42, contributors: 95, impact: 'Win the algorithmic trading warfare'
    },
    {
        id: 'sybil_airdrop', title: 'Industrial Sybil Airdrop Farming',
        description: 'Manage 50,000+ AI-driven wallet behaviors mimicking real human interactions to farm maximum token allocations on upcoming Layer 2 airdrops.',
        source: 'ZkSync / LayerZero / Base', severity: 'medium', location: 'Testnets / Mainnets',
        dataVolume: '3.4 TB/day', icon: Target, color: 'text-pink-400', bgColor: 'bg-pink-500/10',
        starsCost: 4500, gstdReward: 360, platformFee: 90, category: 'AI Autonomy',
        progress: 89, contributors: 1400, impact: 'Automate massive scale airdrop extraction'
    }
];

const CATEGORIES = ['All', ...Array.from(new Set(ACTIVE_SIGNALS.map(s => s.category)))];

const CATEGORY_COLORS: Record<string, string> = {
    'MEV & Arbitrage': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    'Alpha & Tokens': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Security': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    'DeFi & Yield': 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    'AI Autonomy': 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
};

const CATEGORY_I18N: Record<string, string> = {
    'All': 'all_signals',
    'MEV & Arbitrage': 'cat_mev',
    'Alpha & Tokens': 'cat_alpha',
    'Security': 'cat_security',
    'DeFi & Yield': 'cat_defi',
    'AI Autonomy': 'cat_ai',
};
`

let startStr = 'const ACTIVE_SIGNALS: GlobalSignal[] = [';
let endStr = 'const SEVERITY_I18N: Record<string, string> = {';

let split1 = content.split(startStr);
if (split1.length < 2) {
    console.log("Could not find start str");
    process.exit(1);
}

let split2 = split1[1].split(endStr);
if (split2.length < 2) {
    console.log("Could not find end str");
    process.exit(1);
}

let finalContent = split1[0] + newContent + '\n' + endStr + split2[1];
fs.writeFileSync(FILE_PATH, finalContent);
console.log("Rewrite successful!");
