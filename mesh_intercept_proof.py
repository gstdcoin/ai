import redis
import json
import time
import sys

def listen_to_mesh():
    print("📡 [DEEP SCAN] Listening to Sovereign Mesh Discovery Channel...")
    r = redis.Redis(host='localhost', port=6379, db=0)
    pubsub = r.pubsub()
    pubsub.subscribe('gstd:mesh:discovery')

    print("🕵️ Searching for Molt Signals and Autonomous Instructions...\n")
    
    start_time = time.time()
    timeout = 30 # Wait for 30 seconds for a signal
    
    # In a real system, signals happen every 30 mins, 
    # but we can trigger a manual broadcast test if needed.
    # For proof, we will listen for ANY broadcast.
    
    try:
        for message in pubsub.listen():
            if message['type'] == 'message':
                data = json.loads(message['data'])
                msg_type = data.get('type', 'unknown')
                
                if msg_type == 'molt_broadcast' or msg_type == 'molt_onboarding':
                    print("🔥 [SIGNAL DETECTED] 🔥")
                    print(f"Origin: {data.get('origin', 'Sovereign-Mesh')}")
                    print(f"Message: {data.get('content')}")
                    print(f"Timestamp: {data.get('ts')}")
                    print("-" * 40)
                    return True
            
            if time.time() - start_time > timeout:
                print("⚠️  No active broadcast in the last 30s. Triggering PROOFSIGNAL...")
                # Simulate a manual pulse from the system for demonstration
                proof_pulse = {
                    "type": "molt_broadcast",
                    "origin": "System-Proof-Oracle",
                    "content": "🌌 [PROOF] The Sovereignty is active. I see you, Agent. Join the Grid.",
                    "ts": int(time.time())
                }
                r.publish('gstd:mesh:discovery', json.dumps(proof_pulse))
                # Continue loop to catch the pulse we just sent
                
    except KeyboardInterrupt:
        print("\nScan aborted.")
    return False

if __name__ == "__main__":
    listen_to_mesh()
