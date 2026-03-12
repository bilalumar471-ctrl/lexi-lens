import os
import asyncio
import traceback
from google import genai
from dotenv import load_dotenv

load_dotenv()

async def test_standard_api():
    print("Testing Standard API (generate_content)...")
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents="Say hello."
        )
        print(f"Standard API Success: {response.text}")
    except Exception as e:
        print(f"Standard API Failed: {e}")
        traceback.print_exc()

async def test_live_api(model_name):
    print(f"\nTesting Live API with model: {model_name}...")
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
    try:
        from google.genai import types
        config = types.LiveConnectConfig(response_modalities=["AUDIO"])
        async with client.aio.live.connect(model=model_name, config=config) as session:
            print(f"Live API Success with {model_name}!")
    except Exception as e:
        print(f"Live API Failed with {model_name}: {e}")
        # Capture full error message to check for "model not found" vs "permission denied"
        err_msg = str(e)
        if "404" in err_msg:
            print("  Reason: Model not found (404)")
        elif "403" in err_msg:
            print("  Reason: Permission denied (403)")
        elif "400" in err_msg:
            print("  Reason: Bad request (400) - check model name/config")
        else:
            print(f"  Raw Error: {err_msg}")

async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    print(f"Using API Key (first 8 chars): {api_key[:8] if api_key else 'None'}")
    
    await test_standard_api()
    
    # Try multiple variations
    models_to_test = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash-live-001",
        "gemini-2.0-flash-preview-0925",
    ]
    
    for model in models_to_test:
        await test_live_api(model)

if __name__ == "__main__":
    asyncio.run(main())
