"""Test what part.thought looks like in Live API responses"""
import asyncio
from google import genai
from google.genai import types
from config import get_settings

async def test():
    s = get_settings()
    c = genai.Client(api_key=s.GEMINI_API_KEY, http_options={"api_version": "v1alpha"})
    
    async with c.aio.live.connect(
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        config=types.LiveConnectConfig(response_modalities=["AUDIO"])
    ) as session:
        await session.send(input="Say hello", end_of_turn=True)
        
        async for response in session.receive():
            if response.server_content and response.server_content.model_turn:
                for part in response.server_content.model_turn.parts:
                    thought_val = getattr(part, 'thought', 'NOT_SET')
                    has_audio = bool(part.inline_data and part.inline_data.data)
                    has_text = bool(part.text)
                    print(f"Part: thought={thought_val}, has_audio={has_audio}, has_text={has_text}")
                    if has_text:
                        print(f"  Text: {part.text[:100]}")
            
            if response.server_content and response.server_content.turn_complete:
                print("Turn complete")
                break

asyncio.run(test())
