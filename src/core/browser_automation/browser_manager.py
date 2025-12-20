"""
Browser Manager - Anti-detection Chromium Automation.

Manages browser lifecycle using undetected-chromedriver for stealth.
Configuration is centralized in browser_settings.py.

NOTE: Selenium imports are OPTIONAL. If not available, methods return errors gracefully.
"""
import os
import random
import time
import threading
from typing import Optional, Callable

# --- Local imports ---
from .browser_settings import BrowserConfig, build_chrome_options

# --- Optional: undetected-chromedriver ---
try:
    import undetected_chromedriver as uc
except ImportError:
    uc = None

# --- Optional: Selenium WebDriver ---
SELENIUM_WEBDRIVER_AVAILABLE = False
try:
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.by import By
    from selenium.common.exceptions import TimeoutException, WebDriverException
    SELENIUM_WEBDRIVER_AVAILABLE = True
except ImportError as e:
    print(f"[BrowserManager] WARNING: selenium.webdriver not available: {e}")
    WebDriverWait = None
    EC = None
    By = None
    TimeoutException = Exception
    WebDriverException = Exception


class BrowserManager:
    """
    Manages browser initialization with maximum anti-detection capabilities.
    Uses undetected-chromedriver for stealth browsing.
    """
    
    def __init__(
        self,
        browser_path: str = None,
        config: BrowserConfig = None,
        # Legacy params (deprecated, use config instead)
        incognito: bool = False,
        page_load_timeout: int = 120
    ):
        """
        Initialize the browser manager.
        
        Args:
            browser_path: Path to browser executable
            config: BrowserConfig instance with all settings (preferred)
            incognito: DEPRECATED - Use config.incognito instead
            page_load_timeout: DEPRECATED - Use config.page_load_timeout instead
        """
        self.browser_path = browser_path
        
        # Use provided config or create default, applying legacy params
        if config is not None:
            self.config = config
        else:
            # Backwards compatibility: create config from legacy params
            self.config = BrowserConfig(
                incognito=incognito,
                page_load_timeout=page_load_timeout
            )
        
        # Driver state
        self.driver = None
        self._is_initialized = False
        self._on_close_callback: Optional[Callable] = None
        self._monitor_thread: Optional[threading.Thread] = None
        self._should_monitor = False
    
    def _find_brave_path(self) -> str:
        """Find Brave browser executable path."""
        possible_paths = [
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expanduser(r"~\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
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
                return path
        return None
    
    def _find_edge_path(self) -> str:
        """Find Edge browser executable path."""
        possible_paths = [
            os.path.expandvars(r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                return path
        return None
    
    def _get_browser_binary(self) -> str:
        """Find available Chromium-based browser."""
        # If a specific path was provided, use it
        if self.browser_path and os.path.exists(self.browser_path):
            return self.browser_path
        
        # Try to auto-detect
        for finder in [self._find_brave_path, self._find_chrome_path, self._find_edge_path]:
            path = finder()
            if path:
                return path
        
        return None
    
    def _get_chrome_options(self) -> 'uc.ChromeOptions':
        """
        Build Chrome options using centralized configuration.
        
        Delegates to build_chrome_options() from browser_settings module.
        """
        browser_path = self._get_browser_binary()
        return build_chrome_options(self.config, browser_path)
    
    def initialize(self) -> bool:
        """
        Initialize the browser with anti-detection measures.
        
        Uses configuration from self.config (BrowserConfig instance).
        
        Returns:
            True if initialization successful, False otherwise
        """
        # Check dependencies
        if not SELENIUM_WEBDRIVER_AVAILABLE:
            print("[BrowserManager] Error: selenium.webdriver not available")
            return False
        
        if uc is None:
            print("[BrowserManager] Error: undetected-chromedriver not installed")
            return False
        
        try:
            print(f"[BrowserManager] Initializing browser (profile: {self.config.efficiency_profile})...")
            
            options = self._get_chrome_options()
            
            # Launch browser with undetected-chromedriver
            self.driver = uc.Chrome(
                options=options,
                headless=self.config.headless,
                use_subprocess=True,
            )
            
            # Apply timeouts from config
            self.driver.set_page_load_timeout(self.config.page_load_timeout)
            self.driver.implicitly_wait(self.config.implicit_wait)
            
            print(f"[BrowserManager] Timeouts: page_load={self.config.page_load_timeout}s, implicit={self.config.implicit_wait}s")
            
            self._is_initialized = True
            print("[BrowserManager] Browser initialized successfully!")
            
            return True
            
        except Exception as e:
            print(f"[BrowserManager] Failed to initialize browser: {str(e)}")
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
            print("[BrowserManager] Browser not initialized!")
            return False
        
        try:
            print(f"[BrowserManager] Navigating to: {url}")
            
            # Small random delay before navigation (human-like)
            time.sleep(random.uniform(0.3, 0.8))
            
            self.driver.get(url)
            
            # Wait for page to stabilize
            time.sleep(random.uniform(1, 2))
            
            print("[BrowserManager] Navigation complete!")
            return True
            
        except TimeoutException:
            print("[BrowserManager] Page load timeout!")
            return False
        except Exception as e:
            print(f"[BrowserManager] Navigation failed: {str(e)}")
            return False
    
    def is_browser_alive(self) -> bool:
        """Check if the browser window is still open."""
        if not self.driver:
            return False
        try:
            # Try to get the current URL - this will fail if browser is closed
            _ = self.driver.current_url
            return True
        except (WebDriverException, Exception):
            return False
    
    def set_close_callback(self, callback: Callable):
        """Set callback to be called when browser is closed externally."""
        self._on_close_callback = callback
    
    def start_close_monitor(self, interval: float = 1.0):
        """Start a thread that monitors if browser is closed externally."""
        self._should_monitor = True
        
        def monitor_loop():
            while self._should_monitor:
                if not self.is_browser_alive():
                    print("[BrowserManager] Browser closed externally!")
                    self._is_initialized = False
                    if self._on_close_callback:
                        self._on_close_callback()
                    break
                time.sleep(interval)
        
        self._monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        self._monitor_thread.start()
    
    def stop_close_monitor(self):
        """Stop the close monitor thread."""
        self._should_monitor = False
    
    def wait_for_element(self, selector: str, timeout: int = None) -> bool:
        """
        Wait for a specific element to be present.
        
        Args:
            selector: CSS selector or XPath
            timeout: Custom timeout in seconds
            
        Returns:
            True if element found, False otherwise
        """
        timeout = timeout or TIMEOUTS["element_wait"]
        
        try:
            try:
                WebDriverWait(self.driver, timeout).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                return True
            except:
                WebDriverWait(self.driver, timeout).until(
                    EC.presence_of_element_located((By.XPATH, selector))
                )
                return True
                
        except TimeoutException:
            return False
    
    def execute_script(self, script: str, *args):
        """Execute JavaScript in the browser."""
        if not self._is_initialized or not self.driver:
            return None
        return self.driver.execute_script(script, *args)
    
    def get_driver(self):
        """Get the Selenium WebDriver instance."""
        return self.driver
    
    def is_initialized(self) -> bool:
        """Check if browser is initialized."""
        return self._is_initialized
    
    def close(self):
        """Close the browser."""
        self.stop_close_monitor()
        if self.driver:
            try:
                self.driver.quit()
                print("[BrowserManager] Browser closed.")
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
