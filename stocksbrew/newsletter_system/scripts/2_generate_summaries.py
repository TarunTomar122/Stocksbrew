#!/usr/bin/env python3
"""
Script 2: Generate Summaries
Reads news content JSON, processes through AI model to create bullet point
summaries, and saves to summaries.json
"""

import json
import os
from datetime import datetime
from openai import OpenAI
import sys

# Configuration
OPENAI_API_KEY = (
    "sk-proj-y8eBdM4oIa7VDve3_UztDQCguaEkUcmpxnDkd0f9ZsI00k11GotHyiV_hxH7Iy8"
    "NrOyMEJpgVLT3BlbkFJa5GJ580kD9cAFB-VGG8QSC7o1RQKCU7E4f2X9pxt1_sh299ABFwG"
    "gwZZ-7R8szNemxMixMCTcA"
)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'news_content.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'summaries.json')


def load_news_content():
    """Load news content from JSON file"""
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Input file not found: {INPUT_FILE}")
        print("   Please run script 1 (fetch_news.py) first")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in input file: {e}")
        sys.exit(1)


def prepare_content_for_analysis(stock_news):
    """Prepare news content for AI analysis"""
    stock_info = stock_news['stock_info']
    articles = stock_news['articles']
    
    if not articles:
        return None
    
    content = f"Stock: {stock_info['company_name']} ({stock_info['symbol']})\n"
    content += f"Exchange: {stock_info['exchange']}\n\n"
    content += "Recent News Articles:\n\n"
    
    for i, article in enumerate(articles[:10], 1):  # Limit to top 10 articles
        content += f"{i}. Title: {article['title']}\n"
        if article.get('description'):
            content += f"   Description: {article['description']}\n"
        if article.get('content'):
            # Limit content length to avoid token limits
            content_preview = article['content'][:500]
            content += f"   Content: {content_preview}...\n"
        content += f"   URL: {article['url']}\n"
        content += f"   Published: {article['publishedAt']}\n\n"
    
    return content


def generate_summary(content, openai_client):
    """Generate AI summary for stock news content"""
    
    system_prompt = """You are a financial analyst creating concise, actionable 
    stock market summaries. Your goal is to extract the most important 
    information for newsletter readers."""
    
    user_prompt = f"""
    Analyze the following stock news content and create a structured summary 
    with these sections:

    1. **TL;DR** (1 sentence): Most critical development
    2. **Key Developments** (3-5 bullet points): What happened recently
    3. **Market Impact** (2-3 bullet points): How this affects the stock/sector
    4. **Sentiment Analysis**: Overall sentiment (Bullish/Neutral/Bearish) 
       with brief explanation
    5. **Investment Rating**: Buy/Hold/Sell with 1-5 star rating and 
       brief justification
    6. **Key Headlines** (3-5 items): Most important article titles with 
       brief summaries

    ## Important Notes:
    - If you don't have enough information about a topic, skip that section. Like keep that empty.

    Keep each bullet point concise (1-2 sentences max). Focus on actionable 
    insights and recent developments.

    Content to analyze:
    {content}
    """
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4.1-mini-2025-04-14",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=1500
        )
        
        return response.choices[0].message.content
    
    except Exception as e:
        print(f"❌ Error generating summary: {e}")
        return None


def main():
    """Main function to generate summaries for all stocks"""
    print("🤖 Starting summary generation process...")
    
    # Load news content
    news_data = load_news_content()
    
    # Initialize OpenAI client
    try:
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception as e:
        print(f"❌ Failed to initialize OpenAI client: {e}")
        sys.exit(1)
    
    # Generate summaries
    summaries_data = {
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'source_file': INPUT_FILE,
            'total_stocks': len(news_data['stocks_news'])
        },
        'summaries': []
    }
    
    for stock_news in news_data['stocks_news']:
        stock_name = stock_news['stock_info']['company_name']
        print(f"📊 Generating summary for {stock_name}...")
        
        # Prepare content
        content = prepare_content_for_analysis(stock_news)
        if not content:
            print(f"  ⚠️  No content available for {stock_name}")
            continue
        
        # Generate summary
        summary = generate_summary(content, openai_client)
        if not summary:
            print(f"  ❌ Failed to generate summary for {stock_name}")
            continue
        
        summary_data = {
            'stock_info': stock_news['stock_info'],
            'articles_analyzed': len(stock_news['articles']),
            'summary': summary,
            'generated_at': datetime.now().isoformat()
        }
        
        summaries_data['summaries'].append(summary_data)
        print(f"  ✅ Summary generated for {stock_name}")

    # Save summaries
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(summaries_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Summaries saved to: {OUTPUT_FILE}")
        print("📊 Summary generation complete:")
        for summary in summaries_data['summaries']:
            stock_name = summary['stock_info']['company_name']
            articles_count = summary['articles_analyzed']
            print(f"  - {stock_name}: {articles_count} articles analyzed")
    
    except Exception as e:
        print(f"❌ Failed to save summaries: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main() 