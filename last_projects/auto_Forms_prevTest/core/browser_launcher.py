"""
Browser Launcher
Creates and manages browser sessions.
"""
import os
import random
from typing import Optional

import undetected_chromedriver as uc

from config.settings import BROWSER, TIMEOUTS


class BrowserLauncher:
    """Launches browser with anti-detection measures."""
    
    def __init__(self, browser_path: str):
        self.browser_path = browser_path
        self.driver = None
    
    def launch(self, url: Optional[str] = None) -> uc.Chrome:
        """Launch browser and optionally navigate to URL."""
        options = uc.ChromeOptions()
        options.binary_location = self.browser_path
        
        # Anti-detection
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-infobars")
        options.add_argument("--no-first-run")
        
        # Random window size
        w = random.randint(*BROWSER["window_width"])
        h = random.randint(*BROWSER["window_height"])
        options.add_argument(f"--window-size={w},{h}")
        
        self.driver = uc.Chrome(
            options=options,
            headless=BROWSER["headless"],
            use_subprocess=True
        )
        
        self.driver.set_page_load_timeout(TIMEOUTS["page_load"])
        
        if url:
            self.driver.get(url)
        
        return self.driver
    
    def get_driver(self) -> Optional[uc.Chrome]:
        return self.driver
    
    def close(self):
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None
