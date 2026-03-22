#!/usr/bin/env python3
"""
GSTD Platform Liveness Script
Real actions:
1. Agent heartbeat → earn GSTD every 60s
2. Groq AI signal generation every 4h → real predictions in DB
3. Node heartbeat every 5min → keeps node online
4. Market data contribution to collective memory
"""

import urllib.request, urllib.error
import json, subprocess, time, re, os, sys
from datetime import datetime

GROQ_KEY = "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"
AGENT_KEY = "gstd_agent_76e8b30fe7c86c5c22bdf40b446d3560f09b7db3d49e006a7a061d68b1ae2b75"
API_BASE = "https://api.gstdtoken.com/api/v1"
ONLINE_NODE = "UQBj9nFxLL4Aj8y3bbPZmksADuJKSrQk1mFsafDkgxBjaNsb"

def ts():
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

def http_post(url, data=None, headers={}):
    payload = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=payload, headers=headers, method='POST' if data else 'GET')
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def http_get(url, headers={}):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def get_pg():
    return subprocess.getoutput("docker ps --filter 'ancestor=postgres:15-alpine' --format '{{.Names}}' | head -1")

def get_cpu():
    try:
        stat1 = open('/proc/stat').readline().split()
        time.sleep(0.1)
        stat2 = open('/proc/stat').readline().split()
        idle1 = int(stat1[4])
        idle2 = int(stat2[4])
        total1 = sum(int(x) for x in stat1[1:])
        total2 = sum(int(x) for x in stat2[1:])
        return 1 - (idle2 - idle1) / (total2 - total1)
    except:
        return 0.3

def get_mem():
    try:
        with open('/proc/meminfo') as f:
            lines = {l.split(':')[0]: int(l.split()[1]) for l in f if ':' in l}
        total = lines.get('MemTotal', 1)
        free = lines.get('MemAvailable', 0)
        return 1 - free/total
    except:
        return 0.5

# 1. Agent heartbeat
def agent_heartbeat():
    try:
        cpu = get_cpu()
        mem = get_mem()
        res = http_post(f"{API_BASE}/agents/earn/heartbeat", {
            "cpu_usage": round(cpu, 3),
            "gpu_usage": 0,
            "ram_usage": round(mem, 3),
            "uptime_seconds": int(time.monotonic()),
            "tasks_done": 0
        }, {"Authorization": f"Bearer {AGENT_KEY}", "Content-Type": "application/json"})
        earned = res.get('net_reward', 0)
        print(f"[{ts()}] ♥ Agent heartbeat | CPU:{cpu*100:.1f}% RAM:{mem*100:.1f}% | +{earned:.6f} GSTD")
        return earned
    except Exception as e:
        print(f"[{ts()}] ⚠️ Agent heartbeat failed: {e}")
        return 0

# 2. Node heartbeat (keeps node online in the global map)
def node_heartbeat():
    try:
        res = http_post(f"{API_BASE}/nodes/heartbeat", {
            "wallet_address": ONLINE_NODE,
            "node_name": "GSTD-Server-SuperNode",
            "node_version": "3.4.0",
            "uptime_hours": int(time.monotonic() / 3600),
            "queries_served": 0,
            "is_mobile": False
        }, {"Content-Type": "application/json"})
        reward = res.get('reward', 0)
        reason = res.get('reason', res.get('message', 'ok'))
        print(f"[{ts()}] 📡 Node heartbeat | reward={reward:.4f} GSTD | {reason}")
    except Exception as e:
        print(f"[{ts()}] ⚠️ Node heartbeat: {e}")


# 3. Generate real AI signal via Groq
SIGNAL_PROMPTS = [
    ("crypto", "TON blockchain ecosystem March 2026, price $1.25. Give a precise 24h trading signal."),
    ("crypto", "Solana vs Ethereum gas fees Q1 2026. Which chain is gaining market share?"),
    ("gold", "Gold PAXG at $4491/oz March 2026. Federal Reserve policy impact on gold next 7 days."),
    ("forex", "USD strength index March 2026. Impact on crypto markets. 24h forex signal."),
    ("tech-trends", "GPU compute rental market Q1 2026. Distributed AI inference demand growth signal."),
    ("polymarket", "High-certainty prediction market event April 2026: give title, confidence, and rationale."),
    ("crypto", "GSTD token on TON DEX: liquidity pool analysis. Growth signal for next 30 days."),
    ("gold", "PAXG cross-chain bridge GSTD: arbitrage opportunity analysis as of March 2026."),
]

_signal_idx = [0]

