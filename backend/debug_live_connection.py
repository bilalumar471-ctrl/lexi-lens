
import asyncio
import os
import dotenv
from google import genai
from google.genai import types

dotenv.load_dotenv()

async def test_live():
    client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
    # Try different model formats
    models_to_try = [
        'gemini-2.0-flash-exp',
        'models/gemini-2.0-flash-exp',
        'gemini-2.0-flash',
        'models/gemini-2.0-flash'
    ]
    
    for model_id in models_to_try:
        print(f"\n--- Testing model: {model_id} ---")
        try:
            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                system_instruction=types.Content(parts=[types.Part(text="Hello")])
            )
            async with client.aio.live.connect(model=model_id, config=config) as session:
                print(f"SUCCESS with {model_id}!")
                return
        except Exception as e:
            print(f"FAILED with {model_id}: {e}")

if __name__ == "__main__":
    asyncio.run(test_live())
