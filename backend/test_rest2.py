import os
import requests
from dotenv import load_dotenv
import json

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1alpha/models?key={api_key}"
response = requests.get(url)
data = response.json()

results = []
for m in data.get("models", []):
    methods = m.get("supportedGenerationMethods", [])
    if "bidiGenerateContent" in methods:
        results.append(m['name'])

url_beta = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
res_beta = requests.get(url_beta).json()
for m in res_beta.get("models", []):
    methods = m.get("supportedGenerationMethods", [])
    if "bidiGenerateContent" in methods:
        results.append(f"[v1beta] {m['name']}")

with open("live_models.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
