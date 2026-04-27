#!/usr/bin/env python3
"""
Script 2 (Gemini Version): Generate Summaries
Reads news content JSON, processes through Gemini AI model to create bullet point
summaries, and saves to summaries.json
"""

import json
import os
from datetime import datetime
import google.generativeai as genai
import sys

# Configuration
GEMINI_API_KEY = "AIzaSyAyycEffMJ-NaBNgp4hYKulRFcKvH9vNIo"  

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


def generate_summary(content, gemini_model):
    """Generate AI summary for stock news content using Gemini"""
    
    prompt = f"""
    Analyze the following stock news content and create a structured summary 
    with these sections:

    1. **TL;DR** (1 sentence): Most critical development about the stock in question
    2. **Key Developments** (1-3 bullet points): What happened recently about the stock in question
    3. **Market Impact** (1-3 bullet points): How this affects the stock/sector
    4. **Sentiment Analysis**: Overall sentiment (Bullish/Neutral/Bearish) 
       with brief explanation about the stock in question
    5. **Investment Rating**: Buy/Hold/Sell with 1-5 star rating and 
       brief justification

    Keep each bullet point concise (1-2 sentences max). Focus on actionable 
    insights and recent developments but only talk about the stock in question and not the market in general.

    ## Important Notes:
    - Do repeat any information twice in any sections.
    - Do not talk about the market in general, only the stock in question.
    - Do not say not enough information, if you don't have enough information about a topic, skip that section.

    Content to analyze:
    {content}
    """
    
    try:
        response = gemini_model.generate_content(prompt)
        return response.text
    
    except Exception as e:
        print(f"❌ Error generating summary: {e}")
        return None


def main():
    """Main function to generate summaries for all stocks"""
    print("🤖 Starting summary generation with Gemini...")
    
    # Load news content
    news_data = load_news_content()
    
    # Initialize Gemini
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel('gemini-2.5-flash-preview-04-17')
    except Exception as e:
        print(f"❌ Failed to initialize Gemini: {e}")
        sys.exit(1)
    
    # Generate summaries
    summaries_data = {
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'source_file': INPUT_FILE,
            'model': 'gemini-2.5-flash-preview-04-17',
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
        summary = generate_summary(content, gemini_model)
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