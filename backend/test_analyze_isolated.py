
import asyncio
import os
import dotenv
from agent.analyze import predict_next_words

dotenv.load_dotenv()

async def main():
    print("Testing predict_next_words directly...")
    res = await predict_next_words("Once upon a")
    print(f"Result: {res}")

if __name__ == "__main__":
    asyncio.run(main())
