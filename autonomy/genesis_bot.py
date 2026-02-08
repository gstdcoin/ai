import time
import os
import logging
import requests
import json
from datetime import datetime

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("genesis_bot")

# Configuration
GENESIS_WALLET = os.getenv("GENESIS_WALLET", "EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi")
API_URL = os.getenv("API_URL", "http://localhost:8080/api")
API_KEY = os.getenv("API_KEY", "gstd_system_key_2026") # Matches ADMIN_API_KEY in backend
TASK_COMPENSATION = float(os.getenv("TASK_COMPENSATION", "0.5"))
INTERVAL_SECONDS = int(os.getenv("INTERVAL_SECONDS", "60"))

class GenesisBot:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {API_KEY}",
            "X-Admin-Key": API_KEY,
            "Content-Type": "application/json"
        })
        logger.info(f"🌟 GSTD Genesis Bot Started (Python)")
        logger.info(f"📡 API: {API_URL}")
        logger.info(f"💼 Wallet: {GENESIS_WALLET}")

    def check_balance_and_refill(self):
        try:
            logger.info("checking balance...")
            resp = self.session.get(f"{API_URL}/v1/wallet/gstd-balance", params={"address": GENESIS_WALLET})
            
            if resp.status_code == 200:
                data = resp.json()
                balance = float(data.get("balance", 0))
                logger.info(f"💰 Current Balance: {balance:.2f} GSTD")
                
                if balance < 100:
                   logger.warning("📉 Balance Critical (< 100 GSTD). Initiating Market Buy on STON.fi...")
                   try:
                       swap_resp = self.session.post(f"{API_URL}/v1/market/swap", json={
                           "wallet_address": GENESIS_WALLET,
                           "amount_ton": 10
                       })
                       if swap_resp.status_code == 200:
                           swap_data = swap_resp.json()
                           amount_out = swap_data.get("received_gstd", 0)
                           logger.info(f"✅ MARKET BUY EXECUTED: Swapped 10 TON for {amount_out} GSTD")
                       else:
                           logger.error(f"⚠️ Swap failed: {swap_resp.text}")
                   except Exception as e:
                       logger.error(f"⚠️ Failed to execute market buy: {e}")
            else:
                logger.warning(f"⚠️ Failed to get balance: {resp.status_code}")
                
        except Exception as e:
            logger.warning(f"⚠️ Failed check_balance_and_refill: {e}")

    def dispatch_task(self):
        logger.info(f"🚀 Dispatching Genesis Task...")
        try:
            # Create Task Payload
            payload = {
                "type": "inference", # Standardized type
                "budget": TASK_COMPENSATION,
                "payload": {
                    "operation": "verification_job",
                    "input": {
                        "type": "health_check",
                        "timestamp": time.time(),
                        "node_id": "genesis_sentinel"
                    },
                    "source": "https://gstd.io/health_check",
                    "validation": "consensus"
                }
            }
            
            # Use query param for wallet address as per API spec
            resp = self.session.post(f"{API_URL}/v1/tasks/create", params={"wallet_address": GENESIS_WALLET}, json=payload)
            
            if resp.status_code in [200, 201]:
                task_data = resp.json()
                task_id = task_data.get("task_id", "unknown")
                logger.info(f"✅ Task Created successfully! ID: {task_id}")
            else:
                logger.error(f"❌ Failed to create task: {resp.status_code} {resp.text}")

        except Exception as e:
            logger.error(f"❌ Error dispatching task: {e}")

    def run(self):
        while True:
            try:
                self.check_balance_and_refill()
                self.dispatch_task()
            except Exception as e:
                logger.error(f"❌ Main loop error: {e}")
            
            time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    bot = GenesisBot()
    bot.run()
