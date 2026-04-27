import os
from datetime import datetime, timedelta
from newsapi import NewsApiClient
from openai import OpenAI

# Configure API keys
OPENAI_API_KEY = (
    "sk-proj-y8eBdM4oIa7VDve3_UztDQCguaEkUcmpxnDkd0f9ZsI00k11GotHyiV_hxH7Iy8"
    "NrOyMEJpgVLT3BlbkFJa5GJ580kD9cAFB-VGG8QSC7o1RQKCU7E4f2X9pxt1_sh299ABFwG"
    "gwZZ-7R8szNemxMixMCTcA"
)
NEWS_API_KEY = "ad3828da77694151a23be433536ad81f"

# Initialize clients
newsapi = NewsApiClient(NEWS_API_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

def get_news_for_topic(topic, days=1):
    """Fetch news articles for a given topic."""
    try:
        print(f"Fetching news for {topic}")
        # Get today's date at midnight
        today_midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        # Get yesterday's date at midnight
        from_date = (today_midnight - timedelta(days=days)).strftime('%Y-%m-%d')
        to_date = datetime.now().strftime('%Y-%m-%d')
        
        response = newsapi.get_everything(
            q=topic,
            language='en',
            sort_by='relevancy',
            from_param=from_date,
            to=to_date
        )
        print(f"Fetched news for {topic} and found {len(response.get('articles', []))} articles")
        return response.get('articles', [])[:5]  # Get top 5 articles
    except Exception as e:
        print(f"Error fetching news for {topic}: {str(e)}")
        return []

def generate_newsletter_content(topics_and_articles):
    """Generate complete newsletter content using OpenAI."""
    
    # Prepare context with all topics and their articles
    context = "Here are the latest updates for multiple stocks. Analyze each stock separately:\n\n"
    for topic, articles in topics_and_articles:
        if not articles:
            continue
            
        context += f"\n=== {topic} ===\n"
        for i, article in enumerate(articles, 1):
            context += (
                f"{i}. {article['title']}\n"
                f"Description: {article['description']}\n"
                f"URL: {article['url']}\n"
                f"Content: {article['content']}\n\n"
            )
    
    # save context to a file
    with open('context.txt', 'w') as f:
        f.write(context)

    prompt = """
Analyze EACH stock separately and create a detailed section for each one. For each stock section, include:
1. TL;DR: One-liner summary of the most critical development
2. Key Development: A few bullet points outlining what happened
3. Sector Sentiment: Bullet points on overall market reaction/sentiment (Bullish/Neutral/Bearish)
4. Investment Rating: Rate from 1-5 stars (include both stars and numeric)
5. Outlook: Future implications
6. News Articles: Key headlines with URLs and short summaries

Format EACH stock section using this HTML email-friendly structure:

<table width="100%" cellpadding="0" cellspacing="0" style="max-width:850px; margin:auto; font-family: Arial, sans-serif; background:#ffffff; border: 1px solid #E5E7EB; border-radius: 8px; padding:24px; box-shadow:0 2px 8px rgba(0,0,0,0.05); margin-bottom:20px;">
  <tr>
    <td>
      <h2 style="color:#0050b3; font-size:28px; margin-bottom:8px;">📈 [STOCK NAME] (without the trailing 'Stock India')</h2>
      <p style="font-size:18px; margin:0 0 20px; color:#333;">
        <strong>🧠 TL;DR:</strong> [One-liner summary here]
      </p>

      <h3 style="font-size:24px; color:#d35400; margin:20px 0 6px;">❗ Key Development</h3>
      <ul style="padding-left:20px; margin:0; color:#444; font-size:14px;">
        <li>[Development point 1]</li>
        <li>[Development point 2]</li>
      </ul>

      <h3 style="font-size:24px; color:#1a73e8; margin:20px 0 6px;">📉 Sector Sentiment</h3>
      <ul style="padding-left:20px; margin:0; color:#c0392b; font-size:14px;">
        <li>[Sentiment point 1]</li>
        <li>[Sentiment point 2]</li>
      </ul>

      <h3 style="font-size:24px; color:#f39c12; margin:20px 0 6px;">⭐ Investment Rating</h3>
      <p style="font-size:18px; color:#000;">[★★★☆☆ (3/5)]</p>

      <h3 style="font-size:24px; color:#8e44ad; margin:20px 0 6px;">🔮 Outlook</h3>
      <p style="font-size:18px; color:#333;">[Future outlook paragraph]</p>

      <h3 style="font-size:24px; color:#2c3e50; margin:20px 0 6px;">📰 News Articles</h3>
      <ul style="padding-left:20px; font-size:18px; color:#333;">
        <li><a href="[URL]" style="color:#1a0dab;">[Headline 1]</a> — [Short summary]</li>
        <li><a href="[URL]" style="color:#1a0dab;">[Headline 2]</a> — [Short summary]</li>
      </ul>
    </td>
  </tr>
</table>

Important:
- Create a separate table section for EACH stock in the input
- Replace all [bracketed] text with actual content
- Keep the exact HTML structure and styling
- Make sure to analyze each stock independently
- Return all tables in sequence, one after another
"""

    system_prompt = """You are a financial analyst generating a comprehensive stock market newsletter. For each stock in the input:
- Create a detailed, independent analysis
- Use the exact HTML structure provided
- Include all sections (TL;DR, Key Development, etc.)
- Maintain consistent styling
Return the complete analysis with all stocks in sequence."""

    try:
        print("Generating newsletter content for all stocks...")
        response = openai_client.chat.completions.create(
            model="gpt-4.1-mini-2025-04-14",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context + prompt}
            ],
            temperature=0.7,
        )
        content = response.choices[0].message.content
        # strip off ```html and ```
        # content = content.replace('```html', '').replace('```', '')
        print("Successfully generated content for all stocks")
        return content
    except Exception as e:
        print(f"Error generating newsletter: {str(e)}")
        return None

