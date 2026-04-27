#!/usr/bin/env python3
"""
Script 2.5: Refine Summaries (OpenAI)
Takes the generated summaries and refines them with market overview and better 
structure.
"""

import json
import os
import sys
from openai import OpenAI

# Configuration
OPENAI_API_KEY = (
    "sk-proj-y8eBdM4oIa7VDve3_UztDQCguaEkUcmpxnDkd0f9ZsI00k11GotHyiV_hxH7Iy8"
    "NrOyMEJpgVLT3BlbkFJa5GJ580kD9cAFB-VGG8QSC7o1RQKCU7E4f2X9pxt1_sh299ABFwG"
    "gwZZ-7R8szNemxMixMCTcA"
)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'summaries.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'refined_summaries.json')


def load_summaries():
    """Load summaries from JSON file"""
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Input file not found: {INPUT_FILE}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in input file: {e}")
        sys.exit(1)


def refine_summaries(summaries_data, client):
    """Generate market overview and stock-specific insights using OpenAI."""
    
    prompt = f"""
    Analyze these stock market summaries and create a new format with two main 
    sections:

    1. Market Overview Section:
        - Extract common market themes and factors affecting multiple stocks
        - Highlight important market-wide developments
        - Include key economic indicators or events
        - Provide overall market sentiment
        - Format this section with clear headers and bullet points

    2. Stock-Specific Section:
        For each stock, include ONLY:
        - Company-specific developments (not general market news)
        - Direct impacts on the company
        - Unique challenges or opportunities
        - Stock-specific sentiment and rating
        - Important company headlines
        Remove any market-wide information that's covered in the overview.
        Keep the same markdown structure but:
        1. Remove any redundant information
        2. Focus only on the most important points
        3. Keep the same sections (TL;DR, Key Developments, etc.)
        4. Maintain the star rating format
        5. Keep only the most relevant headlines

    Return the response in this exact JSON structure:
    {{
        "metadata": {{
            "generated_at": "<current_timestamp>",
            "source_file": "<source_file>",
            "total_stocks": <number>
        }},
        "market_overview": "<market_overview_content>",
        "summaries": [
            {{
                "stock_info": {{...}},
                "articles_analyzed": <number>,
                "summary": "<stock_specific_content>",
                "generated_at": "<timestamp>"
            }},
            ...
        ]
    }}

    Input summaries:
    {json.dumps(summaries_data, indent=2)}
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini-2025-04-14",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a financial analyst expert at analyzing "
                        "stock market data and creating concise, "
                        "well-structured market reports."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        # Parse the JSON response
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"❌ Error refining summaries: {e}")
        return None


def main():
    """Main function to refine summaries"""
    print("🔍 Starting summary refinement process...")
    
    # Load summaries
    summaries_data = load_summaries()
    
    # Initialize OpenAI client
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception as e:
        print(f"❌ Failed to initialize OpenAI client: {e}")
        sys.exit(1)
    
    # Refine all summaries at once
    print("📝 Generating market overview and stock insights...")
    refined_data = refine_summaries(summaries_data, client)
    
    if not refined_data:
        print("❌ Failed to refine summaries")
        sys.exit(1)
    
    # Save refined summaries
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(refined_data, f, indent=4, ensure_ascii=False)
        print(f"✅ Refined summaries saved to: {OUTPUT_FILE}")
        print(
            f"📊 Generated market overview and refined "
            f"{len(refined_data['summaries'])} stock summaries"
        )
    except Exception as e:
        print(f"❌ Failed to save refined summaries: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
