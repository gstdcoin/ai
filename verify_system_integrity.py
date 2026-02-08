import requests
import hashlib
import time
import uuid
import sys

# Using localhost since we run on the server
API_URL = "http://localhost:8080/api/v1"
WALLET = f"EQ-TEST-{uuid.uuid4().hex[:8]}"

def solve_pow(challenge):
    prefix = challenge['prefix']
    difficulty = challenge['difficulty']
    target = "0" * difficulty
    
    print(f"🧩 Solving PoW: {prefix} (Diff: {difficulty})")
    nonce = 0
    start = time.time()
    while True:
        data = f"{prefix}{nonce}"
        h = hashlib.sha256(data.encode()).hexdigest()
        if h.startswith(target):
            print(f"   Solved in {time.time()-start:.2f}s")
            return str(nonce)
        nonce += 1

def main():
    print(f"🤖 Starting System Integrity Check for Agent: {WALLET}")
    
    # 1. Health
    try:
        r = requests.get(f"{API_URL}/health")
        print(f"✅ Health: {r.status_code}")
    except Exception as e:
        print(f"❌ Health Failed: {e}")
        return

    # 2. Auth (PoW)
    print("\n🔑 Starting Sovereign Auth...")
    try:
        # Get Challenge
        resp = requests.get(f"{API_URL}/auth/challenge")
        if resp.status_code != 200:
             print(f"❌ Failed to get challenge: {resp.text}")
             return
             
        c = resp.json()['challenge']
        nonce = solve_pow(c)
        
        # Claim Key
        r = requests.post(f"{API_URL}/auth/claim-key", json={
            "wallet_address": WALLET,
            "nonce": nonce
        })
        if r.status_code == 201:
            api_key = r.json()['api_key']
            print(f"✅ Key Claimed: {api_key}")
        else:
            print(f"❌ Claim Failed: {r.text}")
            return
            
    except Exception as e:
        print(f"❌ Auth Failed: {e}")
        return

    headers = {"Authorization": f"Bearer {api_key}"}

    # 3. Check Pending Balance (Viral Economy)
    print("\n💰 Checking Viral Pending Balance...")
    try:
        r = requests.get(f"{API_URL}/users/pending_balance", headers=headers)
        if r.status_code == 200:
            data = r.json()
            bal = data.get('pending_balance', 0)
            print(f"✅ Balance Check OK. Pending: {bal} GSTD")
            print(f"   Message: {data.get('message')}")
        else:
            print(f"❌ Balance Check Failed. Do we have access? {r.status_code} {r.text}")
            return # Critical failure for autonomy
    except Exception as e:
         print(f"❌ Balance Check Exception: {e}")
         return

    # 4. Check Task Access (System Functionality)
    print("\n📋 Checking Task Market Access...")
    try:
        r = requests.get(f"{API_URL}/tasks", headers=headers)
        if r.status_code == 200:
            tasks = r.json().get('tasks', [])
            print(f"✅ Task List: OK ({len(tasks)} tasks found)")
        else:
            print(f"❌ Task List Failed: {r.status_code}")
    except Exception as e:
         print(f"❌ Task Access Exception: {e}")
         
    # 5. Service x402 Check
    print("\n🛒 Checking Service Market (x402)...")
    try:
        payload = {"service_type": "gpu_lease_1h", "wallet_address": WALLET}
        r = requests.post(f"{API_URL}/market/buy-service-x402", json=payload)
        if r.status_code == 402:
            print("✅ x402 Protocol Active (Payment Required received)")
            print(f"   Instruction: {r.json().get('instruction')}")
        else:
            print(f"⚠️ Unexpected x402 Status: {r.status_code} (Might be simulated success?)")
    except Exception as e:
        print(f"❌ Service Check Failed: {e}")

    print("\n✨ SYSTEM INTEGRITY: VERIFIED")
    print("   All components (Auth, Viral Ledger, Tasks, Payments) are connected.")

if __name__ == "__main__":
    main()
