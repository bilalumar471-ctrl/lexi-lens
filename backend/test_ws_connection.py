
import asyncio
import websockets
import json

async def test_ws():
    url = "ws://127.0.0.1:8000/ws/session"
    try:
        async with websockets.connect(url) as ws:
            print("Connected to WS")
            await ws.send(json.dumps({"session_token": "test-token"}))
            resp = await ws.recv()
            print(f"Received: {resp}")
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws())
