
import asyncio
import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

async def verify_async():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    model_name = "gemini-2.5-flash-native-audio-preview-12-2025"
    print(f"\nTrying model ASYNC: {model_name}...")
    try:
        response = await client.aio.models.generate_content(
            model=model_name,
            contents="Hello, say 'Async OK'"
        )
        print(f"SUCCESS with {model_name} (ASYNC)!")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"FAILED with {model_name} (ASYNC): {e}")

if __name__ == "__main__":
    asyncio.run(verify_async())
