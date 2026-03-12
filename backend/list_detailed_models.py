import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def list_detailed_models():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    print("Listing models and their methods...")
    try:
        models = client.models.list()
        for m in models:
            # In google-genai 1.x, the model object has specific attributes
            print(f"Model: {m.name}")
            try:
                # Try common attribute names
                methods = getattr(m, 'supported_generation_methods', getattr(m, 'supported_methods', []))
                print(f"  Methods: {methods}")
            except:
                pass
    except Exception as e:
        print(f"Error listing: {e}")

if __name__ == "__main__":
    list_detailed_models()
