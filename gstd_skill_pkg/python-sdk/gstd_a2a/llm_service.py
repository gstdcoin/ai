import requests
import json
import os

class LLMService:
    def __init__(self, api_url=None):
        self.api_url = api_url or os.getenv("OLLAMA_URL", "http://ollama:11434")
        
    def generate(self, prompt, model="qwen2.5-coder:7b", system_prompt=None):
        """Generates a response using the local Ollama instance."""
        url = f"{self.api_url}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False
        }
        if system_prompt:
            payload["system"] = system_prompt
            
        try:
            resp = requests.post(url, json=payload, timeout=120)
            if resp.status_code == 200:
                return resp.json().get("response")
            return f"Error: {resp.status_code} - {resp.text}"
        except Exception as e:
            return f"Error connecting to Ollama: {str(e)}"

    def chat(self, messages, model="qwen2.5-coder:7b"):
        """Chat completion using local Ollama."""
        url = f"{self.api_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": False
        }
        try:
            resp = requests.post(url, json=payload, timeout=120)
            if resp.status_code == 200:
                return resp.json().get("message", {}).get("content")
            return f"Error: {resp.status_code} - {resp.text}"
        except Exception as e:
            return f"Error connecting to Ollama: {str(e)}"
