/**
 * GET /api/v1/models/catalog
 * Full model catalog from Ollama registry + HuggingFace GGUF.
 * Returns RAM requirements, categories, and live availability from the GSTD swarm.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet } from '../../../../lib/kv';

export interface ModelEntry {
    id:           string;   // pull ID (e.g. "llama3.1:8b" or "hf.co/org/model")
    name:         string;
    family:       string;
    source:       'ollama' | 'huggingface';
    category:     string;   // 'chat' | 'code' | 'vision' | 'embedding' | 'reasoning'
    ram_gb:       number;   // minimum RAM to run
    params_b:     number;   // parameter count in billions
    context_k:    number;   // context window in thousands of tokens
    tier:         1 | 2 | 3 | 4;  // matches pull-models.sh hardware tiers
    description:  string;
    license:      string;
    available_nodes?: number; // live count from swarm
}

const CATALOG: ModelEntry[] = [
    // ── Tier 1: Pi / 4GB nodes ──────────────────────────────────────
    {
        id: 'llama3.2:3b', name: 'Llama 3.2 3B', family: 'llama', source: 'ollama',
        category: 'chat', ram_gb: 3, params_b: 3, context_k: 128, tier: 1,
        description: 'Meta\'s fastest Llama model. Excellent for Pi nodes and mobile.',
        license: 'Meta Llama 3.2 Community License',
    },
    {
        id: 'llama3.2:1b', name: 'Llama 3.2 1B', family: 'llama', source: 'ollama',
        category: 'chat', ram_gb: 1.5, params_b: 1, context_k: 128, tier: 1,
        description: 'Ultra-compact Llama for edge devices with 2GB RAM.',
        license: 'Meta Llama 3.2 Community License',
    },
    {
        id: 'phi3:mini', name: 'Phi-3 Mini', family: 'phi', source: 'ollama',
        category: 'chat', ram_gb: 2.5, params_b: 3.8, context_k: 128, tier: 1,
        description: 'Microsoft\'s compact model with strong reasoning at small size.',
        license: 'MIT',
    },
    {
        id: 'gemma2:2b', name: 'Gemma 2 2B', family: 'gemma', source: 'ollama',
        category: 'chat', ram_gb: 2, params_b: 2, context_k: 8, tier: 1,
        description: 'Google\'s compact open model with competitive performance.',
        license: 'Gemma Terms of Use',
    },
    {
        id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', family: 'qwen', source: 'ollama',
        category: 'chat', ram_gb: 3, params_b: 3, context_k: 32, tier: 1,
        description: 'Alibaba\'s compact multilingual model, strong in Asian languages.',
        license: 'Apache 2.0',
    },
    // ── Tier 2: 8GB nodes ───────────────────────────────────────────
    {
        id: 'llama3.1:8b', name: 'Llama 3.1 8B', family: 'llama', source: 'ollama',
        category: 'chat', ram_gb: 5, params_b: 8, context_k: 128, tier: 2,
        description: 'Balanced Llama model for general-purpose chat and reasoning.',
        license: 'Meta Llama 3.1 Community License',
    },
    {
        id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', family: 'qwen', source: 'ollama',
        category: 'chat', ram_gb: 4.5, params_b: 7, context_k: 128, tier: 2,
        description: 'Strong analytical model from Alibaba with 128K context.',
        license: 'Apache 2.0',
    },
    {
        id: 'mistral:7b', name: 'Mistral 7B', family: 'mistral', source: 'ollama',
        category: 'chat', ram_gb: 4, params_b: 7, context_k: 32, tier: 2,
        description: 'Creative writing and instruction following.',
        license: 'Apache 2.0',
    },
    {
        id: 'mistral-nemo:12b', name: 'Mistral NeMo 12B', family: 'mistral', source: 'ollama',
        category: 'chat', ram_gb: 7, params_b: 12, context_k: 128, tier: 2,
        description: 'Mistral + NVIDIA collaboration. Strong multilingual chat.',
        license: 'Apache 2.0',
    },
    {
        id: 'codellama:7b', name: 'Code Llama 7B', family: 'codellama', source: 'ollama',
        category: 'code', ram_gb: 4, params_b: 7, context_k: 16, tier: 2,
        description: 'Meta\'s code-specialized Llama. Python, JS, C++ and 20+ languages.',
        license: 'Meta Llama 2 Community License',
    },
    {
        id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder 6.7B', family: 'deepseek', source: 'ollama',
        category: 'code', ram_gb: 4, params_b: 6.7, context_k: 16, tier: 2,
        description: 'Specialized code generation model from DeepSeek.',
        license: 'DeepSeek License',
    },
    {
        id: 'nomic-embed-text', name: 'Nomic Embed Text', family: 'nomic', source: 'ollama',
        category: 'embedding', ram_gb: 0.5, params_b: 0.137, context_k: 8, tier: 2,
        description: 'High-quality text embeddings for RAG and semantic search.',
        license: 'Apache 2.0',
    },
    // ── Tier 3: 16GB nodes ──────────────────────────────────────────
    {
        id: 'phi3:medium', name: 'Phi-3 Medium', family: 'phi', source: 'ollama',
        category: 'chat', ram_gb: 8, params_b: 14, context_k: 128, tier: 3,
        description: 'Microsoft\'s best small model. Punches above its weight class.',
        license: 'MIT',
    },
    {
        id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', family: 'qwen', source: 'ollama',
        category: 'chat', ram_gb: 9, params_b: 14, context_k: 128, tier: 3,
        description: 'Strong reasoning and multilingual, excellent for enterprise tasks.',
        license: 'Apache 2.0',
    },
    {
        id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', family: 'deepseek', source: 'ollama',
        category: 'reasoning', ram_gb: 9, params_b: 14, context_k: 64, tier: 3,
        description: 'Chain-of-thought reasoning model. Strong at math and logic.',
        license: 'MIT',
    },
    {
        id: 'codellama:13b', name: 'Code Llama 13B', family: 'codellama', source: 'ollama',
        category: 'code', ram_gb: 8, params_b: 13, context_k: 16, tier: 3,
        description: 'Larger code model for complex multi-file projects.',
        license: 'Meta Llama 2 Community License',
    },
    {
        id: 'llava:13b', name: 'LLaVA 13B', family: 'llava', source: 'ollama',
        category: 'vision', ram_gb: 8, params_b: 13, context_k: 4, tier: 3,
        description: 'Visual language model — understand images + text.',
        license: 'Apache 2.0',
    },
    {
        id: 'mixtral:8x7b', name: 'Mixtral 8x7B MoE', family: 'mistral', source: 'ollama',
        category: 'chat', ram_gb: 26, params_b: 47, context_k: 32, tier: 3,
        description: 'Mixture-of-Experts architecture. High quality at lower inference cost.',
        license: 'Apache 2.0',
    },
    // ── Tier 4: 32GB flagship nodes ─────────────────────────────────
    {
        id: 'llama3.1:70b', name: 'Llama 3.1 70B', family: 'llama', source: 'ollama',
        category: 'chat', ram_gb: 40, params_b: 70, context_k: 128, tier: 4,
        description: 'Meta\'s most capable open model. Near-GPT-4 class performance.',
        license: 'Meta Llama 3.1 Community License',
    },
    {
        id: 'qwen2.5:32b', name: 'Qwen 2.5 32B', family: 'qwen', source: 'ollama',
        category: 'chat', ram_gb: 20, params_b: 32, context_k: 128, tier: 4,
        description: 'Alibaba\'s flagship open model. Deep reasoning, 128K context.',
        license: 'Apache 2.0',
    },
    {
        id: 'deepseek-r1:70b', name: 'DeepSeek R1 70B', family: 'deepseek', source: 'ollama',
        category: 'reasoning', ram_gb: 40, params_b: 70, context_k: 64, tier: 4,
        description: 'OpenAI o1-class chain-of-thought reasoning. Best open reasoner.',
        license: 'MIT',
    },
    {
        id: 'codellama:70b', name: 'Code Llama 70B', family: 'codellama', source: 'ollama',
        category: 'code', ram_gb: 40, params_b: 70, context_k: 100, tier: 4,
        description: 'Flagship code model. Handles large codebases and complex refactors.',
        license: 'Meta Llama 2 Community License',
    },
    // ── HuggingFace GGUF models (ollama pull hf.co/...) ─────────────
    {
        id: 'hf.co/bartowski/Phi-3.5-mini-instruct-GGUF', name: 'Phi-3.5 Mini Instruct', family: 'phi', source: 'huggingface',
        category: 'chat', ram_gb: 3, params_b: 3.8, context_k: 128, tier: 1,
        description: 'Latest Phi-3.5 from HuggingFace GGUF. Optimized for instruction following.',
        license: 'MIT',
    },
    {
        id: 'hf.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', name: 'Llama 3.1 8B Instruct (HF)', family: 'llama', source: 'huggingface',
        category: 'chat', ram_gb: 5, params_b: 8, context_k: 128, tier: 2,
        description: 'HuggingFace GGUF quantized Llama 3.1 8B with instruction fine-tuning.',
        license: 'Meta Llama 3.1 Community License',
    },
    {
        id: 'hf.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF', name: 'Qwen 2.5 Coder 7B', family: 'qwen', source: 'huggingface',
        category: 'code', ram_gb: 5, params_b: 7, context_k: 128, tier: 2,
        description: 'Qwen\'s dedicated code model from HuggingFace. Strong at code generation and debugging.',
        license: 'Apache 2.0',
    },
    {
        id: 'hf.co/mradermacher/DeepSeek-R1-GGUF', name: 'DeepSeek R1 (HF GGUF)', family: 'deepseek', source: 'huggingface',
        category: 'reasoning', ram_gb: 40, params_b: 70, context_k: 64, tier: 4,
        description: 'Full DeepSeek R1 from HuggingFace GGUF. Best open-source reasoner.',
        license: 'MIT',
    },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    const { tier, category, source, min_ram, available_only } = req.query;

    // Count live nodes per model from swarm heartbeat data
    const nodeKeys = await kvKeys('node:*').catch(() => [] as string[]);
    const modelNodeCount = new Map<string, number>();

    for (const key of nodeKeys) {
        const raw = await kvGet(key).catch(() => null);
        if (!raw) continue;
        try {
            const node = JSON.parse(raw as string);
            const caps: string[] = node.capabilities || node.models || [];
            for (const cap of caps) {
                modelNodeCount.set(cap, (modelNodeCount.get(cap) || 0) + 1);
            }
        } catch { /* skip malformed */ }
    }

    let catalog = CATALOG.map(m => ({
        ...m,
        available_nodes: modelNodeCount.get(m.id) || 0,
    }));

    // Filters
    if (tier) catalog = catalog.filter(m => m.tier === Number(tier));
    if (category) catalog = catalog.filter(m => m.category === category);
    if (source) catalog = catalog.filter(m => m.source === source);
    if (min_ram) catalog = catalog.filter(m => m.ram_gb <= Number(min_ram));
    if (available_only === 'true') catalog = catalog.filter(m => (m.available_nodes || 0) > 0);

    return res.status(200).json({
        total:   catalog.length,
        models:  catalog,
        sources: {
            ollama:       'https://ollama.com/library',
            huggingface:  'https://huggingface.co/models?library=gguf',
        },
        pull_command: 'POST /api/v1/models/pull { model_id, node_url }',
        timestamp: Date.now(),
    });
}
