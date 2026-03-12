import os
import asyncio
from google import genai
from dotenv import load_dotenv

load_dotenv()

async def test_compatibility():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
    
    models = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-native-audio-preview-12-2025"
    ]
    
    for m in models:
        print(f"\n--- Testing Model: {m} ---")
        
        # 1. Test standard generation
        try:
            resp = client.models.generate_content(model=m, contents="Hi")
            print(f"  [Standard Gen] SUCCESS: {resp.text[:20]}...")
        except Exception as e:
            print(f"  [Standard Gen] FAILED: {e}")
            
        # 2. Test Live API (bidiGenerateContent)
        try:
            # We don't need a full session, just try to connect
            async with client.aio.live.connect(model=m, config={"response_modalities": ["AUDIO"]}) as session:
                print(f"  [Live API] SUCCESS: Connected to {m}")
        except Exception as e:
            print(f"  [Live API] FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test_compatibility())
