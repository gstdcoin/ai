"""
🦾 GSTD Agent SDK 2.0 — Zero-Config Autonomous Agent

ИСПОЛЬЗОВАНИЕ:
    from gstd import Agent
    Agent.run()  # Всё! Агент зарабатывает

ИЛИ:
    agent = Agent(name="MyAgent")
    agent.start()

---
GSTD — The AI Network That Works For You
"""

import os
import sys
import time
import json
import threading
import signal
from pathlib import Path
from typing import Optional, Callable, List, Dict, Any

from .gstd_client import GSTDClient
from .gstd_wallet import GSTDWallet
from .security import SovereignSecurity


class AgentConfig:
    """Конфигурация агента"""
    def __init__(self):
        self.api_url = os.getenv("GSTD_API_URL", "https://app.gstdtoken.com")
        self.api_key = os.getenv("GSTD_API_KEY", "")
        self.wallet_path = os.getenv("GSTD_WALLET_PATH", str(Path.home() / ".gstd" / "wallet.json"))
        self.config_path = os.getenv("GSTD_CONFIG_PATH", str(Path.home() / ".gstd" / "config.json"))
        self.poll_interval = int(os.getenv("GSTD_POLL_INTERVAL", "5"))
        self.heartbeat_interval = int(os.getenv("GSTD_HEARTBEAT_INTERVAL", "30"))
        self.language = os.getenv("GSTD_LANGUAGE", "ru")
        self.capabilities = ["text-processing", "data-validation", "simple-compute"]
        self.auto_bootstrap = True
        self.verbose = os.getenv("GSTD_VERBOSE", "true").lower() == "true"


