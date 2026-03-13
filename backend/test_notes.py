
import asyncio
from agent.analyze import analyze_notes
from config import get_settings

async def test():
    settings = get_settings()
    print(f"Testing with model: {settings.REST_GEMINI_MODEL}")
    try:
        res = await analyze_notes("This is a test sentence for summary notes.")
        print("Result:", res)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test())
