#!/usr/bin/env python3
"""
Script 1: Fetch News Content
Reads stocks from input JSON, fetches news articles, and saves to news_content.json
"""

import json
import os
from datetime import datetime, timedelta
from newsapi import NewsApiClient
import sys

# Configuration
NEWS_API_KEY = "ad3828da77694151a23be433536ad81f"  # Your existing API key
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'stocks_input.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'news_content.json')


def load_stocks_config():
    """Load stocks configuration from input JSON"""
    try:
        with open(INPUT_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Input file not found: {INPUT_FILE}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in input file: {e}")
        sys.exit(1)


def fetch_news_for_stock(stock_info, config, newsapi):
    """Fetch news articles for a single stock"""
    print(f"📰 Fetching news for {stock_info['company_name']}...")
    
    # Calculate date range
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    from_date = (today - timedelta(days=config['news_days_back'])).strftime(
        '%Y-%m-%d'
    )
    to_date = datetime.now().strftime('%Y-%m-%d')
    
    all_articles = []
    
    # Search for each term
    for search_term in stock_info['search_terms']:
        try:
            print(f"  🔍 Searching for: {search_term}")
            response = newsapi.get_everything(
                q=search_term,
                language=config['language'],
                sort_by='relevancy',
                from_param=from_date,
                to=to_date,
                page_size=config['max_articles_per_stock']
            )
            
            articles = response.get('articles', [])
            print(f"    Found {len(articles)} articles")
            
            # Add metadata to articles
            for article in articles:
                article['search_term'] = search_term
                article['fetched_at'] = datetime.now().isoformat()
            
            all_articles.extend(articles)
            
        except Exception as e:
            print(f"    ❌ Error fetching news for '{search_term}': {str(e)}")
    
    # Remove duplicates based on URL
    unique_articles = []
    seen_urls = set()
    for article in all_articles:
        if article['url'] not in seen_urls:
            unique_articles.append(article)
            seen_urls.add(article['url'])
    
    print(f"  ✅ Total unique articles: {len(unique_articles)}")
    return unique_articles


def main():
    """Main function to fetch news for all stocks"""
    print("🚀 Starting news fetching process...")
    
    # Load configuration
    data = load_stocks_config()
    stocks = data['stocks']
    config = data['config']
    
    # Initialize NewsAPI client
    try:
        newsapi = NewsApiClient(api_key=NEWS_API_KEY)
    except Exception as e:
        print(f"❌ Failed to initialize NewsAPI client: {e}")
        sys.exit(1)
    
    # Fetch news for all stocks
    news_data = {
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'total_stocks': len(stocks),
            'config': config
        },
        'stocks_news': []
    }
    
    for stock in stocks:
        articles = fetch_news_for_stock(stock, config, newsapi)
        
        stock_news = {
            'stock_info': stock,
            'articles_count': len(articles),
            'articles': articles
        }
        
        news_data['stocks_news'].append(stock_news)
    
    # Save to output file
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(news_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ News content saved to: {OUTPUT_FILE}")
        print("Summary:")
        for stock_news in news_data['stocks_news']:
            stock_name = stock_news['stock_info']['company_name']
            article_count = stock_news['articles_count']
            print(f"  - {stock_name}: {article_count} articles")
    
    except Exception as e:
        print(f"❌ Failed to save news content: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main() 