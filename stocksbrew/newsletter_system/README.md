# 📈 StocksBrew Newsletter System

A complete automated newsletter system that fetches stock news, generates AI-powered summaries, and creates beautiful HTML newsletters.

## 🚀 Features

- **Automated News Fetching**: Retrieves latest news articles for specified stocks
- **AI-Powered Analysis**: Uses OpenAI GPT to generate structured summaries with:
  - TL;DR summaries
  - Key developments
  - Market impact analysis
  - Sentiment analysis
  - Investment ratings
  - Key headlines
- **Beautiful HTML Newsletter**: Responsive design that works on all devices
- **Email Delivery**: Automated email sending with Brevo API
- **Modular Architecture**: Separate scripts for each step of the process

## 📁 Project Structure

```
newsletter_system/
├── data/                          # JSON data files
│   ├── stocks_input.json         # Input: stocks to analyze
│   ├── news_content.json         # Step 1 output: fetched news
│   └── summaries.json            # Step 2 output: AI summaries
├── scripts/                       # Processing scripts
│   ├── 1_fetch_news.py           # Fetch news articles
│   ├── 2_generate_summaries.py   # Generate AI summaries
│   ├── 3_generate_newsletter.py  # Create HTML newsletter
│   └── 4_send_email.py           # Send via email (Brevo API)
├── templates/                     # HTML templates
│   └── newsletter_template.html  # Newsletter template
├── output/                        # Generated newsletters
│   ├── newsletter_YYYYMMDD_HHMMSS.html
│   └── latest_newsletter.html
├── run_newsletter.py             # Master script
├── requirements.txt              # Dependencies
└── README.md                     # This file
```

## 🛠️ Setup

### 1. Install Dependencies

```bash
cd newsletter_system
pip install -r requirements.txt
```

### 2. Configure API Keys

Update the API keys in the scripts:

**In `scripts/1_fetch_news.py`:**
```python
NEWS_API_KEY = "your_newsapi_key_here"
```

**In `scripts/2_generate_summaries.py`:**
```python
OPENAI_API_KEY = "your_openai_api_key_here"
```

**In `scripts/4_send_email.py`:**
```python
API_KEY = "your_brevo_api_key_here"
EMAIL_FROM = {
    "email": "your_email@example.com",
    "name": "StocksBrew Newsletter"
}
EMAIL_TO = [{"email": "recipient@example.com"}]
```

### 3. Configure Stocks

Edit `data/stocks_input.json` to specify which stocks to analyze:

```json
{
  "stocks": [
    {
      "symbol": "RELIANCE",
      "company_name": "Reliance Industries",
      "exchange": "NSE",
      "search_terms": ["Reliance Industries", "RIL stock", "Reliance share price"]
    }
  ],
  "config": {
    "news_days_back": 2,
    "max_articles_per_stock": 5,
    "language": "en"
  }
}
```

## 🚀 Usage

### Option 1: Run Complete Pipeline

```bash
python run_newsletter.py
```

This will:
1. Fetch news articles
2. Generate AI summaries
3. Create HTML newsletter
4. Optionally send via email

### Option 2: Run Individual Steps

```bash
# Step 1: Fetch news
python scripts/1_fetch_news.py

# Step 2: Generate summaries
python scripts/2_generate_summaries.py

# Step 3: Create newsletter
python scripts/3_generate_newsletter.py

# Step 4: Send email (optional)
python scripts/4_send_email.py
```

## 📧 Email Setup (Brevo)

For Brevo (formerly Sendinblue), you need to:

1. Create a Brevo account at https://www.brevo.com/
2. Generate an API key:
   - Go to your Brevo account
   - Navigate to SMTP & API → API Keys
   - Create or use an existing API key
3. Use the API key in the email configuration in `scripts/4_send_email.py`

The email system is designed to send the generated HTML newsletter directly without modification, preserving the styling and layout of the newsletter.

## 🎨 Newsletter Features

The generated newsletter includes:

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Professional Styling**: Clean, modern design with gradients and shadows
- **Dark Mode Support**: Automatically adapts to user preferences
- **Email Client Compatibility**: Tested with major email clients
- **Structured Content**: Organized sections for easy reading

## 📊 Data Flow

```
stocks_input.json → 1_fetch_news.py → news_content.json
                                           ↓
summaries.json ← 2_generate_summaries.py ←
      ↓
3_generate_newsletter.py → newsletter.html
                               ↓
                        4_send_email.py → 📧
```

## 🔧 Customization

### Adding More Stocks

Edit `data/stocks_input.json`:

```json
{
  "stocks": [
    {
      "symbol": "AAPL",
      "company_name": "Apple Inc.",
      "exchange": "NASDAQ",
      "search_terms": ["Apple stock", "AAPL", "iPhone sales", "Tim Cook"]
    },
    {
      "symbol": "TSLA",
      "company_name": "Tesla Inc.",
      "exchange": "NASDAQ",
      "search_terms": ["Tesla stock", "TSLA", "Elon Musk", "electric vehicles"]
    }
  ]
}
```

### Customizing Newsletter Design

Edit `templates/newsletter_template.html` to modify:
- Colors and styling
- Layout and structure
- Fonts and typography
- Responsive breakpoints

### Modifying AI Analysis

Edit the prompts in `scripts/2_generate_summaries.py` to change:
- Analysis structure
- Content focus
- Output format
- Analysis depth

## 🐛 Troubleshooting

### Common Issues

1. **NewsAPI Rate Limits**: Free tier allows 1000 requests/month
2. **OpenAI Token Limits**: Monitor usage to avoid exceeding limits
3. **Brevo Email Limits**: Check your account's daily sending limits
4. **File Permissions**: Ensure scripts have execute permissions

### Error Messages

- `❌ Input file not found`: Run previous step first
- `❌ API authentication failed`: Check API keys
- `❌ API error occurred`: Check your Brevo API key or account status

## 📝 License

This project is for educational and personal use. Please respect API terms of service and rate limits.

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📞 Support

For questions or issues, please check the troubleshooting section or create an issue in the repository. 