from test_mail import wrap_newsletter_content
import os
import webbrowser
from datetime import datetime


def create_gmail_preview(content):
    """Create a Gmail-like preview of the newsletter."""
    gmail_wrapper = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gmail Preview - StocksBrew</title>
        <style>
            /* Gmail-like styles */
            body {{
                margin: 0;
                padding: 0;
                background: #f6f8fc;
                font-family: Roboto, Arial, sans-serif;
            }}
            .gmail-header {{
                background: white;
                padding: 8px 16px;
                border-bottom: 1px solid #e5e5e5;
                display: flex;
                align-items: center;
            }}
            .gmail-logo {{
                width: 109px;
                height: 40px;
                margin-right: 20px;
            }}
            .email-container {{
                max-width: 1000px;
                margin: 24px auto;
                background: white;
                border-radius: 16px;
                box-shadow: 0 1px 2px 0 rgba(60,64,67,.3),
                           0 1px 3px 1px rgba(60,64,67,.15);
            }}
            .email-header {{
                padding: 16px 24px;
                border-bottom: 1px solid #e5e5e5;
            }}
            .subject {{
                font-size: 16px;
                font-weight: bold;
                margin: 0 0 8px 0;
            }}
            .metadata {{
                color: #5f6368;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
            }}
            .email-body {{
                padding: 24px;
            }}
            /* Preview controls */
            .preview-controls {{
                position: fixed;
                top: 16px;
                right: 16px;
                background: white;
                padding: 8px 16px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }}
            .preview-controls button {{
                background: #1a73e8;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 8px;
            }}
            .preview-controls button:hover {{
                background: #1557b0;
            }}
        </style>
    </head>
    <body>
        <!-- Gmail-like header -->
        <div class="gmail-header">
            <img src="https://ssl.gstatic.com/ui/v1/icons/mail/rfr/logo_gmail_lockup_default_1x_r5.png" 
                 alt="Gmail" class="gmail-logo">
        </div>
        
        <!-- Preview controls -->
        <div class="preview-controls">
            <span>Preview Mode</span>
            <button onclick="window.location.reload()">Refresh</button>
        </div>

        <!-- Email container -->
        <div class="email-container">
            <div class="email-header">
                <div class="subject">Stock Market Analysis</div>
                <div class="metadata">
                    <div>
                        <strong>From:</strong> Stock Market Analysis 
                        &lt;tomartarun2001@gmail.com&gt;
                    </div>
                    <div>{datetime.now().strftime('%b %d, %I:%M %p')}</div>
                </div>
            </div>
            <div class="email-body">
                {content}
            </div>
        </div>
    </body>
    </html>
    """
    return gmail_wrapper


def main():
    # Read the newsletter content
    if not os.path.exists('newsletter.html'):
        print("❌ Newsletter file not found! Please generate it first.")
        return

    with open('newsletter.html', 'r', encoding='utf-8') as f:
        newsletter_content = f.read()

    # Extract main content
    start = newsletter_content.find('<main>')
    end = newsletter_content.find('</main>')
    if start != -1 and end != -1:
        content = newsletter_content[start + len('<main>'):end].strip()
    else:
        content = newsletter_content

    # Wrap content in our email template
    email_content = wrap_newsletter_content(content)
    
    # Create Gmail preview
    preview = create_gmail_preview(email_content)
    
    # Save and open preview
    preview_file = 'gmail_preview.html'
    with open(preview_file, 'w', encoding='utf-8') as f:
        f.write(preview)
    
    print(f"\n✨ Opening Gmail preview...")
    webbrowser.open(f'file://{os.path.abspath(preview_file)}')


if __name__ == "__main__":
    main() 