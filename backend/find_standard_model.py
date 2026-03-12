import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def find_working_model():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    models_to_try = [
        "gemini-1.5-flash-8b",
        "gemini-1.5-flash",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash",
        "gemma-2-27b-it",
        "gemma-2-9b-it",
        "gema-3-12b-it", # From the list I saw
        "gemini-2.0-flash-exp",
    ]
    
    for m in models_to_try:
        print(f"Testing {m}...")
        try:
            response = client.models.generate_content(
                model=m,
                contents="Say 'Hello'"
            )
            print(f"SUCCESS with {m}!")
            return m
        except Exception as e:
            print(f"FAILED with {m}: {e}")
    return None

if __name__ == "__main__":
    find_working_model()