def create_html_newsletter(content):
    """Create an HTML newsletter with the provided content."""
    css = """
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                        'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            background-color: #F9FAFB;
            color: #1F2937;
            max-width: 720px;
            margin: 0 auto;  /* Center the content */
            padding: 20px;
        }
        /* Add a wrapper div to ensure email client respects max-width */
        .wrapper {
            max-width: 720px;
            margin: 0 auto;
            background-color: #F9FAFB;
        }
        h1 {
            color: #3B82F6;
            border-bottom: 2px solid #E5E7EB;
            padding-bottom: 10px;
            margin-top: 30px;
        }
        h2 {
            color: #3B82F6;
            margin-top: 25px;
        }
        a {
            color: #3B82F6;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .stock {
            background: white;
            border: 1px solid #E5E7EB;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        dl {
            display: grid;
            grid-template-columns: max-content 1fr;
            gap: 0.25rem 0.75rem;
            margin: 0 0 1rem 0;
        }
        dt {
            font-weight: 600;
            color: #6B7280;
        }
        dd {
            margin: 0;
        }
        .metadata {
            color: #6B7280;
            font-size: 0.9em;
        }
        .positive {
            color: #10B981;
            font-weight: 600;
        }
        .negative {
            color: #EF4444;
            font-weight: 600;
        }
        .neutral {
            color: inherit;
            font-weight: normal;
        }
        .divider {
            border-top: 1px solid #E5E7EB;
            margin: 20px 0;
        }
        .date {
            color: #6B7280;
            text-align: center;
            margin-bottom: 30px;
        }
        .articles {
            list-style: none;
            padding-left: 0;
            margin-top: 0.5rem;
        }
        .articles li {
            margin-bottom: 0.5rem;
        }
        .outlook {
            font-weight: 500;
            margin: 1rem 0;
        }
        li {
          font-size: 18px;
        }
    </style>
    """
    
    date_str = datetime.now().strftime('%B %d, %Y')
    html_newsletter = f"""
    <!DOCTYPE html>
    <html lang="en">
        <head>
            <title>StocksBrew ☕</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            {css}
        </head>
        <body>
            <div class="wrapper">
                <h1 style="text-align: center;">StocksBrew ☕</h1>
                <div class="date">{date_str}</div>
                <main>
                    {content if content else "No content generated"}
                </main>
                <footer class="divider">
                    <p class="metadata" style="text-align: center;">
                        Generated by StocksBrew ☕ | {date_str}
                    </p>
                </footer>
            </div>
        </body>
    </html>
    """
    return html_newsletter

# List of topics to analyze
topics = [
    "SWIGGY Stock India",
    "HDFC Bank Stock India",
    "Asian Paints Stock India",
    "Tata Motors Stock India",
]

# Fetch news for all topics
print("Fetching news for all topics...")
topics_and_articles = [
    (topic, get_news_for_topic(topic)) for topic in topics
]

# Generate newsletter content
print("\nGenerating newsletter content...")
newsletter_content = generate_newsletter_content(topics_and_articles)

# save newsletter_content to a file
with open('newsletter_content.txt', 'w') as f:
    f.write(newsletter_content)

# Create and save the HTML newsletter
print("\nCreating HTML newsletter...")
html_newsletter = create_html_newsletter(newsletter_content)
with open('newsletter.html', 'w', encoding='utf-8') as f:
    f.write(html_newsletter)

print("\n✅ Newsletter generated successfully!")
print("Open newsletter.html in your browser to view it.")

