import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def list_supported_models():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    print("Listing models that support bidiGenerateContent...")
    try:
        models = client.models.list()
        for m in models:
            if 'bidiGenerateContent' in m.supported_generation_methods:
                print(f"Model: {m.name} (Methods: {m.supported_generation_methods})")
    except Exception as e:
        print(f"Failed to list models: {e}")

if __name__ == "__main__":
    list_supported_models()
