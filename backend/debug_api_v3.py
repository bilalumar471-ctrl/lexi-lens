import os
import asyncio
from google import genai
from dotenv import load_dotenv

load_dotenv()

async def test_live_api(model_name, vertex_mode):
    print(f"\nTesting Live API with model: {model_name} and vertex={vertex_mode}...")
    api_key = os.environ.get("GEMINI_API_KEY")
    # Try with v1alpha explicitly
    client = genai.Client(
        api_key=api_key, 
        vertex=vertex_mode,
        http_options={"api_version": "v1alpha"}
    )
    try:
        from google.genai import types
        config = types.LiveConnectConfig(response_modalities=["AUDIO"])
        async with client.aio.live.connect(model=model_name, config=config) as session:
            print(f"SUCCESS: {model_name} works with vertex={vertex_mode}!")
            return True
    except Exception as e:
        print(f"FAILED: {model_name} with vertex={vertex_mode} -> {e}")
        return False

async def main():
    models = ["gemini-2.0-flash-exp", "gemini-2.0-flash"]
    for model in models:
        await test_live_api(model, vertex_mode=False)
        await test_live_api(model, vertex_mode=True)

if __name__ == "__main__":
    asyncio.run(main())
