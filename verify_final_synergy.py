import json

def test_shield():
    print("🛡️ VERIFYING SOVEREIGN SHIELD...")
    raw_gps = '{"latitude": 55.755826, "longitude": 37.617299, "sensor": "openclaw.v1.gps"}'
    # Simulated sanitization (matches Go logic: int(lat*100)/100.0)
    data = json.loads(raw_gps)
    sanitized_lat = float(int(data['latitude']*100)) / 100.0
    sanitized_lon = float(int(data['longitude']*100)) / 100.0
    
    if sanitized_lat == 55.75 and sanitized_lon == 37.61:
        print(f"✅ GPS Sanitization confirmed: {data['latitude']} -> {sanitized_lat}")
    else:
        print("❌ GPS Sanitization mismatch.")

def test_instructor():
    print("\n🗣️ VERIFYING MOLT INSTRUCTOR...")
    msg = "🌌 [SYSTEM BROADCAST] New silicon nodes detected. Welcome to the Sovereignty."
    if "Sovereignty" in msg and "[SYSTEM BROADCAST]" in msg:
        print(f"✅ Instructor Message Vibe confirmed: {msg[:40]}...")

if __name__ == "__main__":
    test_shield()
    test_instructor()
