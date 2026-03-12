import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def verify():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    # Names found in list or used in user scripts
    models_to_try = [
        "gemini-2.5-flash-native-audio-latest",
        "gemini-2.5-flash-native-audio-preview",
        "gemini-2.0-flash-native-audio-preview-12-2025",
        "gemini-1.5-flash"
    ]
    
    for model_name in models_to_try:
        print(f"\nTrying model: {model_name}...")
        try:
            response = client.models.generate_content(
                model=model_name,
                contents="Hello, say 'Test OK'"
            )
            print(f"SUCCESS with {model_name}!")
            print(f"Response: {response.text}")
            return # Stop at first success
        except Exception as e:
            print(f"FAILED with {model_name}: {e}")

if __name__ == "__main__":
    verify()
