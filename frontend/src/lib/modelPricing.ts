// GSTD cost per request by Ollama model ID
const MODEL_PRICES: Record<string, number> = {
    'auto': 0,
    'llama3.2:1b':     0,
    'llama3.2:3b':     0,
    'phi3:mini':       0,
    'gemma2:2b':       0,
    // Paid models
    'llama3.1:8b':     0.005,
    'qwen2.5:7b':      0.005,
    'mistral:7b':      0.005,
    'phi3:medium':     0.005,
    'qwen2.5:14b':     0.01,
    'deepseek-r1:14b': 0.02,
    'codellama:7b':    0.005,
    'codellama:13b':   0.01,
    'qwen2.5:32b':     0.03,
    'mixtral:8x7b':    0.02,
    'llama3.1:70b':    0.05,
    'deepseek-r1:70b': 0.08,
    // Odysseus special capabilities
    'odysseus-chat':     0.001,
    'odysseus-research': 0.05,
    'odysseus-docs':     0.02,
};

export function getModelPrice(model: string): number {
    return MODEL_PRICES[model] ?? 0.005;
}

export function isFreeModel(model: string): boolean {
    return (MODEL_PRICES[model] ?? -1) === 0;
}

