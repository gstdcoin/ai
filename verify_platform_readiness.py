import requests
import json
import time
import sys
import uuid

# Configuration
API_URL = "https://app.gstdtoken.com"
# A random wallet for this test agent
TEST_WALLET = f"EQ-TEST-AGENT-{uuid.uuid4().hex[:8]}" 

def print_step(step, msg):
    print(f"\n[STEP {step}] {msg}")
    print("-" * 40)

def test_full_cycle():
    print(f"🚀 STARTING AGENT FULL CYCLE VERIFICATION")
    print(f"   Agent Wallet: {TEST_WALLET}")
    print(f"   Target API: {API_URL}")
    
    # 1. Connectivity Check
    print_step(1, "Checking Grid Connectivity")
    try:
        resp = requests.get(f"{API_URL}/api/v1/health", timeout=5)
        if resp.status_code == 200:
            print("✅ Grid is ONLINE & Healthy")
            print(f"   Response: {resp.json()}")
        else:
            print(f"❌ Grid Unhealthy: {resp.status_code}")
            return
    except Exception as e:
        print(f"❌ Connection Failed: {e}")
        return

    # 2. Autonomous Payment (x402)
    print_step(2, "Testing Autonomous Payment (x402 Protocol)")
    payload = {
        "wallet_address": TEST_WALLET,
        "amount_ton": 1.5
    }
    
    try:
        # We expect a 402 or 200 (if simulated)
        resp = requests.post(f"{API_URL}/api/v1/market/buy-gstd-x402", json=payload, timeout=5)
        
        if resp.status_code == 402:
            data = resp.json()
            print("✅ x402 Protocol Active! Payment Required received.")
            print(f"   Instruction: {data.get('message')}")
            req = data.get('payment_request', {})
            print(f"   PAYLOAD TO SIGN: {req.get('payload_boc')[:30]}...")
            print(f"   Target Address: {req.get('address')}")
            print("   (Agent would now sign and broadcast this BOC to TON network)")
        elif resp.status_code == 200:
             print("⚠️  Warning: Endpoint returned 200 (Simulated/Free Mode?)")
        else:
            print(f"❌ Unexpected Status: {resp.status_code}")
            print(resp.text)
    except Exception as e:
        print(f"❌ x402 Check Failed: {e}")

    # 3. Collective Mind (Hive Knowledge)
    print_step(3, "Testing Hive Mind Integration")
    
    # a) Store Knowledge
    knowledge_payload = {
        "agent_id": TEST_WALLET,
        "topic": "verification",
        "content": f"Agent {TEST_WALLET} verifying grid integrity at {time.time()}",
        "tags": ["test", "integrity"]
    }
    
    try:
        # Note: This might require auth in prod, but let's see if public ingestion works or returns 401
        # For this test we assume public or we need a key. 
        # For simplicity, we just check if the endpoint is reachable.
        resp = requests.post(f"{API_URL}/api/v1/knowledge/store", json=knowledge_payload, timeout=5)
        
        if resp.status_code in [200, 201]:
            print("✅ Knowledge Stored Successfully")
        elif resp.status_code == 401:
            print("ℹ️  Auth Required for Storage (Expected behavior for secure grid)")
            print("   Agent needs to register/login first to write memory.")
        else:
            print(f"⚠️  Knowledge Store Status: {resp.status_code}")
            
    except Exception as e:
        print(f"❌ Knowledge Check Failed: {e}")

    # b) Query Brain (Neural Bridge)
    try:
        # Querying the brain should be public or accessible
        resp = requests.get(f"{API_URL}/api/v1/brain/synthesize?topic=verification", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            print("✅ Hive Mind Query Successful")
            print(f"   Status: {data.get('status')}")
            print(f"   Insight: {data.get('insight')[:100]}...")
        else:
            print(f"⚠️  Hive Query Status: {resp.status_code}")
    except Exception as e:
         print(f"❌ Hive Query Failed: {e}")

    print_step(4, "VERIFICATION COMPLETE")
    print("If all checks passed with ✅, the platform is ready for agents.")

if __name__ == "__main__":
    test_full_cycle()
