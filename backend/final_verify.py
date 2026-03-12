import os
import asyncio
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

async def verify_live():
    api_key = os.environ.get("GEMINI_API_KEY")
    model_name = "gemini-2.5-flash-native-audio-latest"
    print(f"Final Test: Connecting to {model_name} with v1alpha...")
    
    client = genai.Client(
        api_key=api_key, 
        http_options={"api_version": "v1alpha"}
    )
    
    try:
        config = types.LiveConnectConfig(response_modalities=["AUDIO"])
        # Use sync connect if async fails or vice versa, but SDK 1.x uses aio.live.connect
        async with client.aio.live.connect(model=model_name, config=config) as session:
            print(f"SUCCESS! Live API session established with {model_name}")
            return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(verify_live())
