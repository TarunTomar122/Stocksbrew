from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from email.mime.text import MIMEText
import pickle
import os.path
import base64
from datetime import datetime

# If modifying these scopes, delete the file token.pickle.
SCOPES = ['https://www.googleapis.com/auth/gmail.send']


def get_gmail_service():
    """Gets Gmail API service instance."""
    creds = None
    # The file token.pickle stores the user's access and refresh tokens
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
            
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
            
        # Save the credentials for the next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)

    return build('gmail', 'v1', credentials=creds)


def create_message(sender, to, subject, message_text):
    """Create a message for an email."""
    message = MIMEText(message_text)
    message['to'] = to
    message['from'] = sender
    message['subject'] = subject
    return {'raw': base64.urlsafe_b64encode(message.as_bytes()).decode()}


def send_message(service, user_id, message):
    """Send an email message."""
    try:
        message = service.users().messages().send(
            userId=user_id, body=message).execute()
        print(f'✅ Message Id: {message["id"]} sent successfully!')
        return message
    except Exception as e:
        print(f'❌ An error occurred: {e}')
        return None


def main():
    # Path to the newsletter file
    date_str = datetime.now().strftime('%Y%m%d')
    newsletter_path = os.path.join('stock_summaries', f"newsletter_{date_str}.md")
    
    if not os.path.exists(newsletter_path):
        print(f"❌ Newsletter file not found at: {newsletter_path}")
        return
    
    print(f"Reading newsletter from: {newsletter_path}")
    
    # Read the newsletter content
    with open(newsletter_path, 'r', encoding='utf-8') as f:
        newsletter_content = f.read()
    
    try:
        # Get Gmail API service
        service = get_gmail_service()
        
        # Create and send email
        sender = "tomartarun2001@gmail.com"
        to = "ttomar@adobe.com"
        subject = f"Market Analysis Newsletter - {datetime.now().strftime('%Y-%m-%d')}"
        
        message = create_message(sender, to, subject, newsletter_content)
        send_message(service, "me", message)
        
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")


if __name__ == '__main__':
    main() 