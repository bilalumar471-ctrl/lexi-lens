
import os
from config import Settings, get_settings
from dotenv import load_dotenv

load_dotenv()

print("--- DEBUG SETTINGS ---")
import config
print(f"config file: {config.__file__}")
s = get_settings()
print(f"GEMINI_MODEL: {s.GEMINI_MODEL}")
print(f"GEMINI_API_KEY (last 4): {s.GEMINI_API_KEY[-4:] if s.GEMINI_API_KEY else 'NONE'}")
print(f"ENV MODEL (os.environ): {os.environ.get('GEMINI_MODEL')}")

with open('config.py', 'r') as f:
    lines = f.readlines()
    print(f"LINE 40 of {os.path.abspath('config.py')}: {lines[39] if len(lines) > 39 else 'N/A'}")

with open('.env', 'r') as f:
    print("--- .env file ---")
    print(f.read())
