"""
GSTD Sovereign Compute Bridge - MoltBot Skill
Autonomous compute orchestration for AI assistants

Usage:
    from gstd_bridge import GSTDBridge
    
    bridge = GSTDBridge(
        api_url="https://app.gstdtoken.com/api/v1",
        wallet_address="UQ...",
        api_key="your_api_key"  # Optional
    )
    
    # Initialize connection
    session = await bridge.init()
    
    # Execute a task
    result = await bridge.execute(
        task_type="inference",
        payload={"prompt": "Hello, AI!"},
        max_budget_gstd=5.0
    )
"""

import os
import json
import hashlib
import asyncio
import aiohttp
import logging
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gstd_bridge")


class TaskStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    DISPUTED = "disputed"


class Priority(Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class WorkerMatch:
    """Matched worker from Discovery module"""
    worker_id: str
    wallet_address: str
    endpoint: str
    reservation_token: str
    capabilities: List[str]
    reputation: float
    latency_ms: int
    price_per_unit: float
    expires_at: datetime


@dataclass
class LiquidityStatus:
    """User's GSTD liquidity status"""
    wallet_address: str
    gstd_balance: float
    ton_balance: float
    reserved_gstd: float
    available_gstd: float
    auto_swap_enabled: bool


@dataclass
class SwapResult:
    """Result of auto-swap operation"""
    tx_hash: str
    amount_in_ton: float
    amount_out_gstd: float
    rate: float
    executed_at: datetime


@dataclass
class BridgeTask:
    """Task submitted through the bridge"""
    id: str
    client_id: str
    task_type: str
    status: TaskStatus
    payload_hash: str
    worker_id: Optional[str] = None
    result_hash: Optional[str] = None
    result_data: Optional[Any] = None
    actual_cost_gstd: Optional[float] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BridgeStatus:
    """Current bridge health status"""
    is_online: bool
    active_workers: int
    available_capacity_pflops: float
    pending_tasks: int
    genesis_node_online: bool
    last_health_check: datetime
    avg_latency_ms: int


class GSTDBridgeError(Exception):
    """Base exception for bridge errors"""
    pass


class InsufficientFundsError(GSTDBridgeError):
    """Raised when user has insufficient GSTD"""
    pass


class NoWorkersAvailableError(GSTDBridgeError):
    """Raised when no suitable workers are found"""
    pass


class TaskExecutionError(GSTDBridgeError):
    """Raised when task execution fails"""
    pass


class GSTDBridge:
    """
    GSTD Sovereign Compute Bridge Client
    
    Enables autonomous AI assistants (like MoltBot) to:
    1. Find suitable compute workers
    2. Auto-purchase GSTD tokens if needed
    3. Submit and track compute tasks
    4. Handle results and payments automatically
    """
    
    def __init__(
        self,
        api_url: str = None,
        wallet_address: str = None,
        api_key: str = None,
        client_id: str = None,
        auto_swap_enabled: bool = True,
        max_auto_swap_ton: float = 10.0,
        timeout_seconds: int = 30
    ):
        """
        Initialize GSTD Bridge client.
        
        Args:
            api_url: GSTD API base URL (or GSTD_API_URL env var)
            wallet_address: TON wallet address (or GSTD_WALLET_ADDRESS env var)
            api_key: Optional API key (or GSTD_API_KEY env var)
            client_id: Unique client identifier (auto-generated if not provided)
            auto_swap_enabled: Enable automatic TON→GSTD swaps
            max_auto_swap_ton: Maximum TON to auto-swap per operation
            timeout_seconds: HTTP timeout
        """
        self.api_url = api_url or os.getenv("GSTD_API_URL", "https://app.gstdtoken.com/api/v1")
        self.wallet_address = wallet_address or os.getenv("GSTD_WALLET_ADDRESS", "")
        self.api_key = api_key or os.getenv("GSTD_API_KEY", "")
        self.client_id = client_id or f"moltbot_{hashlib.sha256(os.urandom(16)).hexdigest()[:12]}"
        self.auto_swap_enabled = auto_swap_enabled
        self.max_auto_swap_ton = max_auto_swap_ton
        self.timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        
        self.session_token: Optional[str] = None
        self.session: Optional[aiohttp.ClientSession] = None
        self._initialized = False
        
        logger.info(f"🚀 GSTD Bridge initialized: client_id={self.client_id}")
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.init()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if self.session is None or self.session.closed:
            headers = {
                "Content-Type": "application/json",
                "User-Agent": f"GSTD-MoltBot/{self.client_id}"
            }
            if self.api_key:
                headers["X-GSTD-API-Key"] = self.api_key
            if self.session_token:
                headers["X-GSTD-Session"] = self.session_token
            
            self.session = aiohttp.ClientSession(
                timeout=self.timeout,
                headers=headers
            )
        return self.session
    
    async def close(self):
        """Close HTTP session"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    # =========================================================================
    # BRIDGE INITIALIZATION
    # =========================================================================
    
    async def init(self) -> Dict[str, Any]:
        """
        Initialize bridge connection.
        
        This is the GSTD_Bridge_Init() function that:
        1. Connects to GSTD API
        2. Checks token availability
        3. Queries nearest live node
        
        Returns:
            Session information including token, capabilities, and status
        """
        logger.info(f"🔗 Initializing bridge for wallet: {self.wallet_address[:12]}...")
        
        session = await self._get_session()
        
        try:
            async with session.post(
                f"{self.api_url}/bridge/init",
                json={
                    "client_id": self.client_id,
                    "client_wallet": self.wallet_address,
                    "api_key": self.api_key
                }
            ) as resp:
                data = await resp.json()
                
                if resp.status != 200:
                    raise GSTDBridgeError(f"Init failed: {data.get('message', 'Unknown error')}")
                
                self.session_token = data.get("session_token")
                self._initialized = True
                
                status = data.get("bridge_status", {})
                liquidity = data.get("liquidity", {})
                
                logger.info(f"✅ Bridge initialized:")
                logger.info(f"   Session: {self.session_token[:8]}...")
                logger.info(f"   Workers online: {status.get('active_workers', 0)}")
                logger.info(f"   Capacity: {status.get('available_capacity_pflops', 0):.1f} PFLOPS")
                logger.info(f"   GSTD Balance: {liquidity.get('available_gstd', 0):.4f}")
                
                return data
                
        except aiohttp.ClientError as e:
            raise GSTDBridgeError(f"Connection failed: {e}")
    
    async def get_status(self) -> BridgeStatus:
        """Get current bridge status"""
        session = await self._get_session()
        
        async with session.get(f"{self.api_url}/bridge/status") as resp:
            data = await resp.json()
            
            return BridgeStatus(
                is_online=data.get("is_online", False),
                active_workers=data.get("active_workers", 0),
                available_capacity_pflops=data.get("available_capacity_pflops", 0),
                pending_tasks=data.get("pending_tasks", 0),
                genesis_node_online=data.get("genesis_node_online", False),
                last_health_check=datetime.fromisoformat(data.get("last_health_check", datetime.now().isoformat())),
                avg_latency_ms=data.get("avg_latency_ms", 0)
            )
    
    # =========================================================================
    # MODULE 1: DISCOVERY & MATCHMAKING
    # =========================================================================
    
    async def find_worker(
        self,
        task_type: str = "compute",
        capabilities: List[str] = None,
        min_reputation: float = 0.8,
        max_latency_ms: int = 300,
        prefer_region: str = None
    ) -> WorkerMatch:
        """
        Find a suitable worker for the task.
        
        Args:
            task_type: Type of task (inference, render, compute, etc.)
            capabilities: Required capabilities (gpu, docker, etc.)
            min_reputation: Minimum worker reputation (0-1)
            max_latency_ms: Maximum acceptable latency
            prefer_region: Preferred geographic region
            
        Returns:
            WorkerMatch with worker details and reservation token
        """
        if not self._initialized:
            await self.init()
        
        logger.info(f"🔍 Finding worker: type={task_type}, caps={capabilities}")
        
        session = await self._get_session()
        
        async with session.post(
            f"{self.api_url}/bridge/match",
            json={
                "task_type": task_type,
                "capabilities": capabilities or ["gpu"],
                "min_reputation": min_reputation,
                "max_latency_ms": max_latency_ms,
                "prefer_region": prefer_region
            }
        ) as resp:
            data = await resp.json()
            
            if resp.status != 200:
                if "no_workers" in data.get("error", ""):
                    raise NoWorkersAvailableError(data.get("message"))
                raise GSTDBridgeError(f"Match failed: {data.get('message')}")
            
            worker_data = data.get("worker", {})
            worker = WorkerMatch(
                worker_id=worker_data.get("worker_id"),
                wallet_address=worker_data.get("wallet_address"),
                endpoint=worker_data.get("endpoint"),
                reservation_token=worker_data.get("reservation_token"),
                capabilities=worker_data.get("capabilities", []),
                reputation=worker_data.get("reputation", 0),
                latency_ms=worker_data.get("latency_ms", 0),
                price_per_unit=worker_data.get("price_per_unit_gstd", 0),
                expires_at=datetime.fromisoformat(worker_data.get("expires_at", datetime.now().isoformat()))
            )
            
            logger.info(f"✅ Worker found: {worker.worker_id} (rep={worker.reputation:.2f})")
            return worker
    
    # =========================================================================
    # MODULE 2: INVISIBLE SWAP (Auto Liquidity)
    # =========================================================================
    
    async def ensure_liquidity(
        self,
        required_gstd: float,
        auto_swap: bool = None
    ) -> tuple[LiquidityStatus, Optional[SwapResult]]:
        """
        Ensure sufficient GSTD balance, auto-swapping TON if needed.
        
        Args:
            required_gstd: Amount of GSTD needed
            auto_swap: Override auto-swap setting
            
        Returns:
            Tuple of (LiquidityStatus, SwapResult or None)
        """
        if not self._initialized:
            await self.init()
        
        should_swap = auto_swap if auto_swap is not None else self.auto_swap_enabled
        
        logger.info(f"💧 Checking liquidity: need {required_gstd:.4f} GSTD")
        
        session = await self._get_session()
        
        async with session.post(
            f"{self.api_url}/bridge/liquidity",
            json={
                "wallet_address": self.wallet_address,
                "required_gstd": required_gstd,
                "auto_swap": should_swap
            }
        ) as resp:
            data = await resp.json()
            
            if resp.status == 402:  # Payment Required
                raise InsufficientFundsError(
                    f"Insufficient GSTD: have {data.get('status', {}).get('available_gstd', 0):.4f}, "
                    f"need {required_gstd:.4f}"
                )
            
            if resp.status != 200:
                raise GSTDBridgeError(f"Liquidity check failed: {data.get('message')}")
            
            status_data = data.get("status", {})
            liquidity = LiquidityStatus(
                wallet_address=status_data.get("wallet_address", self.wallet_address),
                gstd_balance=status_data.get("gstd_balance", 0),
                ton_balance=status_data.get("ton_balance", 0),
                reserved_gstd=status_data.get("reserved_gstd", 0),
                available_gstd=status_data.get("available_gstd", 0),
                auto_swap_enabled=status_data.get("auto_swap_enabled", False)
            )
            
            swap_result = None
            if data.get("auto_swapped") and data.get("swap"):
                swap_data = data["swap"]
                swap_result = SwapResult(
                    tx_hash=swap_data.get("tx_hash"),
                    amount_in_ton=swap_data.get("amount_in_ton", 0),
                    amount_out_gstd=swap_data.get("amount_out_gstd", 0),
                    rate=swap_data.get("rate", 0),
                    executed_at=datetime.fromisoformat(swap_data.get("executed_at", datetime.now().isoformat()))
                )
                logger.info(f"💱 Auto-swapped: {swap_result.amount_in_ton:.4f} TON → {swap_result.amount_out_gstd:.4f} GSTD")
            
            logger.info(f"✅ Liquidity OK: {liquidity.available_gstd:.4f} GSTD available")
            return liquidity, swap_result
    
    # =========================================================================
    # MODULE 3: TASK EXECUTION & SETTLEMENT
    # =========================================================================
    
    async def submit_task(
        self,
        task_type: str,
        payload: Any,
        capabilities: List[str] = None,
        min_reputation: float = 0.7,
        max_budget_gstd: float = 10.0,
        priority: Priority = Priority.NORMAL,
        timeout_seconds: int = 300,
        metadata: Dict[str, Any] = None
    ) -> BridgeTask:
        """
        Submit a task for execution.
        
        This handles the full flow:
        1. Check/ensure liquidity
        2. Find suitable worker
        3. Lock funds in escrow
        4. Send encrypted payload
        5. Return task handle for tracking
        
        Args:
            task_type: Type of task
            payload: Task payload (will be JSON-encoded and encrypted)
            capabilities: Required worker capabilities
            min_reputation: Minimum worker reputation
            max_budget_gstd: Maximum GSTD to spend
            priority: Task priority
            timeout_seconds: Task timeout
            metadata: Additional metadata
            
        Returns:
            BridgeTask with task ID for tracking
        """
        if not self._initialized:
            await self.init()
        
        # Serialize payload
        if isinstance(payload, (dict, list)):
            payload_str = json.dumps(payload)
        else:
            payload_str = str(payload)
        
        logger.info(f"📤 Submitting task: type={task_type}, budget={max_budget_gstd:.4f} GSTD")
        
        session = await self._get_session()
        
        async with session.post(
            f"{self.api_url}/bridge/submit",
            json={
                "client_id": self.client_id,
                "client_wallet": self.wallet_address,
                "session_token": self.session_token,
                "task_type": task_type,
                "payload": payload_str,
                "capabilities": capabilities or ["gpu"],
                "min_reputation": min_reputation,
                "max_budget_gstd": max_budget_gstd,
                "priority": priority.value,
                "timeout_seconds": timeout_seconds,
                "metadata": metadata or {}
            }
        ) as resp:
            data = await resp.json()
            
            if resp.status not in [200, 202]:
                if "insufficient" in data.get("message", "").lower():
                    raise InsufficientFundsError(data.get("message"))
                raise TaskExecutionError(f"Submit failed: {data.get('message')}")
            
            task = BridgeTask(
                id=data.get("task_id"),
                client_id=self.client_id,
                task_type=task_type,
                status=TaskStatus(data.get("status", "pending")),
                payload_hash=data.get("payload_hash"),
                worker_id=data.get("worker_id"),
                metadata=metadata or {}
            )
            
            logger.info(f"✅ Task submitted: id={task.id}, worker={task.worker_id}")
            return task
    
    async def wait_for_result(
        self,
        task: BridgeTask,
        poll_interval: float = 2.0,
        timeout: float = None
    ) -> BridgeTask:
        """
        Wait for task completion.
        
        Args:
            task: Task to wait for
            poll_interval: Polling interval in seconds
            timeout: Maximum wait time (None = use task timeout)
            
        Returns:
            Updated task with result
        """
        timeout = timeout or 300.0
        deadline = datetime.now() + timedelta(seconds=timeout)
        
        logger.info(f"⏳ Waiting for task {task.id}...")
        
        session = await self._get_session()
        
        while datetime.now() < deadline:
            async with session.get(f"{self.api_url}/bridge/task/{task.id}") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    status = TaskStatus(data.get("status", "pending"))
                    
                    if status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.TIMEOUT]:
                        task.status = status
                        task.result_hash = data.get("result_hash")
                        task.result_data = data.get("result_data")
                        task.actual_cost_gstd = data.get("actual_cost_gstd")
                        task.completed_at = datetime.now()
                        
                        if status == TaskStatus.COMPLETED:
                            logger.info(f"✅ Task completed: {task.id}, cost={task.actual_cost_gstd:.4f} GSTD")
                        else:
                            logger.warning(f"❌ Task {status.value}: {task.id}")
                        
                        return task
            
            await asyncio.sleep(poll_interval)
        
        task.status = TaskStatus.TIMEOUT
        raise TaskExecutionError(f"Task {task.id} timed out after {timeout}s")
    
    # =========================================================================
    # HIGH-LEVEL API - One-shot execution
    # =========================================================================
    
    async def execute(
        self,
        task_type: str,
        payload: Any,
        capabilities: List[str] = None,
        max_budget_gstd: float = 10.0,
        timeout_seconds: int = 300,
        wait_for_result: bool = True
    ) -> BridgeTask:
        """
        Execute a task end-to-end.
        
        This is the simplest API - just call this with your task and get results.
        Handles worker finding, liquidity, submission, and result waiting automatically.
        
        Example:
            result = await bridge.execute(
                task_type="inference",
                payload={"prompt": "Hello AI!"},
                max_budget_gstd=5.0
            )
            print(result.result_data)
        
        Args:
            task_type: Type of task
            payload: Task payload
            capabilities: Required capabilities
            max_budget_gstd: Maximum budget
            timeout_seconds: Timeout
            wait_for_result: Whether to wait for completion
            
        Returns:
            Completed task with results
        """
        # Submit task
        task = await self.submit_task(
            task_type=task_type,
            payload=payload,
            capabilities=capabilities,
            max_budget_gstd=max_budget_gstd,
            timeout_seconds=timeout_seconds
        )
        
        # Wait for result if requested
        if wait_for_result:
            task = await self.wait_for_result(task, timeout=timeout_seconds)
        
        return task
    
    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================
    
    async def render(self, prompt: str, **kwargs) -> BridgeTask:
        """Convenience method for render tasks"""
        return await self.execute(
            task_type="render",
            payload={"prompt": prompt, **kwargs},
            capabilities=["gpu"],
            **kwargs
        )
    
    async def inference(self, prompt: str, model: str = "llama3", **kwargs) -> BridgeTask:
        """Convenience method for inference tasks"""
        return await self.execute(
            task_type="inference",
            payload={"prompt": prompt, "model": model, **kwargs},
            capabilities=["gpu", "inference"],
            **kwargs
        )
    
    async def compute(self, code: str, runtime: str = "python", **kwargs) -> BridgeTask:
        """Convenience method for compute tasks"""
        return await self.execute(
            task_type="compute",
            payload={"code": code, "runtime": runtime, **kwargs},
            capabilities=["docker"],
            **kwargs
        )


# =============================================================================
# CLI Interface
# =============================================================================

async def main():
    """CLI demo"""
    import argparse
    
    parser = argparse.ArgumentParser(description="GSTD Sovereign Compute Bridge CLI")
    parser.add_argument("--wallet", "-w", help="Wallet address")
    parser.add_argument("--api-url", default="https://app.gstdtoken.com/api/v1")
    parser.add_argument("--status", action="store_true", help="Get bridge status")
    parser.add_argument("--execute", "-e", help="Execute a task (JSON payload)")
    parser.add_argument("--task-type", "-t", default="compute", help="Task type")
    
    args = parser.parse_args()
    
    async with GSTDBridge(
        api_url=args.api_url,
        wallet_address=args.wallet or os.getenv("GSTD_WALLET_ADDRESS", "")
    ) as bridge:
        
        if args.status:
            status = await bridge.get_status()
            print(f"Bridge Status:")
            print(f"  Online: {status.is_online}")
            print(f"  Workers: {status.active_workers}")
            print(f"  Capacity: {status.available_capacity_pflops:.1f} PFLOPS")
        
        elif args.execute:
            payload = json.loads(args.execute)
            result = await bridge.execute(
                task_type=args.task_type,
                payload=payload
            )
            print(f"Task completed: {result.id}")
            print(f"Result: {result.result_data}")
            print(f"Cost: {result.actual_cost_gstd} GSTD")


if __name__ == "__main__":
    asyncio.run(main())
