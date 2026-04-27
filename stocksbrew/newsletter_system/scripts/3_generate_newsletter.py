#!/usr/bin/env python3
"""
Script 3: Generate Newsletter
Reads summaries JSON, creates beautiful HTML newsletter using template,
and saves to output directory
"""

import json
import os
import re
from datetime import datetime
from string import Template

# Configuration
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'output')

INPUT_FILE = os.path.join(DATA_DIR, 'summaries.json')
TEMPLATE_FILE = os.path.join(TEMPLATES_DIR, 'newsletter_template.html')


def load_summaries():
    """Load summaries from JSON file"""
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Input file not found: {INPUT_FILE}")
        print("   Please run script 2 (generate_summaries.py) first")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in input file: {e}")
        return None


def load_template():
    """Load HTML template"""
    try:
        with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"❌ Template file not found: {TEMPLATE_FILE}")
        return None


def parse_summary_content(summary_text):
    """Parse the AI-generated summary into structured sections"""
    sections = {
        'tldr': '',
        'key_developments': [],
        'market_impact': [],
        'sentiment': '',
        'rating': '',
        'headlines': []
    }
    
    # Split by sections using regex
    current_section = None
    lines = summary_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check for section headers
        if re.search(r'\*\*TL;DR\*\*|TL;DR:', line, re.IGNORECASE):
            current_section = 'tldr'
            # Extract content after the header
            content = re.sub(r'\*\*TL;DR\*\*:?|TL;DR:?', '', line, flags=re.IGNORECASE).strip()
            if content:
                sections['tldr'] = content
        elif re.search(r'\*\*Key Developments?\*\*|Key Developments?:', line, re.IGNORECASE):
            current_section = 'key_developments'
        elif re.search(r'\*\*Market Impact\*\*|Market Impact:', line, re.IGNORECASE):
            current_section = 'market_impact'
        elif re.search(r'\*\*Sentiment Analysis\*\*|Sentiment Analysis:', line, re.IGNORECASE):
            current_section = 'sentiment'
        elif re.search(r'\*\*Investment Rating\*\*|Investment Rating:', line, re.IGNORECASE):
            current_section = 'rating'
        elif re.search(r'\*\*Key Headlines?\*\*|Key Headlines?:', line, re.IGNORECASE):
            current_section = 'headlines'
        else:
            # Add content to current section
            if current_section == 'tldr' and not sections['tldr']:
                sections['tldr'] = line
            elif current_section == 'key_developments' and line.startswith(('-', '•', '*')):
                sections['key_developments'].append(line.lstrip('-•* '))
            elif current_section == 'market_impact' and line.startswith(('-', '•', '*')):
                sections['market_impact'].append(line.lstrip('-•* '))
            elif current_section == 'sentiment' and not sections['sentiment']:
                sections['sentiment'] = line
            elif current_section == 'rating' and not sections['rating']:
                sections['rating'] = line
            elif current_section == 'headlines' and line.startswith(('-', '•', '*')):
                sections['headlines'].append(line.lstrip('-•* '))
    
    return sections


def extract_sentiment_class(sentiment_text):
    """Extract sentiment class for CSS styling"""
    sentiment_lower = sentiment_text.lower()
    if 'bullish' in sentiment_lower or 'positive' in sentiment_lower:
        return 'bullish'
    elif 'bearish' in sentiment_lower or 'negative' in sentiment_lower:
        return 'bearish'
    else:
        return 'neutral'


def extract_stars_and_rating(rating_text):
    """Extract star rating from rating text"""
    # Look for star patterns or numeric ratings
    star_match = re.search(r'([★⭐]{1,5})', rating_text)
    numeric_match = re.search(r'(\d+(?:\.\d+)?)\s*[/out of]*\s*5', rating_text)
    
    if star_match:
        return star_match.group(1), rating_text
    elif numeric_match:
        rating_num = float(numeric_match.group(1))
        stars = '★' * int(rating_num) + '☆' * (5 - int(rating_num))
        return stars, rating_text
    else:
        return '★★★☆☆', rating_text  # Default 3 stars


