import asyncio
import os
import sys
from google import genai
from google.genai import types

async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    # create a dummy image to test the API method in `documents.py`
    data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0bIDAT\x08\xd7c\xfa\xcf\x00\x00\x02\x07\x01\x02\x9a\x1c1q\x00\x00\x00\x00IEND\xaeB`\x82"
    
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Content(
                    parts=[
                        types.Part.from_bytes(data=data, mime_type="image/png"),
                        types.Part.from_text(text="Extract all visible text from this image."),
                    ]
                )
            ],
        )
        print("Success:", response.text)
    except Exception as e:
        with open("output9.txt", "w") as f:
            f.write(f"Error Code: {getattr(e, 'status_code', 'None')}\n")
            f.write(f"Message: {str(e)}\n")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(main())
