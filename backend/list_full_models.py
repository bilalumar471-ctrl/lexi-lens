import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def list_models_simple():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    print("Full model list:")
    try:
        models = client.models.list()
        for m in models:
            print(f"{m.name}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models_simple()