def generate_stock_section(summary_data):
    """Generate HTML section for a single stock"""
    stock_info = summary_data['stock_info']
    summary_text = summary_data['summary']
    
    # Parse summary content
    sections = parse_summary_content(summary_text)
    
    # Extract sentiment class
    sentiment_class = extract_sentiment_class(sections['sentiment'])
    
    # Extract stars and rating
    stars, rating_text = extract_stars_and_rating(sections['rating'])
    
    # Generate stock icon (first letter of company name)
    stock_icon = stock_info['company_name'][0].upper()
    
    # Build HTML section
    html = f"""
    <div class="stock-section">
        <div class="stock-header">
            <div class="stock-icon">{stock_icon}</div>
            <div class="stock-title">
                <h2>{stock_info['company_name']}</h2>
                <div class="stock-symbol">{stock_info['symbol']} • {stock_info['exchange']}</div>
            </div>
        </div>
        
        <div class="tldr">
            <h3>🧠 TL;DR</h3>
            <p>{sections['tldr'] or 'No summary available'}</p>
        </div>
        
        <div class="section">
            <h3><span class="section-icon">📈</span>Key Developments</h3>
            <ul>
    """
    
    for dev in sections['key_developments']:
        html += f"                <li>{dev}</li>\n"
    
    html += """            </ul>
        </div>
        
        <div class="section">
            <h3><span class="section-icon">📊</span>Market Impact</h3>
            <ul>
    """
    
    for impact in sections['market_impact']:
        html += f"                <li>{impact}</li>\n"
    
    html += f"""            </ul>
        </div>
        
        <div class="section">
            <h3><span class="section-icon">💭</span>Sentiment Analysis</h3>
            <p><span class="sentiment {sentiment_class}">{sections['sentiment'] or 'Neutral'}</span></p>
        </div>
        
        <div class="section">
            <h3><span class="section-icon">⭐</span>Investment Rating</h3>
            <div class="rating">
                <span class="stars">{stars}</span>
                <span class="rating-text">{rating_text or 'No rating available'}</span>
            </div>
        </div>
        
        <div class="section news-links">
            <h3><span class="section-icon">📰</span>Key Headlines</h3>
            <ul>
    """
    
    for headline in sections['headlines']:
        html += f"                <li>{headline}</li>\n"
    
    html += """            </ul>
        </div>
    </div>
    """
    
    return html


def generate_newsletter(summaries_data, template):
    """Generate complete newsletter HTML"""
    # Generate stock sections
    stock_sections = ""
    for summary in summaries_data['summaries']:
        stock_sections += generate_stock_section(summary)
    
    # Get current date
    current_date = datetime.now().strftime("%B %d, %Y")
    
    # Replace template variables
    newsletter_html = template.replace('{{newsletter_title}}', 'StocksBrew Newsletter')
    newsletter_html = newsletter_html.replace('{{date}}', current_date)
    newsletter_html = newsletter_html.replace('{{stock_sections}}', stock_sections)
    
    return newsletter_html


def main():
    """Main function to generate newsletter"""
    print("📧 Starting newsletter generation process...")
    
    # Load summaries
    summaries_data = load_summaries()
    if not summaries_data:
        return
    
    # Load template
    template = load_template()
    if not template:
        return
    
    # Generate newsletter
    print("🎨 Generating newsletter HTML...")
    newsletter_html = generate_newsletter(summaries_data, template)
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"newsletter_{timestamp}.html"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    # Save newsletter
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(newsletter_html)
        
        print(f"✅ Newsletter generated successfully!")
        print(f"📄 Saved to: {output_path}")
        print(f"📊 Newsletter contains {len(summaries_data['summaries'])} stock(s)")
        
        # Also save a copy with a simple name for easy access
        simple_path = os.path.join(OUTPUT_DIR, "latest_newsletter.html")
        with open(simple_path, 'w', encoding='utf-8') as f:
            f.write(newsletter_html)
        print(f"📄 Also saved as: {simple_path}")
        
    except Exception as e:
        print(f"❌ Failed to save newsletter: {e}")


if __name__ == "__main__":
    main() 