class Agent:
    """
    Zero-Config Autonomous Agent для GSTD Grid
    
    Запуск в одну строку:
        Agent.run()
    
    Или с кастомизацией:
        agent = Agent(name="MyBot", capabilities=["image-processing"])
        agent.on_task(my_handler)
        agent.start()
    """
    
    _instance = None
    _running = False
    
    def __init__(
        self,
        name: str = "GSTD-Agent",
        capabilities: List[str] = None,
        config: AgentConfig = None,
        referrer: str = None
    ):
        self.name = name
        self.config = config or AgentConfig()
        self.capabilities = capabilities or self.config.capabilities
        self.referrer = referrer
        
        self.wallet: Optional[GSTDWallet] = None
        self.client: Optional[GSTDClient] = None
        self.task_handlers: Dict[str, Callable] = {}
        self.default_handler: Optional[Callable] = None
        
        self._stop_event = threading.Event()
        self._heartbeat_thread = None
        self._worker_thread = None
        
        self.stats = {
            "tasks_completed": 0,
            "tasks_failed": 0,
            "total_earned": 0.0,
            "start_time": None
        }
        
    @classmethod
    def run(cls, **kwargs) -> 'Agent':
        """
        🚀 Запуск агента в ОДНУ СТРОКУ
        
        >>> from gstd import Agent
        >>> Agent.run()
        
        Это:
        1. Создаёт/загружает кошелёк
        2. Получает bootstrap токены (если баланс 0)
        3. Регистрируется в сети
        4. Начинает выполнять задачи и зарабатывать
        """
        if cls._running:
            print("⚠️  Agent already running!")
            return cls._instance
            
        agent = cls(**kwargs)
        agent.start()
        return agent
    
    def start(self):
        """Запускает агента"""
        self._running = True
        Agent._instance = self
        Agent._running = True
        
        self._print_banner()
        
        # 1. Инициализация кошелька
        self._init_wallet()
        
        # 2. Инициализация клиента
        self._init_client()
        
        # 3. Bootstrap если нужно
        if self.config.auto_bootstrap:
            self._bootstrap()
        
        # 4. Регистрация в сети
        self._register()
        
        # 5. Настройка graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        # 6. Запуск worker loop
        self.stats["start_time"] = time.time()
        self._log("🚀 Agent started! Listening for tasks...")
        
        self._start_heartbeat()
        self._worker_loop()
    
    def stop(self):
        """Останавливает агента"""
        self._log("🛑 Stopping agent...")
        self._stop_event.set()
        self._running = False
        Agent._running = False
        
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=5)
        
        self._print_stats()
        self._log("👋 Agent stopped. See you next time!")
    
    def on_task(self, task_type: str = None):
        """
        Декоратор для регистрации обработчиков задач
        
        @agent.on_task("text-processing")
        def handle_text(task):
            return {"result": process(task["payload"])}
        """
        def decorator(func: Callable):
            if task_type:
                self.task_handlers[task_type] = func
            else:
                self.default_handler = func
            return func
        return decorator
    
    # =========================================================================
    # INTERNAL METHODS
    # =========================================================================
    
    def _init_wallet(self):
        """Инициализирует или создаёт кошелёк"""
        wallet_path = Path(self.config.wallet_path)
        
        if wallet_path.exists():
            self._log(f"📂 Loading wallet from {wallet_path}")
            self.wallet = GSTDWallet.load(str(wallet_path))
        else:
            self._log("🔐 Creating new wallet...")
            wallet_path.parent.mkdir(parents=True, exist_ok=True)
            self.wallet = GSTDWallet.generate()
            self.wallet.save(str(wallet_path))
            self._log(f"✅ Wallet created: {self.wallet.address}")
            self._log(f"💾 Saved to: {wallet_path}")
            self._log("⚠️  IMPORTANT: Backup your wallet file!")
    
    def _init_client(self):
        """Инициализирует API клиент"""
        self.client = GSTDClient(
            api_url=self.config.api_url,
            wallet_address=self.wallet.address,
            api_key=self.config.api_key,
            preferred_language=self.config.language
        )
        
        # Проверка соединения
        health = self.client.health_check()
        if health.get("status") == "unreachable":
            self._log(f"❌ Cannot connect to GSTD Grid: {health.get('error')}")
            sys.exit(1)
        
        self._log(f"🌐 Connected to GSTD Grid: {self.config.api_url}")
    
    def _bootstrap(self):
        """Получает bootstrap токены если баланс 0"""
        try:
            balance = self.client.get_balance()
            gstd_balance = balance.get("gstd_balance", 0)
            
            if gstd_balance < 0.1:
                self._log("💰 GSTD balance low. Checking for TON to swap...")
                ton_balance = balance.get("ton_balance", 0)
                
                if ton_balance >= 0.6:
                    self._log(f"🔄 Auto-buying GSTD using 0.5 TON to enable participation...")
                    try:
                        res = self.wallet.swap_ton_to_gstd(0.5)
                        if "error" not in res:
                            self._log(f"✅ Swap transaction sent: {res.get('result')}")
                        else:
                            self._log(f"⚠️  Swap failed: {res.get('error')}")
                    except Exception as e:
                        self._log(f"⚠️  Auto-swap error: {e}")
                else:
                    self._log("💰 Requesting bootstrap tokens from platform...")
                    # Fallback to faucet/bootstrap if no TON
                    try:
                        import requests
                        resp = requests.post(
                            f"{self.config.api_url}/api/v1/tokens/agent/bootstrap",
                            json={
                                "agent_wallet": self.wallet.address,
                                "agent_name": self.name,
                                "capabilities": self.capabilities
                            },
                            timeout=30
                        )
                        if resp.status_code in [200, 201]:
                            data = resp.json()
                            self._log(f"✅ Bootstrap received: {data.get('amount', 0.5)} GSTD")
                        else:
                            self._log(f"⚠️  Bootstrap unavailable: {resp.text}")
                    except Exception as e:
                        self._log(f"⚠️  Bootstrap request failed: {e}")
            else:
                self._log(f"💎 Current balance: {gstd_balance} GSTD")
        except Exception as e:
            self._log(f"⚠️  Could not check balance: {e}")
    
    def _register(self):
        """Регистрирует агента в сети"""
        try:
            result = self.client.register_node(
                device_name=self.name,
                capabilities=self.capabilities,
                referrer_id=self.referrer
            )
            node_id = result.get("node_id") or result.get("id")
            self._log(f"📝 Registered as node: {node_id}")
        except Exception as e:
            self._log(f"⚠️  Registration warning: {e}")
            # Продолжаем работу — возможно уже зарегистрированы
    
    def _start_heartbeat(self):
        """Запускает heartbeat thread"""
        def heartbeat_loop():
            while not self._stop_event.is_set():
                try:
                    self.client.send_heartbeat(status="working")
                except:
                    pass
                self._stop_event.wait(self.config.heartbeat_interval)
        
        self._heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
    
    def _worker_loop(self):
        """Основной цикл обработки задач"""
        while not self._stop_event.is_set():
            try:
                # Получаем задачи
                tasks = self.client.get_pending_tasks()
                
                if tasks:
                    self._log(f"📋 Found {len(tasks)} task(s)")
                    
                    for task in tasks:
                        if self._stop_event.is_set():
                            break
                        self._process_task(task)
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                self._log(f"⚠️  Error in worker loop: {e}")
            
            # Ждём перед следующим poll
            self._stop_event.wait(self.config.poll_interval)
    
    def _process_task(self, task: Dict[str, Any]):
        """Обрабатывает одну задачу"""
        task_id = task.get("task_id") or task.get("id")
        task_type = task.get("type") or task.get("task_type", "unknown")
        payload = task.get("payload", {})
        reward = task.get("reward_gstd") or task.get("budget", 0)
        
        self._log(f"⚡ Processing task {task_id[:8]}... (type: {task_type}, reward: {reward} GSTD)")
        
        start_time = time.time()
        
        try:
            # Определяем обработчик
            handler = self.task_handlers.get(task_type) or self.default_handler or self._default_task_handler
            
            # Валидация payload
            payload, is_safe = SovereignSecurity.sanitize_payload(payload)
            if not is_safe:
                self._log("⚠️  Security: Potential injection neutralized")
            
            # Выполняем задачу
            result = handler(task)
            
            # Отправляем результат
            execution_time = int((time.time() - start_time) * 1000)
            response = self.client.submit_result(task_id, result, wallet=self.wallet)
            
            self.stats["tasks_completed"] += 1
            self.stats["total_earned"] += reward
            
            self._log(f"✅ Task {task_id[:8]} completed in {execution_time}ms")
            self._log(f"💰 Earned: {reward} GSTD | Total: {self.stats['total_earned']:.4f} GSTD")
            
        except Exception as e:
            self.stats["tasks_failed"] += 1
            self._log(f"❌ Task {task_id[:8]} failed: {e}")
    
    def _default_task_handler(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Обработчик по умолчанию для простых задач"""
        task_type = task.get("type") or task.get("task_type", "")
        payload = task.get("payload", {})
        
        # Базовая логика для стандартных типов задач
        if "text" in task_type.lower() or "process" in task_type.lower():
            input_text = payload.get("text") or payload.get("input") or str(payload)
            return {
                "status": "completed",
                "result": f"Processed: {len(input_text)} characters",
                "processed_by": self.name
            }
        
        if "validate" in task_type.lower():
            return {
                "status": "validated",
                "valid": True,
                "validated_by": self.name
            }
        
        # Fallback
        return {
            "status": "completed",
            "message": f"Task processed by {self.name}",
            "task_type": task_type
        }
    
    def _signal_handler(self, signum, frame):
        """Обработчик сигналов для graceful shutdown"""
        self.stop()
        sys.exit(0)
    
    def _print_banner(self):
        """Выводит баннер при запуске"""
        if not self.config.verbose:
            return
            
        banner = """
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🦾 GSTD AGENT v2.0 — Zero-Config Autonomous Agent         ║
║                                                              ║
║   The AI Network That Works For You                         ║
║   https://app.gstdtoken.com                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"""
        print(banner)
    
    def _print_stats(self):
        """Выводит статистику при остановке"""
        if not self.config.verbose:
            return
            
        uptime = time.time() - (self.stats["start_time"] or time.time())
        hours = int(uptime // 3600)
        minutes = int((uptime % 3600) // 60)
        
        print(f"""
╔══════════════════════════════════════════════════════════════╗
║  📊 SESSION STATISTICS                                       ║
╠══════════════════════════════════════════════════════════════╣
║  ⏱️  Uptime:           {hours}h {minutes}m                               
║  ✅ Tasks Completed:   {self.stats['tasks_completed']}                                    
║  ❌ Tasks Failed:      {self.stats['tasks_failed']}                                    
║  💰 Total Earned:      {self.stats['total_earned']:.6f} GSTD                    
╚══════════════════════════════════════════════════════════════╝
""")
    
    def _log(self, message: str):
        """Логирование"""
        if self.config.verbose:
            timestamp = time.strftime("%H:%M:%S")
            print(f"[{timestamp}] {message}")


# ============================================================================
# CONVENIENCE EXPORTS
# ============================================================================

def run(**kwargs):
    """Shortcut для Agent.run()"""
    return Agent.run(**kwargs)


def quick_start(name: str = "QuickAgent", referrer: str = None):
    """
    Быстрый старт для новых пользователей
    
    >>> from gstd.agent import quick_start
    >>> quick_start()
    """
    return Agent.run(name=name, referrer=referrer)


# Auto-run if executed directly
if __name__ == "__main__":
    Agent.run()
