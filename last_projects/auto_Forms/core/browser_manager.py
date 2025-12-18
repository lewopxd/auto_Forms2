"""
Browser Manager with anti-detection capabilities.
Uses undetected-chromedriver to bypass bot detection.
"""
import random
import time
from typing import Optional

import undetected_chromedriver as uc
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import BROWSER, WAIT_TIMES
from utils.logger import Logger


class BrowserManager:
    """
    Manages browser initialization with maximum anti-detection capabilities.
    Uses undetected-chromedriver for stealth browsing.
    """
    
    def __init__(self, logger: Optional[Logger] = None):
        """
        Initialize the browser manager.
        
        Args:
            logger: Optional logger instance
        """
        self.logger = logger or Logger("BrowserManager")
        self.driver = None
        self._is_initialized = False
    
    def _get_random_window_size(self) -> tuple:
        """Generate random but realistic window dimensions."""
        width = random.randint(*BROWSER["window_width_range"])
        height = random.randint(*BROWSER["window_height_range"])
        return width, height
    
    def _find_brave_path(self) -> str:
        """Find Brave browser executable path."""
        possible_paths = [
            # Windows default locations
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            # User profile location
            os.path.expanduser(r"~\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                self.logger.debug(f"Found Brave at: {path}")
                return path
        
        return None
    
    def _find_chrome_path(self) -> str:
        """Find Chrome browser executable path."""
        possible_paths = [
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe"),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                self.logger.debug(f"Found Chrome at: {path}")
                return path
        
        return None
    
    def _get_browser_path(self) -> str:
        """Find available Chromium-based browser (Brave or Chrome)."""
        # Try Brave first (user preference)
        brave_path = self._find_brave_path()
        if brave_path:
            self.logger.info("Using Brave browser")
            return brave_path
        
        # Fallback to Chrome
        chrome_path = self._find_chrome_path()
        if chrome_path:
            self.logger.info("Using Chrome browser")
            return chrome_path
        
        return None
    
    def _get_chrome_options(self) -> uc.ChromeOptions:
        """Configure Chrome options for maximum stealth."""
        options = uc.ChromeOptions()
        
        # Set browser binary path (Brave or Chrome)
        browser_path = self._get_browser_path()
        if browser_path:
            options.binary_location = browser_path
        
        # Anti-detection arguments
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-infobars")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--no-first-run")
        options.add_argument("--no-service-autorun")
        options.add_argument("--password-store=basic")
        
        # Disable automation extension indicators
        options.add_argument("--disable-extensions")
        
        # Random window size for fingerprint variation
        width, height = self._get_random_window_size()
        options.add_argument(f"--window-size={width},{height}")
        self.logger.debug(f"Window size set to: {width}x{height}")
        
        # Disable GPU if configured (usually keep enabled for realism)
        if BROWSER.get("disable_gpu", False):
            options.add_argument("--disable-gpu")
        
        # User data directory (for persistent sessions)
        if BROWSER.get("user_data_dir"):
            options.add_argument(f"--user-data-dir={BROWSER['user_data_dir']}")
        
        return options
    
    def initialize(self) -> bool:
        """
        Initialize the browser with anti-detection measures.
        
        Returns:
            True if initialization successful, False otherwise
        """
        try:
            self.logger.info("Initializing stealth browser...")
            
            options = self._get_chrome_options()
            
            # Create undetected Chrome driver
            # version_main can be set to specific Chrome version if needed
            self.driver = uc.Chrome(
                options=options,
                headless=BROWSER.get("headless", False),
                use_subprocess=True,  # More stable on Windows
            )
            
            # Set page load timeout
            self.driver.set_page_load_timeout(WAIT_TIMES["page_load_timeout"])
            
            # Implicit wait for elements
            self.driver.implicitly_wait(5)
            
            self._is_initialized = True
            self.logger.info("Browser initialized successfully!")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize browser: {str(e)}")
            return False
    
    def navigate_to(self, url: str) -> bool:
        """
        Navigate to a URL with human-like delay.
        
        Args:
            url: The URL to navigate to
            
        Returns:
            True if navigation successful, False otherwise
        """
        if not self._is_initialized:
            self.logger.error("Browser not initialized!")
            return False
        
        try:
            self.logger.info(f"Navigating to: {url}")
            
            # Small random delay before navigation (human-like)
            time.sleep(random.uniform(0.5, 1.5))
            
            self.driver.get(url)
            
            # Wait for page to stabilize
            time.sleep(random.uniform(2, 4))
            
            self.logger.info("Navigation complete!")
            return True
            
        except TimeoutException:
            self.logger.error("Page load timeout!")
            return False
        except Exception as e:
            self.logger.error(f"Navigation failed: {str(e)}")
            return False
    
    def wait_for_manual_login(self, indicator_url_part: str = "forms.office.com") -> bool:
        """
        Wait for user to manually log in.
        Detects login by checking if we're still on the form page.
        
        Args:
            indicator_url_part: Part of URL that indicates we're on the form
            
        Returns:
            True if login completed/form accessible, False if timeout
        """
        self.logger.info("=" * 50)
        self.logger.info("MANUAL LOGIN REQUIRED")
        self.logger.info("Please log in to your Microsoft account in the browser.")
        self.logger.info(f"Waiting up to {WAIT_TIMES['login_wait_timeout']} seconds...")
        self.logger.info("=" * 50)
        
        timeout = WAIT_TIMES["login_wait_timeout"]
        start_time = time.time()
        check_interval = 3  # Check every 3 seconds
        
        while (time.time() - start_time) < timeout:
            try:
                current_url = self.driver.current_url
                
                # Check if we're on the form page and it seems loaded
                if indicator_url_part in current_url:
                    # Try to find any form element to confirm it's accessible
                    try:
                        form_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                            "input, textarea, [role='textbox'], [role='radio'], [role='checkbox']")
                        
                        if len(form_elements) > 0:
                            self.logger.info("Form detected and accessible!")
                            return True
                    except:
                        pass
                
                time.sleep(check_interval)
                elapsed = int(time.time() - start_time)
                self.logger.debug(f"Waiting for login... ({elapsed}s elapsed)")
                
            except Exception as e:
                self.logger.debug(f"Check error (continuing): {str(e)}")
                time.sleep(check_interval)
        
        self.logger.warning("Login wait timeout reached")
        return False
    
    def wait_for_element(self, selector: str, timeout: int = None) -> bool:
        """
        Wait for a specific element to be present.
        
        Args:
            selector: CSS selector or XPath
            timeout: Custom timeout in seconds
            
        Returns:
            True if element found, False otherwise
        """
        timeout = timeout or WAIT_TIMES["element_wait_timeout"]
        
        try:
            # Try CSS selector first
            try:
                WebDriverWait(self.driver, timeout).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                return True
            except:
                # Try XPath
                WebDriverWait(self.driver, timeout).until(
                    EC.presence_of_element_located((By.XPATH, selector))
                )
                return True
                
        except TimeoutException:
            return False
    
    def get_driver(self):
        """Get the Selenium WebDriver instance."""
        return self.driver
    
    def is_initialized(self) -> bool:
        """Check if browser is initialized."""
        return self._is_initialized
    
    def close(self):
        """Close the browser."""
        if self.driver:
            try:
                self.driver.quit()
                self.logger.info("Browser closed.")
            except:
                pass
            finally:
                self.driver = None
                self._is_initialized = False
    
    def __enter__(self):
        """Context manager entry."""
        self.initialize()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
