"""
WoW Progress Scraper using Selenium (real browser)
This bypasses Cloudflare protection by using an actual browser instance
"""

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import json
import os
import time
from typing import List, Dict, Optional

# Configuration
BASE_URL = "https://www.wowprogress.com"
START_TIER = 22  # Uldir
END_TIER = 35    # Current tier
DELAY_BETWEEN_REQUESTS = 2  # seconds to be respectful to the server

# State files
STATE_DIR = "scraper_state"
GUILDS_WITH_MYTHIC_FILE = os.path.join(STATE_DIR, "guilds_with_mythic.json")
TIER_PROGRESS_FILE = os.path.join(STATE_DIR, "tier_progress.json")
FINAL_GUILDS_FILE = "finnish_guilds.json"

# Global driver instance
driver = None

def setup_driver():
    """Setup Chrome driver with options"""
    global driver

    chrome_options = Options()
    # chrome_options.add_argument('--headless')  # Uncomment to run headless
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    # Create driver
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)

    # Remove webdriver flag
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    print("Browser initialized")
    return driver

def ensure_state_dir():
    """Create state directory if it doesn't exist"""
    if not os.path.exists(STATE_DIR):
        os.makedirs(STATE_DIR)

def load_state(filename: str) -> Dict:
    """Load state from a JSON file"""
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_state(filename: str, data: Dict):
    """Save state to a JSON file"""
    ensure_state_dir()
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def fetch_page(url: str, wait_for_element: str = None) -> Optional[BeautifulSoup]:
    """Fetch and parse a page using Selenium"""
    try:
        print(f"Fetching: {url}")
        driver.get(url)

        # Wait for page to load
        if wait_for_element:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, wait_for_element))
            )
        else:
            time.sleep(2)  # Basic wait

        # Get page source and parse
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'lxml')

        time.sleep(DELAY_BETWEEN_REQUESTS)
        return soup
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def has_mythic_progress(soup: BeautifulSoup) -> bool:
    """Check if the last guild on the page has mythic progress"""
    progress_spans = soup.find_all('span', class_='ratingProgress')
    if not progress_spans:
        return False

    last_progress = progress_spans[-1].find('b')
    if last_progress:
        progress_text = last_progress.get_text()
        return '(M)' in progress_text

    return False

