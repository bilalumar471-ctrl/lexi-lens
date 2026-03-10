import asyncio, time
from google import genai
from config import get_settings

async def test():
    s = get_settings()
    c = genai.Client(api_key=s.GEMINI_API_KEY)
    prompt = (
        "You are a patient reading tutor. Rewrite this sentence in very simple words "
        "a 10-year-old can understand. Reply with ONLY the simplified sentence, nothing else.\n\n"
        'Original: "Artificial intelligence is a branch of computer science that focuses on creating intelligent machines."'
    )
    t0 = time.time()
    r = await asyncio.wait_for(
        c.aio.models.generate_content(model="gemini-2.5-flash", contents=prompt),
        timeout=10.0
    )
    elapsed = time.time() - t0
    print(f"Time: {elapsed:.2f}s")
    print(f"Result: {r.text.strip()}")

asyncio.run(test())
