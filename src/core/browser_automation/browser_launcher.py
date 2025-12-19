"""
Browser Launcher
Creates and manages browser sessions with undetected-chromedriver.
"""
import os
import random
from typing import Optional

try:
    import undetected_chromedriver as uc
except ImportError:
    uc = None


# Default browser settings
BROWSER_SETTINGS = {
    "headless": False,
    "window_width": (1200, 1400),
    "window_height": (800, 1000),
}

TIMEOUTS = {
    "page_load": 30,
}


class BrowserLauncher:
    """Launches browser with anti-detection measures."""
    
    def __init__(self, browser_path: str):
        self.browser_path = browser_path
        self.driver = None
    
    def launch(self, url: Optional[str] = None):
        """Launch browser and optionally navigate to URL."""
        if uc is None:
            raise ImportError("undetected-chromedriver is not installed. Run: pip install undetected-chromedriver")
        
        options = uc.ChromeOptions()
        options.binary_location = self.browser_path
        
        # Anti-detection
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-infobars")
        options.add_argument("--no-first-run")
        
        # Random window size
        w = random.randint(*BROWSER_SETTINGS["window_width"])
        h = random.randint(*BROWSER_SETTINGS["window_height"])
        options.add_argument(f"--window-size={w},{h}")
        
        self.driver = uc.Chrome(
            options=options,
            headless=BROWSER_SETTINGS["headless"],
            use_subprocess=True
        )
        
        self.driver.set_page_load_timeout(TIMEOUTS["page_load"])
        
        if url:
            self.driver.get(url)
        
        return self.driver
    
    def get_driver(self):
        return self.driver
    
    def close(self):
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            self.driver = None
