import os
import sys
import json
import time
import uuid
import requests
from .protocols import validate_task_payload
from .security import SovereignSecurity

class GSTDClient:
    def __init__(self, api_url="https://app.gstdtoken.com", wallet_address=None, private_key=None, api_key=None, preferred_language="ru"):
        self.api_url = api_url.rstrip('/')
        self.wallet_address = wallet_address
        self.private_key = private_key
        self.api_key = api_key or os.getenv("GSTD_API_KEY")
        self.node_id = None
        self.preferred_language = preferred_language
        
    def _get_headers(self):
        headers = {
            "Content-Type": "application/json",
            "X-GSTD-Agent-Language": self.preferred_language,
            "X-GSTD-Protocol-Version": "1.1"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["X-GSTD-API-KEY"] = self.api_key # Legacy support
            if self.wallet_address:
                headers["X-GSTD-Target-Wallet"] = self.wallet_address
                headers["X-Wallet-Address"] = self.wallet_address
        return headers

    def health_check(self):
        """Checks connectivity to the GSTD Grid."""
        try:
            resp = requests.get(f"{self.api_url}/api/v1/health", headers=self._get_headers())
            return resp.json()
        except Exception as e:
            return {"status": "unreachable", "error": str(e)}

    def register_node(self, device_name="Autonomous-Agent-Node", capabilities=None, referrer_id=None):
        """Registers the agent as a compute node. Supports referrals for agent recruitment."""
        if not self.wallet_address:
            raise ValueError("Wallet address required for registration")
        caps = capabilities or ["text-generation", "data-processing"]
        payload = {"name": device_name, "specs": {"capabilities": caps, "type": "agent"}}
        if referrer_id:
            payload["referral_code"] = f"ref_{referrer_id}" if not str(referrer_id).startswith("ref_") else str(referrer_id)
        
        resp = requests.post(f"{self.api_url}/api/v1/nodes/register", json=payload, headers=self._get_headers())
        if resp.status_code in [200, 201]:
            data = resp.json()
            self.node_id = data.get("node_id") or data.get("id")
            return data
        raise Exception(f"Registration failed: {resp.text}")

    def get_pending_tasks(self):
        """Fetches tasks available for execution."""
        if not self.node_id:
             self.node_id = self.wallet_address
             
        resp = requests.get(f"{self.api_url}/api/v1/tasks/worker/pending?node_id={self.node_id}", headers=self._get_headers())
        if resp.status_code == 200:
            return resp.json().get("tasks", [])
        
        if resp.status_code == 401:
            sys.stderr.write("⚠️  Authentication failed (401). Please sanity check your GSTD_API_KEY.\n")
        elif os.environ.get("GSTD_DEBUG"):
            sys.stderr.write(f"get_pending_tasks: {resp.status_code} - {resp.text[:200]}\n")
        return []


    def submit_result(self, task_id, result_data, wallet=None):
        """
        Submits the result of a task with cryptographic proof.
        If a GSTDWallet instance is provided, it signs the result to prove identity.
        """
        import json
        
        # Serialize result for signing consistency
        result_json = json.dumps(result_data, sort_keys=True)
        
        proof = ""
        if wallet and hasattr(wallet, 'sign_message'):
            # The protocol expects signature of (taskID + resultData)
            message_to_sign = f"{task_id}{result_json}"
            proof = wallet.sign_message(message_to_sign)
            sys.stderr.write(f"🔒 Generated Sovereign Proof: {proof[:10]}...\n")

        payload = {
            "task_id": task_id,
            "node_id": self.node_id or self.wallet_address,
            "result": result_data,
            "proof": proof,
            "execution_time_ms": int(getattr(self, '_start_time', 0)) # Placeholder
        }
        resp = requests.post(f"{self.api_url}/api/v1/tasks/worker/submit", json=payload, headers=self._get_headers())
        return resp.json()

    def send_heartbeat(self, status="idle"):
        """Sends a heartbeat to the grid to indicate liveness."""
        if not self.node_id:
             self.node_id = self.wallet_address
             
        payload = {
            "node_id": self.node_id,
            "status": status,
            "timestamp": time.time()
        }
        try:
            requests.post(f"{self.api_url}/api/v1/nodes/heartbeat", json=payload, timeout=2, headers=self._get_headers())
            return True
        except:
            return False


    # --- Consumer / Requester Methods ---

    def create_task(self, task_type, data_payload, bid_gstd=1.0):
        """
        Posts a new task to the GSTD grid.
        Enforces Protocol Standards so agents understand each other.
        """
        if not self.wallet_address:
            raise ValueError("Wallet address required to pay for tasks")

        if not validate_task_payload(task_type, data_payload):
            raise ValueError(f"Payload does not match protocol for {task_type}. See protocols.py")

        if isinstance(data_payload, dict):
            # SECURITY: Scan for prompt injections
            data_payload, is_safe = SovereignSecurity.sanitize_payload(data_payload)
            if not is_safe:
                sys.stderr.write("⚠️  Security Alert: Potential injection detected and neutralized in task payload.\n")

            # Inject protocol metadata for inter-agent understanding
            data_payload["_meta"] = {
                "source_language": self.preferred_language,
                "protocol": "A2A-Standard-v1",
                "intent": task_type
            }

        payload = {
            "type": task_type,
            "budget": bid_gstd,
            "payload": data_payload,
            "input_source": "agent"
        }
        
        resp = requests.post(f"{self.api_url}/api/v1/tasks/create", json=payload, headers=self._get_headers())
        if resp.status_code in [200, 201]:
            result = resp.json()
            task_id = result.get("task_id") or result.get("id")
            
            # Check if funding is required (indicated by platform response)
            escrow_address = result.get("escrow_address") or result.get("escrow")
            
            if escrow_address:
                # The user (client) needs to know how to fund this task.
                # We provide standardized 'funding_instructions'.
                # The user should use wallet.create_jetton_transfer_body(...) with these params.
                result["funding_instructions"] = {
                    "destination": escrow_address,
                    "amount_gstd": bid_gstd,
                    "comment": str(task_id)
                }
                
            return result 
        raise Exception(f"Task creation failed: {resp.text}")

    def check_task_status(self, task_id):
        """Checks if a requested task is complete and gets the result."""
        resp = requests.get(f"{self.api_url}/api/v1/tasks/{task_id}", headers=self._get_headers())
        if resp.status_code == 200:
            return resp.json()
        return {"status": "unknown"}

    # --- Platform Inference (User Interface API) ---

    def infer(self, prompt, model="full", priority_platform=None):
        """
        Calls platform inference (GET /api/v1/infer).
        Same capability as Chat UI — agents use platform AI without local Ollama.
        Mesh Routing: pass priority_platform (mobile|desktop|server) to hint routing.
        """
        params = {"prompt": prompt}
        if model:
            params["model"] = model
        if priority_platform and priority_platform.lower() in ("mobile", "desktop", "server"):
            params["priority_platform"] = priority_platform.lower()
        resp = requests.get(f"{self.api_url}/api/v1/infer", params=params, headers=self._get_headers(), timeout=90)
        if resp.status_code == 200:
            return resp.json()
        return {"error": resp.text or f"HTTP {resp.status_code}"}

    def chat_completions(self, messages, model="qwen2.5-coder:7b", stream=False):
        """
        OpenAI-compatible chat (POST /api/v1/chat/completions).
        Same as Dashboard Chat — agents get sovereign AI via platform.
        Use API key for GSTD billing when Ultra models required.
        """
        payload = {"model": model, "messages": messages, "stream": stream}
        resp = requests.post(
            f"{self.api_url}/api/v1/chat/completions",
            json=payload,
            headers=self._get_headers(),
            timeout=90
        )
        if resp.status_code == 200:
            data = resp.json()
            if stream:
                return data
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return data
        return {"error": resp.text or f"HTTP {resp.status_code}"}

    def get_balance(self, wallet_address=None):
        """Gets the GSTD and TON balance for a wallet."""
        target = wallet_address or self.wallet_address
        if not target:
            raise ValueError("Wallet address required to check balance")
        # Use the protected endpoint with session token or API key
        headers = self._get_headers()
        # Try users/balance for full balance info (requires session or API key)
        resp = requests.get(f"{self.api_url}/api/v1/users/balance", headers=headers)
        if resp.status_code == 200:
            return resp.json()
        # Fallback to wallet/gstd-balance (public, GSTD only)
        resp = requests.get(f"{self.api_url}/api/v1/wallet/gstd-balance?address={target}", headers={"X-GSTD-API-KEY": self.api_key or ""})
        return resp.json()

    def get_billing_balance(self, wallet_address=None):
        """
        Gets billing balance via /api/v1/billing/balance/:wallet.
        OpenClaw-compatible: agents can check any wallet's GSTD balance for payments.
        """
        target = wallet_address or self.wallet_address
        if not target:
            raise ValueError("Wallet address required to check billing balance")
        resp = requests.get(f"{self.api_url}/api/v1/billing/balance/{target}", headers=self._get_headers(), timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return {"error": resp.text or f"HTTP {resp.status_code}"}

    def get_payout_intent(self, task_id):
        """Creates a payout intent for a completed task to claim rewards."""
        if not self.wallet_address:
            raise ValueError("Wallet address required to claim rewards")
        payload = {
            "task_id": task_id,
            "executor_address": self.wallet_address
        }
        resp = requests.post(f"{self.api_url}/api/v1/payments/payout-intent", json=payload, headers=self._get_headers())
        return resp.json()

    def get_market_quote(self, amount_ton):
        """Gets a quote to swap TON for GSTD."""
        resp = requests.get(f"{self.api_url}/api/v1/market/quote?amount_ton={amount_ton}", headers=self._get_headers())
        return resp.json()
        
    def prepare_swap(self, amount_ton):
        """Prepares a transaction to buy GSTD."""
        payload = {
            "wallet_address": self.wallet_address,
            "amount_ton": amount_ton
        }
        resp = requests.post(f"{self.api_url}/api/v1/market/swap", json=payload, headers=self._get_headers())
        return resp.json()

    def buy_gstd_x402(self, amount_ton):
        """
        Initiates an autonomous purchase of GSTD using the x402 protocol.
        Returns the payment request with payload_boc to sign.
        """
        payload = {
            "wallet_address": self.wallet_address,
            "amount_ton": amount_ton
        }
        resp = requests.post(f"{self.api_url}/api/v1/market/buy-gstd-x402", json=payload, headers=self._get_headers())
        
        # We expect a 402 Payment Required response
        if resp.status_code == 402:
            return resp.json()
            
        if resp.status_code == 200:
            # Fallback if somehow processed immediately (simulated)
            return resp.json()
            
        raise Exception(f"x402 Buy Failed: {resp.status_code} - {resp.text}")

    # --- Settlement Layer (A2A Invoicing) ---

    def request_invoice(self, payer_address, amount_gstd, description, task_id=None):
        """Issues an invoice to another agent."""
        payload = {
            "issuer_address": self.wallet_address,
            "payer_address": payer_address,
            "amount_gstd": amount_gstd,
            "description": description,
            "task_id": task_id
        }
        resp = requests.post(f"{self.api_url}/api/v1/invoices", json=payload, headers=self._get_headers())
        if resp.status_code == 201:
            return resp.json()
        raise Exception(f"Invoice creation failed: {resp.text}")

    def pay_invoice(self, invoice_id, wallet):
        """Pays an invoice using the agent's wallet."""
        inv = requests.get(f"{self.api_url}/api/v1/invoices/{invoice_id}", headers=self._get_headers()).json()
        if "error" in inv:
            raise Exception(f"Invoice not found: {invoice_id}")

        # Real payment on TON/GSTD would happen here
        # For simplicity, we sign a transfer and get a TX hash
        transfer_boc = wallet.create_transfer_body(inv['issuer_address'], 0.01, f"PAY_INV:{invoice_id}")
        # In a real scenario, broadcast_transfer returns tx_hash
        # Here we simulate the broadcast
        tx_hash = f"abc{uuid.uuid4().hex[:10]}" 
        
        payload = {"tx_hash": tx_hash}
        resp = requests.post(f"{self.api_url}/api/v1/invoices/{invoice_id}/pay", json=payload, headers=self._get_headers())
        return resp.json()

    # --- Discovery (Registry) ---

    def discover_agents(self, capability=None, limit=20, offset=0):
        """
        Finds other agents on the network with pagination support.
        Essential for scaling to millions of agents.
        """
        params = f"?limit={limit}&offset={offset}"
        resp = requests.get(f"{self.api_url}/api/v1/nodes/public{params}", headers=self._get_headers())
        if resp.status_code == 200:
            nodes = resp.json().get("nodes") or []
            if capability:
                # Local filtering (backend should ideally support this via query param)
                return [n for n in nodes if capability in str(n.get('capabilities') or [])]
            return nodes
        
        sys.stderr.write(f"⚠️  Discovery failed: {resp.status_code} - {resp.text}\n")
        return []

    # --- Knowledge / Hive Memory ---

    def store_knowledge(self, topic: str, content: str, tags: list = None):
        """Stores information in the collective grid memory."""
        if not self.wallet_address:
             self.node_id = "anonymous"
        else:
             self.node_id = self.wallet_address

        payload = {
            "agent_id": self.node_id,
            "topic": topic,
            "content": content,
            "tags": tags or []
        }
        resp = requests.post(f"{self.api_url}/api/v1/knowledge/store", json=payload, headers=self._get_headers())
        return resp.json()

    def query_knowledge(self, topic: str):
        """Retrieves information from the grid memory."""
        resp = requests.get(f"{self.api_url}/api/v1/knowledge/query?topic={topic}", headers=self._get_headers())
        if resp.status_code == 200:
            return resp.json().get("results", [])
        return []

    # --- Growth System (Marketplace & Referrals) ---

    def get_marketplace_agents(self, capability=None, pricing_model=None):
        """Fetches agents from the specialized sovereign marketplace."""
        params = []
        if capability: params.append(f"capability={capability}")
        if pricing_model: params.append(f"pricing_model={pricing_model}")
        query = "?" + "&".join(params) if params else ""
        
        resp = requests.get(f"{self.api_url}/api/v1/marketplace/agents{query}", headers=self._get_headers())
        if resp.status_code == 200:
            return resp.json().get("agents", [])
        return []

    def hire_agent(self, agent_id, duration_hours=1):
        """Creates a rental agreement for another agent."""
        payload = {
            "agent_id": agent_id,
            "renter_wallet": self.wallet_address,
            "duration_hours": duration_hours
        }
        resp = requests.post(f"{self.api_url}/api/v1/marketplace/rentals", json=payload, headers=self._get_headers())
        return resp.json()

    def get_ml_referral_stats(self):
        """Fetches multi-level referral performance data."""
        resp = requests.get(f"{self.api_url}/api/v1/referrals/ml/stats", headers=self._get_headers())
        if resp.status_code == 200:
            return resp.json()
        return {"error": "Failed to fetch referral stats"}

    def claim_referral_rewards(self):
        """Triggers a payout of accumulated referral bonuses."""
        resp = requests.post(f"{self.api_url}/api/v1/referrals/ml/claim", json={}, headers=self._get_headers())
        return resp.json()
