import asyncio
import os
import sys
from google import genai

def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
    
    try:
        models = client.models.list()
        live_models = []
        for m in models:
            # We look for bidiGenerateContent or just print all 2.0 models to see what is returned
            if "gemini-2.0" in m.name:
                print(f"Model: {m.name}, supported_actions: {m.supported_generation_methods}")
                
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    main()