def extract_guilds_from_page(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """Extract guild information from a page"""
    guilds = []
    rows = soup.find_all('tr')

    for row in rows:
        try:
            guild_link = row.find('a', class_=lambda x: x and 'guild' in x)
            if not guild_link:
                continue

            guild_nobr = guild_link.find('nobr')
            if not guild_nobr:
                continue
            guild_name = guild_nobr.get_text().strip()

            realm_link = row.find('a', class_='realm')
            if not realm_link:
                continue
            realm_text = realm_link.get_text().strip()

            if '-' in realm_text:
                parts = realm_text.split('-', 1)
                region = parts[0].strip()
                realm = parts[1].strip()
            else:
                continue

            if region.upper() == 'EU':
                guild_url = guild_link.get('href', '')

                guilds.append({
                    'name': guild_name,
                    'realm': realm,
                    'region': region,
                    'url': guild_url
                })
        except Exception as e:
            print(f"Error parsing row: {e}")
            continue

    return guilds

def scrape_tier_guilds(tier: int, start_page: int = -1) -> List[Dict[str, str]]:
    """Scrape all guilds with mythic progress for a specific tier"""
    print(f"\n=== Scraping Tier {tier} ===")

    all_guilds = []
    page = start_page

    while True:
        url = f"{BASE_URL}/pve/rating/next/{page}/rating.tier{tier}"
        soup = fetch_page(url, wait_for_element='a.guild')

        if not soup:
            print(f"Failed to fetch page {page}, stopping tier {tier}")
            break

        guilds = extract_guilds_from_page(soup)
        print(f"Page {page}: Found {len(guilds)} EU guilds")
        all_guilds.extend(guilds)

        if not has_mythic_progress(soup):
            print(f"No more mythic progress on page {page}, stopping tier {tier}")
            break

        # Save progress after each page
        tier_progress = load_state(TIER_PROGRESS_FILE)
        tier_progress[str(tier)] = {
            'last_page': page,
            'guilds_count': len(all_guilds)
        }
        save_state(TIER_PROGRESS_FILE, tier_progress)

        page += 1

    return all_guilds

def get_guild_language(guild_url: str) -> Optional[str]:
    """Get the primary language of a guild"""
    full_url = f"{BASE_URL}{guild_url}"
    soup = fetch_page(full_url, wait_for_element='div.language')

    if not soup:
        return None

    lang_div = soup.find('div', class_='language')
    if lang_div:
        lang_text = lang_div.get_text()
        if ':' in lang_text:
            language = lang_text.split(':', 1)[1].strip()
            return language

    return None

def filter_finnish_guilds(guilds: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Filter guilds to only include those with Finnish as primary language"""
    print(f"\n=== Filtering for Finnish guilds ===")
    print(f"Total guilds to check: {len(guilds)}")

    finnish_guilds = []

    for i, guild in enumerate(guilds, 1):
        print(f"Checking {i}/{len(guilds)}: {guild['name']} - {guild['realm']}")

        language = get_guild_language(guild['url'])

        if language and language.lower() == 'finnish':
            print(f"  ✓ Finnish guild found!")
            finnish_guilds.append({
                'name': guild['name'],
                'realm': guild['realm'],
                'region': guild['region']
            })
            save_state(FINAL_GUILDS_FILE, finnish_guilds)
        else:
            print(f"  ✗ Language: {language}")

    return finnish_guilds

def main():
    """Main scraping workflow"""
    global driver

    try:
        ensure_state_dir()

        print("WoW Progress Scraper - Finnish Guilds (Selenium)")
        print("=" * 50)

        # Setup browser
        setup_driver()

        # Step 1: Scrape all EU guilds with mythic progress from all tiers
        tier_progress = load_state(TIER_PROGRESS_FILE)
        all_guilds_data = load_state(GUILDS_WITH_MYTHIC_FILE)

        unique_guilds = {}

        # Process tiers in reverse order (35 to 22)
        for tier in range(END_TIER, START_TIER - 1, -1):
            tier_key = str(tier)

            if tier_key in all_guilds_data and all_guilds_data[tier_key].get('completed', False):
                print(f"Tier {tier} already completed, loading {len(all_guilds_data[tier_key]['guilds'])} guilds")
                for guild in all_guilds_data[tier_key]['guilds']:
                    key = f"{guild['name']}|{guild['realm']}"
                    unique_guilds[key] = guild
                continue

            start_page = -1
            if tier_key in tier_progress:
                start_page = tier_progress[tier_key].get('last_page', -1) + 1

            guilds = scrape_tier_guilds(tier, start_page)

            all_guilds_data[tier_key] = {
                'completed': True,
                'guilds': guilds
            }
            save_state(GUILDS_WITH_MYTHIC_FILE, all_guilds_data)

            for guild in guilds:
                key = f"{guild['name']}|{guild['realm']}"
                unique_guilds[key] = guild

            print(f"Tier {tier} complete: {len(guilds)} EU guilds")

        all_unique_guilds = list(unique_guilds.values())
        print(f"\n=== Phase 1 Complete ===")
        print(f"Total unique EU guilds with mythic progress: {len(all_unique_guilds)}")

        # Step 2: Filter for Finnish guilds
        finnish_guilds = filter_finnish_guilds(all_unique_guilds)

        save_state(FINAL_GUILDS_FILE, finnish_guilds)

        print(f"\n=== Complete ===")
        print(f"Finnish guilds found: {len(finnish_guilds)}")
        print(f"Results saved to: {FINAL_GUILDS_FILE}")

        if finnish_guilds:
            print("\nSample results:")
            for guild in finnish_guilds[:5]:
                print(f"  - {guild['name']} ({guild['realm']})")

    finally:
        # Clean up
        if driver:
            print("\nClosing browser...")
            driver.quit()

if __name__ == "__main__":
    main()
