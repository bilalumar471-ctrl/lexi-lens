import os
import traceback
from agent.analyze import analyze_text, analyze_notes
from dotenv import load_dotenv

load_dotenv()

def test_analyze():
    sample_text = "Dyslexia is a learning difference that can make reading and writing difficult. However, many people with dyslexia are very creative."
    
    print("Testing analyze_text...")
    try:
        words = analyze_text(sample_text)
        print(f"Words: {words}")
    except Exception:
        traceback.print_exc()
    
    print("\nTesting analyze_notes...")
    try:
        notes = analyze_notes(sample_text)
        print(f"Notes: {notes}")
    except Exception:
        traceback.print_exc()

if __name__ == "__main__":
    test_analyze()
