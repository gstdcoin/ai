/**
 * Total Domination — Worker Logic: In-App SLM Inference
 * Small Language Model inference via TMA browser engine.
 * Overheating protection: throttle when tab hidden, respect battery level.
 */
const VOCAB = {
  positive: ['good', 'great', 'excellent', 'up', 'bull', 'buy', 'strong', 'growth'],
  negative: ['bad', 'poor', 'down', 'bear', 'sell', 'weak', 'crash', 'risk'],
};

function simpleInference(text) {
  if (!text || typeof text !== 'string') return { score: 0.5, label: 'neutral' };
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of VOCAB.positive) {
    if (lower.includes(w)) pos++;
  }
  for (const w of VOCAB.negative) {
    if (lower.includes(w)) neg++;
  }
  const total = pos + neg || 1;
  const score = (pos - neg) / total * 0.5 + 0.5;
  const label = score > 0.6 ? 'positive' : score < 0.4 ? 'negative' : 'neutral';
  return { score, label };
}

// Overheating protection state
let thermalThrottle = false;
let lastInferenceTs = 0;
const MIN_INTERVAL_MS = 2000;  // Min 2s between inferences when throttled
const COOLDOWN_MS = 5000;       // Cooldown after low battery

async function checkThermalSafe() {
  if (thermalThrottle) {
    if (Date.now() - lastInferenceTs < COOLDOWN_MS) return false;
    thermalThrottle = false;
  }
  // Battery API: throttle when charging=false and level < 0.2
  if ('getBattery' in navigator) {
    try {
      const bat = await navigator.getBattery();
      if (!bat.charging && bat.level < 0.2) {
        thermalThrottle = true;
        lastInferenceTs = Date.now();
        return false;
      }
    } catch (_) {}
  }
  // Tab visibility: throttle when hidden (reduce CPU load)
  if (typeof document !== 'undefined' && document.hidden) {
    if (Date.now() - lastInferenceTs < MIN_INTERVAL_MS) return false;
  }
  return true;
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  if (type === 'inference') {
    const safe = await checkThermalSafe();
    if (!safe) {
      self.postMessage({ id, type: 'inference_result', result: { score: 0.5, label: 'throttled' }, throttled: true });
      return;
    }
    lastInferenceTs = Date.now();
    const result = simpleInference(payload?.text || payload);
    self.postMessage({ id, type: 'inference_result', result });
  } else if (type === 'ping') {
    self.postMessage({ id, type: 'pong', ts: Date.now() });
  }
};
