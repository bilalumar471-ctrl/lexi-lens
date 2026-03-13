
import asyncio
from google import genai
from config import get_settings

async def list_models():
    settings = get_settings()
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    print("List of models:")
    try:
        models = client.models.list()
        for m in models:
            # Print without much truncation
            print(f"{m.name}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(list_models())