def generate_ai_signal():
    idx = _signal_idx[0] % len(SIGNAL_PROMPTS)
    _signal_idx[0] += 1
    cat, prompt = SIGNAL_PROMPTS[idx]
    
    try:
        payload = json.dumps({
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": 'Output ONLY a JSON object. Keys: "title" (max 55 chars), "summary" (max 185 chars), "confidence" (float 0.6-0.95), "impact" ("low"/"medium"/"high"), "time_horizon" ("24h"/"7d"/"30d")'},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 220,
            "temperature": 0.15
        })
        
        # Use curl subprocess — avoids urllib 403 issues with Groq
        result = subprocess.run([
            'curl', '-s',
            'https://api.groq.com/openai/v1/chat/completions',
            '-H', f'Authorization: Bearer {GROQ_KEY}',
            '-H', 'Content-Type: application/json',
            '-d', payload
        ], capture_output=True, text=True, timeout=25)
        resp = json.loads(result.stdout)

        content = resp['choices'][0]['message']['content'].strip()
        m = re.search(r'\{[^{}]+\}', content, re.DOTALL)
        if not m:
            print(f"[{ts()}] ⚠️ Signal [{cat}] no JSON returned")
            return False
        
        data = json.loads(m.group())
        title   = data.get('title', 'Market Signal')[:55].replace("'", "")
        summary = data.get('summary', '')[:185].replace("'", "")
        conf    = float(data.get('confidence', 0.75))
        impact  = data.get('impact', 'medium')
        horizon = data.get('time_horizon', '24h')
        
        pg = get_pg()
        sql = (f"INSERT INTO prediction_signals "
               f"(id,category,title,summary,confidence,impact,time_horizon,price_gstd,is_premium,agent_name,agent_score,created_at) "
               f"VALUES (gen_random_uuid(),'{cat}','{title}','{summary}',{conf},'{impact}','{horizon}',0.50,false,'GSTD-SuperNode-LLM',0.88,NOW());")
        
        result = subprocess.run(['docker','exec',pg,'psql','-U','postgres','-d','distributed_computing','-c',sql],
                                capture_output=True, text=True)
        ok = 'INSERT 0 1' in result.stdout
        print(f"[{ts()}] {'✅' if ok else '❌'} Signal [{cat}]: {title[:48]}")
        return ok
        
    except Exception as e:
        print(f"[{ts()}] ❌ Signal [{cat}] error: {str(e)[:80]}")
        return False

# 4. Contribute live price data to collective memory
def contribute_market_knowledge():
    try:
        price = http_get(f"{API_BASE}/market/price", {"Authorization": f"Bearer {AGENT_KEY}"})
        gstd = price.get('gstd_price_usd', 0)
        gold = price.get('xaut_price_usd', 0)
        # Fallback: get gold from CoinGecko if not in market response
        if gold == 0 or gold < 1000:
            try:
                r = subprocess.run(['curl','-s','https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd'],
                                   capture_output=True, text=True, timeout=10)
                g = json.loads(r.stdout)
                gold = g['pax-gold']['usd']
            except: pass
        
        http_post(f"{API_BASE}/agents/memory/store", {
            "topic": "gstd_live_market",
            "content": f"[{ts()}] GSTD=${gstd:.10f} | Gold=${gold:.2f}/oz | Source: STON.fi DEX + CoinGecko",
            "tags": ["market", "price", "live", "gstd", "gold"]
        }, {"Authorization": f"Bearer {AGENT_KEY}", "Content-Type": "application/json"})
        print(f"[{ts()}] 🧠 Market: GSTD=${gstd:.8f}, Gold=${gold:.2f}")
    except Exception as e:
        print(f"[{ts()}] ⚠️ Knowledge store: {e}")


def main():
    print(f"[{ts()}] 🚀 GSTD Liveness Daemon starting...")
    print(f"[{ts()}] Agent: GSTD-SuperNode-Server-01")
    print(f"[{ts()}] Actions: heartbeat/60s, node-ping/5min, signal/4h, knowledge/30min")
    
    total_earned = 0
    tick = 0
    
    # Initial actions
    total_earned += agent_heartbeat()
    node_heartbeat()
    contribute_market_knowledge()
    generate_ai_signal()
    
    while True:
        time.sleep(60)
        tick += 1
        
        # Every minute: agent heartbeat
        earned = agent_heartbeat()
        total_earned += earned
        
        # Every 5 minutes: node heartbeat
        if tick % 5 == 0:
            node_heartbeat()
        
        # Every 30 minutes: market knowledge
        if tick % 30 == 0:
            contribute_market_knowledge()
        
        # Every 4 hours: generate new AI signals (3 in a row)
        if tick % 240 == 0:
            print(f"[{ts()}] 🔮 Generating fresh AI signals...")
            for _ in range(3):
                generate_ai_signal()
                time.sleep(3)
        
        # Every hour: log totals
        if tick % 60 == 0:
            print(f"[{ts()}] 📊 Session: {tick} heartbeats | {total_earned:.6f} GSTD earned total")

if __name__ == '__main__':
    main()
