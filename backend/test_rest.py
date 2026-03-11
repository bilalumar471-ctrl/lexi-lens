import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1alpha/models?key={api_key}"
response = requests.get(url)

data = response.json()
count = 0
for m in data.get("models", []):
    methods = m.get("supportedGenerationMethods", [])
    if "bidiGenerateContent" in methods:
        print(f"Supported Live Model: {m['name']}")
        count += 1

if count == 0:
    print("NO MODELS SUPPORT bidiGenerateContent ON THIS API KEY (v1alpha)!")

url_beta = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
res_beta = requests.get(url_beta).json()
for m in res_beta.get("models", []):
    methods = m.get("supportedGenerationMethods", [])
    if "bidiGenerateContent" in methods:
        print(f"[v1beta] Supported Live Model: {m['name']}")
