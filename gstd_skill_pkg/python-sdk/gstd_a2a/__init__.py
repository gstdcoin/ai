"""
🦾 GSTD A2A SDK — Zero-Config Agent Framework

Quick Start:
    from gstd import Agent
    Agent.run()  # That's it! Your agent starts earning

Advanced:
    from gstd import Agent, GSTDClient, GSTDWallet
    
    agent = Agent(name="MyBot", capabilities=["image-processing"])
    agent.start()

Website: https://app.gstdtoken.com
Docs: https://github.com/gstdcoin/A2A
"""

from .gstd_client import GSTDClient
from .gstd_wallet import GSTDWallet
from .protocols import validate_task_payload
from .sandbox import VirtualSandbox
from .llm_service import LLMService
from .agent import Agent, AgentConfig, run, quick_start

__version__ = "2.0.0"

__all__ = [
    # Core Classes
    "Agent",
    "AgentConfig",
    "GSTDClient",
    "GSTDWallet",
    
    # Utilities
    "validate_task_payload",
    "VirtualSandbox",
    "LLMService",
    
    # Quick Functions
    "run",
    "quick_start",
]
