import requests
from bs4 import BeautifulSoup
import json
import os
import time
from typing import List, Dict, Optional

# Configuration
BASE_URL = "https://www.wowprogress.com"
START_TIER = 22  # Uldir
END_TIER = 35    # Current tier
DELAY_BETWEEN_REQUESTS = 1  # seconds to be respectful to the server

# Browser headers to match actual browser AJAX requests
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Accept': 'text/html, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9,fi;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://www.wowprogress.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Priority': 'u=1, i'
}

# State files
STATE_DIR = "scraper_state"
GUILDS_WITH_MYTHIC_FILE = os.path.join(STATE_DIR, "guilds_with_mythic.json")
TIER_PROGRESS_FILE = os.path.join(STATE_DIR, "tier_progress.json")
FINAL_GUILDS_FILE = "finnish_guilds.json"

# Create a session object to maintain cookies and connections
session = requests.Session()
session.headers.update(HEADERS)

def load_cookies_from_file(filename: str = "cookies.txt") -> bool:
    """Load cookies from Netscape format cookies.txt file"""
    try:
        if not os.path.exists(filename):
            print(f"Cookie file {filename} not found!")
            return False

        print(f"Loading cookies from {filename}...")
        cookies_loaded = 0

        with open(filename, 'r') as f:
            for line in f:
                # Skip comments and empty lines
                if line.startswith('#') or not line.strip():
                    continue

                try:
                    # Netscape format: domain, flag, path, secure, expiration, name, value
                    parts = line.strip().split('\t')
                    if len(parts) >= 7:
                        domain = parts[0]
                        path = parts[2]
                        secure = parts[3] == 'TRUE'
                        expires = int(parts[4]) if parts[4] != '0' else None
                        name = parts[5]
                        value = parts[6]

                        # Add cookie to session
                        session.cookies.set(
                            name=name,
                            value=value,
                            domain=domain,
                            path=path,
                            secure=secure,
                            expires=expires
                        )
                        cookies_loaded += 1
                        print(f"  Loaded cookie: {name}")
                except Exception as e:
                    print(f"  Error parsing cookie line: {e}")
                    continue

        print(f"Successfully loaded {cookies_loaded} cookies")
        return cookies_loaded > 0
    except Exception as e:
        print(f"Error loading cookies: {e}")
        return False

def initialize_session():
    """Initialize session with cookies from file"""
    try:
        print("Initializing session with browser cookies...")

        # Load cookies from file
        if not load_cookies_from_file("cookies.txt"):
            print("Warning: Could not load cookies from file")
            return False

        print(f"Session initialized with {len(session.cookies)} cookies")
        time.sleep(1)  # Brief pause before starting
        return True
    except Exception as e:
        print(f"Warning: Could not initialize session: {e}")
        return False

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

def fetch_page(url: str, referer: str = None, retry_count: int = 3) -> Optional[BeautifulSoup]:
    """Fetch and parse a page using POST request like the browser does"""
    for attempt in range(retry_count):
        try:
            print(f"Fetching: {url}" + (f" (attempt {attempt + 1}/{retry_count})" if attempt > 0 else ""))

            # Prepare headers with referer if provided
            headers = session.headers.copy()
            if referer:
                headers['Referer'] = referer

            # Use POST request with ajax=1 form data (like the browser does)
            form_data = {'ajax': '1'}
            response = session.post(url, data=form_data, headers=headers, timeout=15)
            response.raise_for_status()
            time.sleep(DELAY_BETWEEN_REQUESTS)
            return BeautifulSoup(response.content, 'lxml')
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                print(f"403 Forbidden - waiting longer before retry...")
                time.sleep(3 * (attempt + 1))  # Exponential backoff
            else:
                print(f"HTTP Error {e.response.status_code}: {e}")
                if attempt == retry_count - 1:
                    return None
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            if attempt < retry_count - 1:
                time.sleep(2 * (attempt + 1))
            else:
                return None
    return None

def has_mythic_progress(soup: BeautifulSoup) -> bool:
    """Check if the last guild on the page has mythic progress"""
    # Find all progress spans
    progress_spans = soup.find_all('span', class_='ratingProgress')
    if not progress_spans:
        return False

    # Check the last one
    last_progress = progress_spans[-1].find('b')
    if last_progress:
        progress_text = last_progress.get_text()
        return '(M)' in progress_text

    return False

