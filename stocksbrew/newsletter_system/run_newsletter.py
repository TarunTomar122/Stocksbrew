#!/usr/bin/env python3
"""
Master Script: Run Complete Newsletter Pipeline
Executes all newsletter generation steps in sequence
"""

import subprocess
import sys
import os
from datetime import datetime

# Get the scripts directory
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), 'scripts')

def run_script(script_name, description):
    """Run a script and handle errors"""
    script_path = os.path.join(SCRIPTS_DIR, script_name)
    
    print(f"\n{'='*60}")
    print(f"🚀 {description}")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run([sys.executable, script_path], 
                              capture_output=True, text=True, check=True)
        print(result.stdout)
        if result.stderr:
            print("Warnings:", result.stderr)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running {script_name}:")
        print(f"Exit code: {e.returncode}")
        print(f"Error output: {e.stderr}")
        if e.stdout:
            print(f"Standard output: {e.stdout}")
        return False
    except FileNotFoundError:
        print(f"❌ Script not found: {script_path}")
        return False

def main():
    """Run the complete newsletter pipeline"""
    start_time = datetime.now()
    
    print("📧 StocksBrew Newsletter Generation Pipeline")
    print(f"Started at: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Step 1: Fetch news
    if not run_script("1_fetch_news.py", "Step 1: Fetching News Articles"):
        print("❌ Pipeline failed at Step 1")
        return
    
    # Step 2: Generate summaries
    if not run_script("2_generate_summaries_gemini.py", "Step 2: Generating AI Summaries"):
        print("❌ Pipeline failed at Step 2")
        return
    
    # Step 2.5: Refine summaries
    if not run_script("2.5_refine_summaries.py", "Step 2.5: Refining Summaries"):
        print("❌ Pipeline failed at Step 2.5")
        return
    
    # Step 3: Generate newsletter refined
    if not run_script("3_generate_newsletter_refined.py", "Step 3: Creating HTML Newsletter"):
        print("❌ Pipeline failed at Step 3")
        return
    
    # Step 4: Send email (optional)
    print(f"\n{'='*60}")
    print("📧 Step 4: Send Email Newsletter")
    print(f"{'='*60}")
    
    send_email = input("Do you want to send the newsletter via email using Brevo API? (y/N): ").lower().strip()
    
    if send_email in ['y', 'yes']:
        if not run_script("4_send_email.py", "Step 4: Sending Email Newsletter via Brevo API"):
            print("❌ Email sending failed, but newsletter was generated successfully")
    else:
        print("📄 Email sending skipped. Newsletter saved to output directory.")
    
    # Summary
    end_time = datetime.now()
    duration = end_time - start_time
    
    print(f"\n{'='*60}")
    print("🎉 Newsletter Pipeline Complete!")
    print(f"{'='*60}")
    print(f"⏱️  Total time: {duration.total_seconds():.1f} seconds")
    print(f"📄 Newsletter saved in: newsletter_system/output/")
    print(f"🔗 Open latest_newsletter.html in your browser to preview")

if __name__ == "__main__":
    main() 