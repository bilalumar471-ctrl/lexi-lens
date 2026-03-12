
import os
import asyncio
from google import genai
from dotenv import load_dotenv

load_dotenv()

def test_config(api_version, model_name):
    print(f"\n--- Testing version={api_version}, model={model_name} ---")
    try:
        client = genai.Client(
            api_key=os.environ.get("GEMINI_API_KEY"),
            http_options={'api_version': api_version} if api_version else None
        )
        response = client.models.generate_content(
            model=model_name,
            contents="Say 'Hello World'"
        )
        print(f"SUCCESS: {response.text}")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

def main():
    models = [
        "gemini-2.5-flash-native-audio-preview-12-2025",
        "gemini-2.5-flash-native-audio-preview",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "models/gemini-2.5-flash-native-audio-preview-12-2025",
        "models/gemini-1.5-flash"
    ]
    
    versions = [None, "v1alpha", "v1beta"]
    
    for v in versions:
        for m in models:
            if test_config(v, m):
                print(f"\n!!!!! FOUND WORKING COMBO: version={v}, model={m} !!!!!")
                return

if __name__ == "__main__":
    main()
