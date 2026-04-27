from newsapi import NewsApiClient
import google.generativeai as genai
from datetime import datetime, timedelta
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

API_KEY = "ad3828da77694151a23be433536ad81f"
GEMINI_API_KEY = "AIzaSyAyycEffMJ-NaBNgp4hYKulRFcKvH9vNIo"
EMAIL_FROM = "tomartarun2001@gmail.com"  # Replace with your email
EMAIL_PASSWORD = "reft xbzl wqmq mnrw"
EMAIL_TO = "ttomar@adobe.com"  # Replace with recipient email

# Configure Gemini
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')

# Create directory for summaries
SUMMARY_DIR = "stock_summaries"
os.makedirs(SUMMARY_DIR, exist_ok=True)


def fetch_and_summarize_news(company_name):
    # Initialize NewsAPI client
    newsapi = NewsApiClient(api_key=API_KEY)

    # today at 12:00 am
    from_time = datetime.now().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    # yesterday at 12:00 am
    to_time = from_time - timedelta(days=1)

    # Get all articles
    articles = newsapi.get_everything(
        q=company_name,
        language='en',
        sort_by='publishedAt',
        from_param=from_time,
        to=to_time
    )

    if not articles['articles']:
        print(f"No articles found for '{company_name}'")
        return None

    print(f"Found {len(articles['articles'])} articles for '{company_name}'")

    # Prepare content for Gemini
    news_content = ""
    for article in articles['articles']:
        news_content += f"Title: {article['title']}\n"
        if article['description']:
            news_content += f"Description: {article['description']}\n"
        news_content += "\n"

    # Ask Gemini to summarize
    prompt = (
        f"Here are recent news articles about {company_name}:\n\n"
        f"{news_content}\n"
        "Provide a BRIEF analysis (max 150 words) focusing ONLY on the most "
        "recent news and market developments. Include:\n"
        "1. Key recent developments and their market impact\n"
        "2. Market Sentiment Score (0-100): Analyze overall market sentiment\n"
        "3. Investment Rating: Buy/Sell/Hold with a SHORT justification\n"
        "4. Confidence Score (1-10)\n"
        "5. Quick price prediction (one line each for short/long term)\n\n"
        "Keep it concise and focused on RECENT news only. No general "
        "company background or long-term history."
    )

    response = model.generate_content(prompt)
    return {
        'company': company_name,
        'summary': response.text
    }


def create_newsletter(summaries):
    # Combine all summaries and ask Gemini to create a newsletter
    combined_content = "\n\n".join(
        [f"## {s['company']}\n{s['summary']}" for s in summaries]
    )
    
    newsletter_prompt = (
        "Convert the following market analyses into a concise, engaging "
        "newsletter format. Focus on the most important insights and trends. "
        "Make it easy to read and highlight key investment opportunities:\n\n"
        f"{combined_content}"
    )
    
    response = model.generate_content(newsletter_prompt)
    return response.text


def send_email(subject, body):
    msg = MIMEMultipart()
    msg['From'] = EMAIL_FROM
    msg['To'] = EMAIL_TO
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'plain'))

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(EMAIL_FROM, EMAIL_PASSWORD)
            server.sendmail(EMAIL_FROM, EMAIL_TO, msg.as_string())
        print("✅ Email sent successfully to", EMAIL_TO)
    except Exception as e:
        print("❌ Failed to send email:", str(e))


def main():
    # List of topics to analyze
    topics = [
        "indian stock market overview",
        "indian defence stocks",
        "indian banking stocks",
        "indian pharma stocks",
        "hdfc bank stock",
        "adobe stock",
        "nvidia stock",
    ]
    
    # Get current date for the filename
    current_date = datetime.now().strftime("%Y%m%d")
    
    # Collect all summaries
    summaries = []
    for topic in topics:
        print(f"\nAnalyzing {topic}...")
        summary = fetch_and_summarize_news(topic)
        if summary:
            summaries.append(summary)
    
    if not summaries:
        print("No summaries generated!")
        return
    
    # Save detailed summaries
    detailed_filename = f"market_analysis_{current_date}.md"
    detailed_filepath = os.path.join(SUMMARY_DIR, detailed_filename)
    
    with open(detailed_filepath, "w", encoding="utf-8") as f:
        f.write("# Market Analysis Report\n")
        timestamp_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        f.write(f"*Generated on: {timestamp_str}*\n\n")
        
        for summary in summaries:
            f.write(f"# {summary['company']}\n\n")
            f.write(f"{summary['summary']}\n\n")
            f.write("---\n\n")
    
    print(f"\nDetailed analysis saved to: {detailed_filepath}")
    
    # Create and save newsletter version
    print("\nGenerating newsletter...")
    newsletter = create_newsletter(summaries)
    
    newsletter_filename = f"newsletter_{current_date}.md"
    newsletter_filepath = os.path.join(SUMMARY_DIR, newsletter_filename)
    
    with open(newsletter_filepath, "w", encoding="utf-8") as f:
        f.write("# Market Newsletter\n")
        f.write(f"*Generated on: {timestamp_str}*\n\n")
        f.write(newsletter)
    
    print(f"Newsletter saved to: {newsletter_filepath}")
    
    # Send email
    email_subject = f"Market Analysis Newsletter - {current_date}"
    send_email(email_subject, newsletter)


if __name__ == "__main__":
    main()
