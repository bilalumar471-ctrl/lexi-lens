import os
import asyncio
import traceback
from google import genai
from dotenv import load_dotenv

load_dotenv()

async def test_live_api(model_name, api_version):
    print(f"\nTesting Live API with model: {model_name} and API version: {api_version}...")
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key, http_options={"api_version": api_version})
    try:
        from google.genai import types
        config = types.LiveConnectConfig(response_modalities=["AUDIO"])
        async with client.aio.live.connect(model=model_name, config=config) as session:
            print(f"SUCCESS: {model_name} works with {api_version}!")
            return True
    except Exception as e:
        print(f"FAILED: {model_name} with {api_version} -> {e}")
        return False

async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    print(f"Using API Key: {api_key[:8]}...")
    
    versions = ["v1alpha", "v1beta"]
    models = ["gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-2.0-flash-live-001"]
    
    for version in versions:
        for model in models:
            await test_live_api(model, version)

if __name__ == "__main__":
    asyncio.run(main())
