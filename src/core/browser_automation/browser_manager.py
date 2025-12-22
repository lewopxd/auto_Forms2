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
from typing import Optional, Callable, Dict, Any

# --- Local imports ---
from .browser_settings import BrowserConfig, build_chrome_options
from .browser_state import BrowserState, BrowserStateManager, LaunchMonitor

# --- Optional: psutil for process monitoring ---
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    psutil = None
    PSUTIL_AVAILABLE = False

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


class ChromeProcessMonitor:
    """
    Monitor Chrome browser processes using psutil.
    
    This detects when Chrome actually starts as an OS process,
    INDEPENDENT of whether Selenium/WebDriver can connect to it.
    """
    
    def __init__(self, on_browser_detected: Callable[[], None] = None):
        self._on_browser_detected = on_browser_detected
        self._should_run = False
        self._thread = None
        self._initial_chrome_pids = set()
        self._detected = False
        self._browser_pid = None
    
    def start(self):
        """Start monitoring for new Chrome processes."""
        if not PSUTIL_AVAILABLE:
            print("[ChromeProcessMonitor] psutil not available, skipping process monitoring")
            return
        
        # Capture existing Chrome PIDs before launch
        self._initial_chrome_pids = self._get_chrome_pids()
        print(f"[ChromeProcessMonitor] Initial Chrome PIDs: {len(self._initial_chrome_pids)}")
        
        self._should_run = True
        self._detected = False
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True, name="ChromeProcessMonitor")
        self._thread.start()
    
    def stop(self):
        """Stop monitoring."""
        self._should_run = False
        if self._thread:
            self._thread.join(timeout=1.0)
    
    def _get_chrome_pids(self) -> set:
        """Get all current Chrome-related process PIDs."""
        chrome_pids = set()
        if not PSUTIL_AVAILABLE:
            return chrome_pids
        
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                name = proc.info['name'].lower()
                if 'chrome' in name or 'chromium' in name or 'brave' in name:
                    chrome_pids.add(proc.info['pid'])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return chrome_pids
    
    def _monitor_loop(self):
        """Monitor loop that checks for new Chrome processes."""
        check_count = 0
        while self._should_run and check_count < 60:  # Max 60 seconds
            try:
                current_pids = self._get_chrome_pids()
                new_pids = current_pids - self._initial_chrome_pids
                
                if new_pids and not self._detected:
                    # New Chrome process detected!
                    self._detected = True
                    self._browser_pid = list(new_pids)[0]  # Get first new PID
                    print(f"[ChromeProcessMonitor] New browser process detected! PID: {self._browser_pid}")
                    
                    if self._on_browser_detected:
                        self._on_browser_detected()
                    
                    # Continue monitoring but don't trigger again
                
                time.sleep(0.5)  # Check every 500ms
                check_count += 1
                
            except Exception as e:
                print(f"[ChromeProcessMonitor] Error: {e}")
                time.sleep(1)
    
    @property
    def browser_detected(self) -> bool:
        return self._detected
    
    @property
    def browser_pid(self) -> Optional[int]:
        return self._browser_pid


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
        
        # State management
        self._state_manager: Optional[BrowserStateManager] = None
        self._launch_monitor: Optional[LaunchMonitor] = None
        self._process_monitor: Optional[ChromeProcessMonitor] = None
        self._on_progress: Optional[Callable[[str, str], None]] = None
        self._launch_result: Dict[str, Any] = {}
    
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
            if self._state_manager:
                self._state_manager.set_error(str(e))
            return False
    
    def set_progress_callback(self, callback: Callable[[str, str], None]):
        """
        Set callback to receive progress updates during initialization.
        
        Args:
            callback: Function(state: str, message: str) to call on progress
        """
        self._on_progress = callback
    
    def initialize_async(
        self,
        on_progress: Callable[[str, str], None] = None,
        on_warning: Callable[[str, str], None] = None
    ) -> threading.Event:
        """
        Initialize browser asynchronously with state callbacks.
        
        This is the PREFERRED method for launching the browser as it:
        - Runs in a background thread (non-blocking)
        - Emits state changes via callbacks
        - Monitors for slow operations and emits warnings
        - Uses psutil to detect when browser ACTUALLY opens (before WebDriver connects)
        
        Args:
            on_progress: Callback(state, message) for state changes
            on_warning: Callback(warning_type, message) for slow operation warnings
            
        Returns:
            threading.Event that is set when initialization completes (success or failure)
        """
        ready_event = threading.Event()
        self._launch_result = {"success": False, "error": None}
        
        # Create state manager with callbacks
        self._state_manager = BrowserStateManager(
            on_state_change=on_progress,
            on_warning=on_warning
        )
        
        # Start launch monitor for slow operation warnings
        self._launch_monitor = LaunchMonitor(self._state_manager, check_interval=5.0)
        self._launch_monitor.start()
        
        # Create process monitor to detect when Chrome ACTUALLY opens
        def on_browser_process_detected():
            # This is called when we detect Chrome process via psutil
            # BEFORE Selenium/WebDriver connects
            print("[BrowserManager] Browser process detected by OS monitor!")
            if self._state_manager:
                self._state_manager.set_state(BrowserState.PROCESS_DETECTED, "Abriendo navegador...")
        
        self._process_monitor = ChromeProcessMonitor(on_browser_detected=on_browser_process_detected)
        self._process_monitor.start()
        
        def launch_thread():
            try:
                # PHASE 1: Preparing
                self._state_manager.set_state(BrowserState.STARTING_PROCESS, "Iniciando proceso de navegador...")
                
                # Check dependencies
                if not SELENIUM_WEBDRIVER_AVAILABLE:
                    self._launch_result = {"success": False, "error": "selenium.webdriver not available"}
                    self._state_manager.set_error("Selenium no disponible")
                    ready_event.set()
                    return
                
                if uc is None:
                    self._launch_result = {"success": False, "error": "undetected-chromedriver not installed"}
                    self._state_manager.set_error("undetected-chromedriver no instalado")
                    ready_event.set()
                    return
                
                # PHASE 2: Send command to Selenium (process monitor will detect when OS process appears)
                print(f"[BrowserManager] Launching browser (profile: {self.config.efficiency_profile})...")
                
                options = self._get_chrome_options()
                
                # This is the potentially slow blocking call
                # Note: ChromeProcessMonitor will emit PROCESS_DETECTED when process appears
                self.driver = uc.Chrome(
                    options=options,
                    headless=self.config.headless,
                    use_subprocess=True,
                )
                
                # PHASE 3: WebDriver connected, browser window should be visible now
                self._state_manager.set_state(BrowserState.BROWSER_OPENED, "Navegador abierto")
                print("[BrowserManager] Browser window opened and WebDriver connected")
                
                # Apply timeouts from config
                self.driver.set_page_load_timeout(self.config.page_load_timeout)
                self.driver.implicitly_wait(self.config.implicit_wait)
                
                self._is_initialized = True
                self._launch_result = {"success": True, "error": None}
                print("[BrowserManager] Browser initialized successfully!")
                
            except Exception as e:
                error_msg = str(e)
                print(f"[BrowserManager] Failed to initialize browser: {error_msg}")
                self._launch_result = {"success": False, "error": error_msg}
                
                # If browser WAS detected by process monitor, this is a WebDriver connection issue
                # NOT a browser launch failure - emit warning, not error
                if self._process_monitor and self._process_monitor.browser_detected:
                    # Browser opened but WebDriver couldn't connect
                    # This is NOT fatal - user can still interact with browser manually
                    print("[BrowserManager] Browser is open but WebDriver connection failed - emitting warning")
                    self._state_manager.emit_warning("connection", f"WebDriver no pudo conectar: {error_msg[:100]}")
                    # Keep state as BROWSER_OPENED, don't switch to error
                else:
                    # Browser didn't even open - real error
                    self._state_manager.set_error(error_msg)
            finally:
                # Stop monitors
                if self._launch_monitor:
                    self._launch_monitor.stop()
                if self._process_monitor:
                    self._process_monitor.stop()
                ready_event.set()
        
        # Start the launch thread
        thread = threading.Thread(target=launch_thread, daemon=True, name="BrowserLaunch")
        thread.start()
        
        return ready_event
    
    def get_launch_result(self) -> Dict[str, Any]:
        """Get the result of async initialization."""
        return self._launch_result
    
    def get_state(self) -> str:
        """Get current browser state as string."""
        if self._state_manager:
            return self._state_manager.state_value
        return "unknown"
    
    def navigate_to(self, url: str) -> bool:
        """
        Navigate to a URL with state updates.
        
        Args:
            url: The URL to navigate to
            
        Returns:
            True if navigation successful, False otherwise
        """
        if not self._is_initialized:
            print("[BrowserManager] Browser not initialized!")
            return False
        
        try:
            # Emit state
            if self._state_manager:
                self._state_manager.set_state(BrowserState.NAVIGATING, f"Navegando a {url[:50]}...")
            
            print(f"[BrowserManager] Navigating to: {url}")
            
            # Small random delay before navigation (human-like)
            time.sleep(random.uniform(0.2, 0.5))
            
            self.driver.get(url)
            
            # Wait for page to be fully loaded (instead of fixed sleep)
            self._wait_for_page_load()
            
            # Emit state
            if self._state_manager:
                self._state_manager.set_state(BrowserState.PAGE_LOADED, "Página cargada")
            
            print("[BrowserManager] Navigation complete!")
            return True
            
        except TimeoutException:
            # NOT an error - just a warning, continue waiting
            print("[BrowserManager] Page load timeout (continuing anyway)...")
            if self._state_manager:
                self._state_manager.emit_warning("slow", "La página está tardando en cargar...")
                self._state_manager.set_state(BrowserState.PAGE_LOADED, "Página cargada (lento)")
            return True  # Continue anyway, don't cancel
        except Exception as e:
            print(f"[BrowserManager] Navigation failed: {str(e)}")
            if self._state_manager:
                self._state_manager.set_error(str(e))
            return False
    
    def _wait_for_page_load(self, timeout: int = None):
        """
        Wait for page to be fully loaded by checking document.readyState.
        
        Args:
            timeout: Max seconds to wait (uses config if not provided)
        """
        timeout = timeout or self.config.page_load_timeout
        start = time.time()
        
        while (time.time() - start) < timeout:
            try:
                ready_state = self.driver.execute_script("return document.readyState")
                if ready_state == "complete":
                    return
            except Exception:
                pass
            time.sleep(0.3)
        
        print(f"[BrowserManager] Page load wait exceeded {timeout}s, continuing anyway")
    
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
