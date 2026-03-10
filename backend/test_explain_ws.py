import asyncio
import websockets
import json

async def test_explain():
    uri = "ws://127.0.0.1:8000/ws"
    async with websockets.connect(uri) as ws:
        # Wait for ready
        msg = await ws.recv()
        print("Ready received:", msg)

        # Send set_context
        await ws.send(json.dumps({
            "type": "set_context",
            "text": "Artificial Intelligence (AI) is intelligence demonstrated by machines."
        }))
        print("Sent set_context.")
        
        # Wait a bit
        await asyncio.sleep(2)
        
        # Send explain
        await ws.send(json.dumps({
            "type": "explain",
            "text": "Artificial Intelligence (AI) is intelligence demonstrated by machines."
        }))
        print("Sent explain.")
        
        # Listen for binary or text
        while True:
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=20.0)
                if isinstance(response, bytes):
                    print(f"Received Audio Chunk: {len(response)} bytes")
                else:
                    print(f"Received JSON: {response}")
                    if "explain_done" in response:
                        print("Explain sequence finished.")
                        break
            except asyncio.TimeoutError:
                print("Timed out waiting for response.")
                break

if __name__ == "__main__":
    asyncio.run(test_explain())