def extract_guilds_from_page(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """Extract guild information from a page"""
    guilds = []

    # Find all table rows
    rows = soup.find_all('tr')

    for row in rows:
        try:
            # Find guild name (td -> a with class containing 'guild' -> nobr)
            guild_link = row.find('a', class_=lambda x: x and 'guild' in x)
            if not guild_link:
                continue

            guild_nobr = guild_link.find('nobr')
            if not guild_nobr:
                continue
            guild_name = guild_nobr.get_text().strip()

            # Find realm (td -> a with class 'realm')
            realm_link = row.find('a', class_='realm')
            if not realm_link:
                continue
            realm_text = realm_link.get_text().strip()

            # Parse region and realm
            # Format is like "US-Emerald Dream" or "EU-Kazzak"
            if '-' in realm_text:
                parts = realm_text.split('-', 1)
                region = parts[0].strip()
                realm = parts[1].strip()
            else:
                continue

            # Only interested in EU guilds
            if region.upper() == 'EU':
                # Get the guild URL for later language check
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
    prev_url = None

    while True:
        url = f"{BASE_URL}/pve/rating/next/{page}/rating.tier{tier}"
        # Use previous URL as referer (or the base tier page for first request)
        referer = prev_url if prev_url else f"{BASE_URL}/pve/rating/next/{page-1 if page > -1 else -1}/rating.tier{tier}"
        soup = fetch_page(url, referer=referer)

        if not soup:
            print(f"Failed to fetch page {page}, stopping tier {tier}")
            break

        # Extract guilds from this page
        guilds = extract_guilds_from_page(soup)
        print(f"Page {page}: Found {len(guilds)} EU guilds")
        all_guilds.extend(guilds)

        # Save current URL for next referer
        prev_url = url

        # Check if the last guild has mythic progress
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
    soup = fetch_page(full_url)

    if not soup:
        return None

    # Find the language div
    lang_div = soup.find('div', class_='language')
    if lang_div:
        lang_text = lang_div.get_text()
        # Format: "Primary Language: Finnish"
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
            # Save incrementally
            save_state(FINAL_GUILDS_FILE, finnish_guilds)
        else:
            print(f"  ✗ Language: {language}")

    return finnish_guilds

def main():
    """Main scraping workflow"""
    ensure_state_dir()

    print("WoW Progress Scraper - Finnish Guilds")
    print("=" * 50)

    # Initialize session with cookies
    initialize_session()

    # Step 1: Scrape all EU guilds with mythic progress from all tiers
    tier_progress = load_state(TIER_PROGRESS_FILE)
    all_guilds_data = load_state(GUILDS_WITH_MYTHIC_FILE)

    # Convert to set to avoid duplicates (based on name+realm)
    unique_guilds = {}

    # Process tiers in reverse order (35 to 22) for most recent first
    for tier in range(END_TIER, START_TIER - 1, -1):
        tier_key = str(tier)

        # Check if we've already completed this tier
        if tier_key in all_guilds_data and all_guilds_data[tier_key].get('completed', False):
            print(f"Tier {tier} already completed, loading {len(all_guilds_data[tier_key]['guilds'])} guilds")
            for guild in all_guilds_data[tier_key]['guilds']:
                key = f"{guild['name']}|{guild['realm']}"
                unique_guilds[key] = guild
            continue

        # Determine starting page
        start_page = -1
        if tier_key in tier_progress:
            start_page = tier_progress[tier_key].get('last_page', -1) + 1

        # Scrape this tier
        guilds = scrape_tier_guilds(tier, start_page)

        # Store tier data
        all_guilds_data[tier_key] = {
            'completed': True,
            'guilds': guilds
        }
        save_state(GUILDS_WITH_MYTHIC_FILE, all_guilds_data)

        # Add to unique guilds
        for guild in guilds:
            key = f"{guild['name']}|{guild['realm']}"
            unique_guilds[key] = guild

        print(f"Tier {tier} complete: {len(guilds)} EU guilds")

    # Convert back to list
    all_unique_guilds = list(unique_guilds.values())
    print(f"\n=== Phase 1 Complete ===")
    print(f"Total unique EU guilds with mythic progress: {len(all_unique_guilds)}")

    # Step 2: Filter for Finnish guilds
    finnish_guilds = filter_finnish_guilds(all_unique_guilds)

    # Save final results
    save_state(FINAL_GUILDS_FILE, finnish_guilds)

    print(f"\n=== Complete ===")
    print(f"Finnish guilds found: {len(finnish_guilds)}")
    print(f"Results saved to: {FINAL_GUILDS_FILE}")

    # Print sample
    if finnish_guilds:
        print("\nSample results:")
        for guild in finnish_guilds[:5]:
            print(f"  - {guild['name']} ({guild['realm']})")

if __name__ == "__main__":
    main()