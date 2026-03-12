import requests
import time

try:
    print("Testing backend health...")
    start = time.time()
    r = requests.get("http://127.0.0.1:8000/health", timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
    print(f"Time taken: {time.time() - start:.2f}s")
except Exception as e:
    print(f"Error: {e}")
