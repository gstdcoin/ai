// GSTD Mobile Worker Core (v1.2.0 - Ascension: Zero-Leakage)
// Eco-Mining: Adaptive scaling, power profiles, user activity detection, zero-touch maintenance

const VERSION = "1.2.0-ascension";
const NOOP = () => {};
const log = (typeof self !== 'undefined' && self.location && self.location.hostname === 'localhost') ? (...args) => { try { self.console?.log?.apply(self.console, args); } catch (_) {} } : NOOP;
const CACHE_NAME = "gstd-model-cache-v1";

// Power profiles: eco (battery/wear), balance, max
let powerProfile = 'balance';
let isCharging = false;
let userActive = false; // User activity detection
let lastUserActivity = Date.now();
const USER_IDLE_MS = 60000; // 1 min = consider idle
const STORAGE_THRESHOLD = 0.10; // Zero-Touch: clear cache when free < 10%

// 1. Battery Awareness
if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
        isCharging = battery.charging;
        battery.addEventListener('chargingchange', () => {
            isCharging = battery.charging;
            adjustWorkload();
        });
    });
}

// 2. User Activity Detection (main thread sends user_active via postMessage)
function setUserActive(active) {
    userActive = !!active;
    if (active) lastUserActivity = Date.now();
    adjustWorkload();
}

// 3. Power profile setter (called from main thread via postMessage)
function setPowerProfile(profile) {
    if (['eco', 'balance', 'max'].includes(profile)) {
        powerProfile = profile;
        adjustWorkload();
    }
}

// 4. Zero-Touch Maintenance: check storage, clear cache when < 10% free
async function checkStorageAndClean() {
    if (!navigator.storage?.estimate) return false;
    try {
        const { usage, quota } = await navigator.storage.estimate();
        if (!quota || quota === 0) return false;
        const freePct = 1 - (usage / quota);
        if (freePct < STORAGE_THRESHOLD) {
            const cacheNames = await caches?.keys?.() || [];
            for (const name of cacheNames) {
                if (name.startsWith('gstd-') || name === CACHE_NAME) {
                    await caches.delete(name);
                }
            }
            if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
                const dbs = await indexedDB.databases?.();
                for (const d of dbs || []) {
                    if (d.name && (d.name.includes('GSTD') || d.name.includes('gstd'))) {
                        indexedDB.deleteDatabase(d.name);
                    }
                }
            }
            postMessage({ status: 'maintenance', action: 'cache_cleared', freePct });
            return true;
        }
    } catch (e) { /* ignore */ }
    return false;
}

// 5. Should accept task? (Adaptive Resource Scaling)
function shouldAcceptTask(task) {
    if (powerProfile === 'max') return true;
    if (powerProfile === 'eco') {
        if (!isCharging && task.priority !== 'high') return false;
        if (userActive) return false; // Don't compete with user
    }
    if (powerProfile === 'balance') {
        if (!isCharging && task.priority !== 'high') return false;
        if (userActive) {
            const idleMs = Date.now() - lastUserActivity;
            if (idleMs < 30000) return false; // User just active, throttle
        }
    }
    return true;
}

function adjustWorkload() {
    const mode = isCharging ? 'max' : (powerProfile === 'eco' ? 'eco' : 'balance');
    postMessage({ status: 'workload_adjusted', mode, isCharging, powerProfile });
}

// 6. Main Work Loop
self.onmessage = async (e) => {
    const task = e.data;
    if (task.type === 'set_power_profile') {
        setPowerProfile(task.profile);
        return;
    }
    if (task.type === 'user_active') {
        setUserActive(task.active);
        return;
    }
    if (task.type === 'check_maintenance') {
        await checkStorageAndClean();
        return;
    }
    if (task.type === 'inference') {
        await checkStorageAndClean();
        if (!shouldAcceptTask(task)) {
            postMessage({ status: 'skipped', reason: 'adaptive_throttle', powerProfile, userActive: !!userActive });
            return;
        }
        log(`[Worker] Task ${task.id} (profile=${powerProfile})`);
        const result = await runInference(task.model, task.input);
        postMessage({ status: 'completed', result });
    }
};

async function runInference(modelPath, input) {
    const start = performance.now();
    let hash = 0;
    const iter = powerProfile === 'max' ? 1000000 : powerProfile === 'eco' ? 300000 : 700000;
    for (let i = 0; i < iter; i++) {
        hash = (hash + i) * 1.0001;
    }
    const latency = performance.now() - start;
    return {
        output: "simulated_tensor_output",
        latency_ms: latency,
        device: "mobile_arm",
        power_profile: powerProfile
    };
}

// 7. Offline Resilience (IndexedDB)
const DB_NAME = 'GSTD_Offline_Cache';
const DB_VERSION = 1;
let db;

const initDB = () => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains('results')) {
            db.createObjectStore('results', { keyPath: 'id' });
        }
    };
    request.onsuccess = (e) => (db = e.target.result);
};

initDB();

self.addEventListener('online', async () => {
    if (!db) return;
    const tx = db.transaction(['results'], 'readonly');
    const store = tx.objectStore('results');
    store.getAll().onsuccess = (e) => {
        const results = e.target.result;
        if (results.length > 0) {
            postMessage({ status: 'sync_offline', data: results });
            const delTx = db.transaction(['results'], 'readwrite');
            delTx.objectStore('results').clear();
        }
    };
});
