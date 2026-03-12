
import asyncio
import os
import dotenv
from google import genai
from google.genai import types

dotenv.load_dotenv()

async def test_live():
    with open('debug_output_utf8.txt', 'w', encoding='utf-8') as f:
        client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
        models_to_try = [
            'gemini-2.5-flash',
            'models/gemini-2.5-flash',
            'gemini-2.5-flash-native-audio-preview-12-2025',
            'models/gemini-2.5-flash-native-audio-preview-12-2025',
            'gemini-2.0-flash-exp'
        ]
        
        for model_id in models_to_try:
            f.write(f"\n--- Testing model: {model_id} ---\n")
            try:
                config = types.LiveConnectConfig(
                    response_modalities=["AUDIO"],
                    system_instruction=types.Content(parts=[types.Part(text="Hello")])
                )
                async with client.aio.live.connect(model=model_id, config=config) as session:
                    f.write(f"SUCCESS with {model_id}!\n")
                    print(f"SUCCESS with {model_id}!")
                    return
            except Exception as e:
                f.write(f"FAILED with {model_id}: {e}\n")
                print(f"FAILED with {model_id}: {e}")

if __name__ == "__main__":
    asyncio.run(test_live())
