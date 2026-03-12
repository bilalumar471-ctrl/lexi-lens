import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def verify():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("No API Key found in .env")
        return
    
    print(f"Using API Key: {api_key[:8]}...")
    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents="Hello, are you working?"
        )
        print("Standard API (1.5 Flash) Success!")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Standard API Failed: {e}")

if __name__ == "__main__":
    verify()
