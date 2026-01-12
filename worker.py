#!/usr/bin/env python3
"""
GSTD Platform Worker Client
Connects to the GSTD Platform API and processes distributed computing tasks.
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from typing import Dict, Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class GSTDWorker:
    """GSTD Platform Worker Client"""
    
    def __init__(self, node_id: str, api_url: str):
        self.node_id = node_id
        self.api_url = api_url.rstrip('/')
        self.session = self._create_session()
        self.tasks_completed = 0
        self.total_rewards = 0.0
        self.start_time = datetime.now()
        
    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy"""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
    
    def fetch_pending_tasks(self) -> list:
        """Fetch pending tasks from the API"""
        try:
            url = f"{self.api_url}/api/v1/tasks/worker/pending"
            params = {"node_id": self.node_id}
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            return data.get("tasks", [])
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching tasks: {e}")
            return []
    
    def process_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a task based on its type.
        Returns the result that will be submitted to the API.
        """
        task_id = task.get("task_id")
        task_type = task.get("task_type", "").upper()
        payload_str = task.get("payload")
        
        logger.info(f"Processing task {task_id} (type: {task_type})")
        
        # Parse payload if available
        payload = {}
        if payload_str:
            try:
                payload = json.loads(payload_str) if isinstance(payload_str, str) else payload_str
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON payload for task {task_id}")
        
        # Simulate task processing based on type
        result = {
            "task_id": task_id,
            "processed_at": datetime.now().isoformat(),
            "node_id": self.node_id,
        }
        
        if task_type == "AI_INFERENCE":
            logger.info("Processing AI Inference task...")
            # Simulate AI inference processing
            time.sleep(2)  # Simulate processing time
            result["result"] = {
                "type": "ai_inference",
                "output": "Simulated AI inference result",
                "confidence": 0.95,
                "processing_time_ms": 2000
            }
        elif task_type == "DATA_PROCESSING":
            logger.info("Processing Data Processing task...")
            time.sleep(1)
            result["result"] = {
                "type": "data_processing",
                "processed_items": 100,
                "processing_time_ms": 1000
            }
        elif task_type == "COMPUTATION":
            logger.info("Processing Computation task...")
            time.sleep(1.5)
            result["result"] = {
                "type": "computation",
                "result": 42,
                "processing_time_ms": 1500
            }
        else:
            logger.warning(f"Unknown task type: {task_type}, using default processing")
            time.sleep(1)
            result["result"] = {
                "type": "generic",
                "status": "completed",
                "processing_time_ms": 1000
            }
        
        # Add payload data to result if available
        if payload:
            result["input_payload"] = payload
        
        return result
    
    def submit_result(self, task_id: str, result: Dict[str, Any]) -> bool:
        """Submit task result to the API"""
        try:
            url = f"{self.api_url}/api/v1/tasks/worker/submit"
            payload = {
                "task_id": task_id,
                "node_id": self.node_id,
                "result": result
            }
            
            response = self.session.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            logger.info(f"Task {task_id} submitted successfully: {data.get('message', 'OK')}")
            return True
        except requests.exceptions.RequestException as e:
            logger.error(f"Error submitting result for task {task_id}: {e}")
            return False
    
    def display_status(self):
        """Display current worker status"""
        runtime = datetime.now() - self.start_time
        runtime_str = str(runtime).split('.')[0]  # Remove microseconds
        
        # Clear screen and display status
        print("\033[2J\033[H", end="")  # Clear screen
        print("=" * 60)
        print("GSTD Platform Worker")
        print("=" * 60)
        print(f"Node ID:     {self.node_id}")
        print(f"API URL:     {self.api_url}")
        print(f"Status:      🟢 ONLINE")
        print(f"Runtime:     {runtime_str}")
        print("-" * 60)
        print(f"Tasks Completed:  {self.tasks_completed}")
        print(f"Total Rewards:    {self.total_rewards:.9f} GSTD")
        print("=" * 60)
        print(f"Last update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("Press Ctrl+C to stop")
        print()
    
    def run(self):
        """Main worker loop"""
        logger.info(f"Starting GSTD Worker (Node ID: {self.node_id})")
        logger.info(f"Connecting to API: {self.api_url}")
        
        poll_interval = 10  # seconds
        
        try:
            while True:
                self.display_status()
                
                # Fetch pending tasks
                tasks = self.fetch_pending_tasks()
                
                if tasks:
                    logger.info(f"Found {len(tasks)} pending task(s)")
                    
                    for task in tasks:
                        task_id = task.get("task_id")
                        budget = task.get("budget_gstd", 0)
                        
                        # Process the task
                        result = self.process_task(task)
                        
                        # Submit the result
                        if self.submit_result(task_id, result):
                            self.tasks_completed += 1
                            # Estimate reward (95% of budget)
                            reward = budget * 0.95 if budget else 0
                            self.total_rewards += reward
                            logger.info(f"Task {task_id} completed! Reward: {reward:.9f} GSTD")
                        else:
                            logger.error(f"Failed to submit result for task {task_id}")
                else:
                    logger.debug("No pending tasks found")
                
                # Wait before next poll
                time.sleep(poll_interval)
                
        except KeyboardInterrupt:
            logger.info("\nShutting down worker...")
            self.display_status()
            print("\nWorker stopped. Thank you for contributing to the GSTD Platform!")
            sys.exit(0)
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            sys.exit(1)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="GSTD Platform Worker - Process distributed computing tasks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 worker.py --node_id abc123 --api https://app.gstdtoken.com/api/v1
  python3 worker.py --node_id abc123 --api http://localhost:8080
        """
    )
    
    parser.add_argument(
        "--node_id",
        required=True,
        help="Your registered node ID (get it from the dashboard after registering a device)"
    )
    
    parser.add_argument(
        "--api",
        default="https://app.gstdtoken.com/api/v1",
        help="API base URL (default: https://app.gstdtoken.com/api/v1 - Mainnet)"
    )
    
    args = parser.parse_args()
    
    # Create and run worker
    worker = GSTDWorker(args.node_id, args.api)
    worker.run()


if __name__ == "__main__":
    main()

