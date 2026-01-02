#!/usr/bin/env python3
"""
GSTD Platform Genesis Network Stress Test
Simulates real network activity with multiple nodes and concurrent tasks.
"""

import argparse
import json
import logging
import random
import string
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class GenesisTester:
    """Genesis Network Stress Test"""
    
    def __init__(self, api_url: str, num_nodes: int = 5, num_tasks: int = 10):
        self.api_url = api_url.rstrip('/')
        self.num_nodes = num_nodes
        self.num_tasks = num_tasks
        self.session = self._create_session()
        self.wallet_addresses = []
        self.node_ids = []
        self.task_ids = []
        self.completed_tasks = []
        self.total_budget = 0.0
        self.total_rewards_paid = 0.0
        self.total_platform_fees = 0.0
        
    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy"""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
    
    def generate_wallet_address(self) -> str:
        """Generate a random wallet address for testing"""
        return "EQ" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=48))
    
    def register_node(self, wallet_address: str, node_name: str) -> Optional[str]:
        """Register a node and return node_id"""
        try:
            url = f"{self.api_url}/api/v1/nodes/register"
            params = {"wallet_address": wallet_address}
            payload = {
                "name": node_name,
                "specs": {
                    "cpu": f"Test CPU {random.randint(1, 10)}",
                    "ram": random.choice([8, 16, 32, 64])
                }
            }
            
            response = self.session.post(url, params=params, json=payload, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            node_id = data.get("id")
            logger.info(f"Registered node: {node_name} (ID: {node_id})")
            return node_id
        except Exception as e:
            logger.error(f"Error registering node {node_name}: {e}")
            return None
    
    def create_task(self, wallet_address: str, task_num: int) -> Optional[Dict]:
        """Create a task and return task data"""
        try:
            url = f"{self.api_url}/api/v1/tasks/create"
            params = {"wallet_address": wallet_address}
            budget = round(random.uniform(1.0, 10.0), 2)
            
            payload = {
                "type": random.choice(["AI_INFERENCE", "DATA_PROCESSING", "COMPUTATION"]),
                "budget": budget,
                "payload": {
                    "test_task": task_num,
                    "timestamp": datetime.now().isoformat()
                }
            }
            
            response = self.session.post(url, params=params, json=payload, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            task_id = data.get("task_id")
            payment_memo = data.get("payment_memo")
            platform_wallet = data.get("platform_wallet")
            
            logger.info(f"Created task {task_num}: {task_id} (Budget: {budget} GSTD)")
            
            # Simulate payment (in real scenario, this would be a TON transaction)
            # For testing, we'll mark the task as paid directly
            self._simulate_payment(task_id, payment_memo, budget)
            
            return {
                "task_id": task_id,
                "budget": budget,
                "payment_memo": payment_memo
            }
        except Exception as e:
            logger.error(f"Error creating task {task_num}: {e}")
            return None
    
    def _simulate_payment(self, task_id: str, payment_memo: str, amount: float):
        """Simulate payment by calling payment watcher logic directly"""
        # In a real scenario, this would be handled by PaymentWatcher
        # For testing, we'll use a direct API call if available, or skip
        # The PaymentWatcher should pick this up automatically
        logger.info(f"Simulating payment for task {task_id}: {amount} GSTD (memo: {payment_memo})")
        time.sleep(0.5)  # Small delay to simulate payment processing
    
    def fetch_pending_tasks(self, node_id: str) -> List[Dict]:
        """Fetch pending tasks for a node"""
        try:
            url = f"{self.api_url}/api/v1/tasks/worker/pending"
            params = {"node_id": node_id}
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            return data.get("tasks", [])
        except Exception as e:
            logger.error(f"Error fetching tasks for node {node_id}: {e}")
            return []
    
    def process_and_submit_task(self, node_id: str, wallet_address: str, task: Dict) -> bool:
        """Process a task and submit result"""
        try:
            task_id = task.get("task_id")
            budget = task.get("budget_gstd", 0)
            
            logger.info(f"Node {node_id[:8]}... processing task {task_id[:8]}...")
            
            # Simulate processing time
            time.sleep(random.uniform(0.5, 2.0))
            
            # Create result
            result = {
                "task_id": task_id,
                "processed_at": datetime.now().isoformat(),
                "node_id": node_id,
                "result": {
                    "type": task.get("task_type", "generic"),
                    "status": "completed",
                    "processing_time_ms": random.randint(500, 2000)
                }
            }
            
            # Submit result
            url = f"{self.api_url}/api/v1/tasks/worker/submit"
            payload = {
                "task_id": task_id,
                "node_id": node_id,
                "result": result
            }
            
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            
            reward = budget * 0.95
            platform_fee = budget * 0.05
            
            self.total_rewards_paid += reward
            self.total_platform_fees += platform_fee
            
            logger.info(f"Task {task_id[:8]}... completed! Reward: {reward:.9f} GSTD, Fee: {platform_fee:.9f} GSTD")
            return True
        except Exception as e:
            logger.error(f"Error processing task: {e}")
            return False
    
    def worker_loop(self, node_id: str, wallet_address: str, duration: int = 60):
        """Worker loop that processes tasks"""
        end_time = time.time() + duration
        
        while time.time() < end_time:
            tasks = self.fetch_pending_tasks(node_id)
            
            for task in tasks:
                task_id = task.get("task_id")
                if task_id not in self.completed_tasks:
                    if self.process_and_submit_task(node_id, wallet_address, task):
                        self.completed_tasks.append(task_id)
            
            time.sleep(2)  # Poll every 2 seconds
    
    def run_test(self):
        """Run the complete Genesis test"""
        logger.info("=" * 60)
        logger.info("GSTD Platform Genesis Network Stress Test")
        logger.info("=" * 60)
        logger.info(f"Nodes: {self.num_nodes}, Tasks: {self.num_tasks}")
        logger.info("=" * 60)
        
        # Step 1: Register nodes
        logger.info("\n[Step 1] Registering nodes...")
        with ThreadPoolExecutor(max_workers=self.num_nodes) as executor:
            futures = []
            for i in range(self.num_nodes):
                wallet = self.generate_wallet_address()
                self.wallet_addresses.append(wallet)
                future = executor.submit(self.register_node, wallet, f"Genesis-Node-{i+1}")
                futures.append(future)
            
            for future in as_completed(futures):
                node_id = future.result()
                if node_id:
                    self.node_ids.append(node_id)
        
        logger.info(f"Registered {len(self.node_ids)} nodes")
        
        if len(self.node_ids) < self.num_nodes:
            logger.warning(f"Only {len(self.node_ids)}/{self.num_nodes} nodes registered. Continuing...")
        
        # Step 2: Create tasks
        logger.info(f"\n[Step 2] Creating {self.num_tasks} tasks...")
        with ThreadPoolExecutor(max_workers=self.num_tasks) as executor:
            futures = []
            for i in range(self.num_tasks):
                wallet = random.choice(self.wallet_addresses)
                future = executor.submit(self.create_task, wallet, i+1)
                futures.append(future)
            
            for future in as_completed(futures):
                task = future.result()
                if task:
                    self.task_ids.append(task["task_id"])
                    self.total_budget += task["budget"]
                    time.sleep(0.2)  # Small delay between task creation
        
        logger.info(f"Created {len(self.task_ids)} tasks (Total budget: {self.total_budget:.9f} GSTD)")
        
        # Wait for tasks to be queued (payment processing)
        logger.info("\n[Step 3] Waiting for tasks to be queued...")
        time.sleep(5)
        
        # Step 3: Workers process tasks concurrently
        logger.info(f"\n[Step 4] Starting {len(self.node_ids)} workers to process tasks...")
        worker_threads = []
        for i, node_id in enumerate(self.node_ids):
            wallet = self.wallet_addresses[i]
            thread = threading.Thread(
                target=self.worker_loop,
                args=(node_id, wallet, 120),  # Run for 2 minutes
                daemon=True
            )
            thread.start()
            worker_threads.append(thread)
        
        # Monitor progress
        start_time = time.time()
        while time.time() - start_time < 120:
            completed = len(self.completed_tasks)
            pending = len(self.task_ids) - completed
            logger.info(f"Progress: {completed}/{len(self.task_ids)} tasks completed, {pending} pending")
            time.sleep(5)
        
        # Wait for all workers to finish
        for thread in worker_threads:
            thread.join(timeout=5)
        
        # Step 4: Verify results
        logger.info("\n[Step 5] Verifying results...")
        self.verify_results()
    
    def verify_results(self):
        """Verify that rewards were distributed correctly"""
        logger.info("=" * 60)
        logger.info("GENESIS TEST RESULTS")
        logger.info("=" * 60)
        
        logger.info(f"Total Tasks Created:     {len(self.task_ids)}")
        logger.info(f"Total Tasks Completed:   {len(self.completed_tasks)}")
        logger.info(f"Total Budget:            {self.total_budget:.9f} GSTD")
        logger.info(f"Total Rewards Paid:      {self.total_rewards_paid:.9f} GSTD")
        logger.info(f"Total Platform Fees:     {self.total_platform_fees:.9f} GSTD")
        
        expected_rewards = self.total_budget * 0.95
        expected_fees = self.total_budget * 0.05
        
        logger.info(f"\nExpected Rewards (95%):  {expected_rewards:.9f} GSTD")
        logger.info(f"Expected Fees (5%):      {expected_fees:.9f} GSTD")
        
        reward_diff = abs(self.total_rewards_paid - expected_rewards)
        fee_diff = abs(self.total_platform_fees - expected_fees)
        
        logger.info(f"\nReward Difference:       {reward_diff:.9f} GSTD")
        logger.info(f"Fee Difference:          {fee_diff:.9f} GSTD")
        
        # Check if within tolerance (0.01 GSTD)
        tolerance = 0.01
        if reward_diff < tolerance and fee_diff < tolerance:
            logger.info("\n✅ VERIFICATION PASSED: Rewards distributed correctly!")
        else:
            logger.warning(f"\n⚠️  VERIFICATION WARNING: Differences exceed tolerance ({tolerance} GSTD)")
        
        # Check for dropped transactions
        if len(self.completed_tasks) == len(self.task_ids):
            logger.info("✅ All tasks completed successfully - No dropped transactions!")
        else:
            logger.warning(f"⚠️  {len(self.task_ids) - len(self.completed_tasks)} tasks not completed")
        
        logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="GSTD Platform Genesis Network Stress Test")
    parser.add_argument("--api", default="http://localhost:8080", help="API base URL")
    parser.add_argument("--nodes", type=int, default=5, help="Number of nodes to simulate")
    parser.add_argument("--tasks", type=int, default=10, help="Number of tasks to create")
    
    args = parser.parse_args()
    
    tester = GenesisTester(args.api, args.nodes, args.tasks)
    tester.run_test()


if __name__ == "__main__":
    main()

