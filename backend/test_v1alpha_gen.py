import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def test_v1alpha_generate():
    api_key = os.environ.get("GEMINI_API_KEY")
    # THE SECRET SAUCE: v1alpha client
    client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
    
    # Try the models we saw
    models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"]
    
    for m in models:
        print(f"Testing {m} with v1alpha...")
        try:
            response = client.models.generate_content(
                model=m,
                contents="Say 'V1ALPHA OK'"
            )
            print(f"SUCCESS with {m} and v1alpha!")
            print(f"Response: {response.text}")
            return m
        except Exception as e:
            print(f"FAILED with {m}: {e}")
    return None

if __name__ == "__main__":
    test_v1alpha_generate()
