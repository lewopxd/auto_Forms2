"""
Recording Session Manager
Manages the lifecycle of a form recording session.
"""
import os
import json
import time
import threading
from typing import Optional, Dict, Any, Callable

from .browser_manager import BrowserManager
from .browser_settings import BrowserConfig
from . import js_injector
from .form_analyzer import analyze_form, get_questions_for_ui
from .form_storage import save_recording


class RecordingSession:
    """
    Manages a single form recording session.
    Handles browser launch, UI injection, command polling, and data collection.
    """
    
    def __init__(
        self,
        filename: str,
        url: str,
        browser_path: str = None,
        config: BrowserConfig = None,
        # Login mode
        login_mode: bool = False,
        # Legacy params (deprecated, use config instead)
        incognito: bool = False,
        page_load_timeout: int = 120,
        # Callbacks
        on_connected: Callable = None,
        on_browser_closed: Callable = None,
        on_stop_requested: Callable[[bool], None] = None,
        on_data_update: Callable[[dict], None] = None
    ):
        """
        Initialize recording session.
        
        Args:
            filename: Name for the recording file (without extension)
            url: Initial URL to navigate to
            browser_path: Path to browser executable
            config: BrowserConfig instance with all browser settings (preferred)
            incognito: DEPRECATED - Use config.incognito instead
            page_load_timeout: DEPRECATED - Use config.page_load_timeout instead
            on_connected: Callback when browser is connected and UI injected
            on_browser_closed: Callback when browser is closed externally
            on_stop_requested: Callback when stop is requested from injected UI
            on_data_update: Callback when form data is updated
        """
        self.filename = filename
        self.url = url
        self.browser_path = browser_path
        
        # Use provided config or create default from legacy params
        if config is not None:
            self.config = config
        else:
            self.config = BrowserConfig(
                incognito=incognito,
                page_load_timeout=page_load_timeout
            )
        
        # Callbacks
        self.on_connected = on_connected
        self.on_browser_closed = on_browser_closed
        self.on_stop_requested = on_stop_requested
        self.on_data_update = on_data_update
        
        # State
        self.browser: Optional[BrowserManager] = None
        self.is_active = False
        self.is_connected = False
        self.login_mode = login_mode
        self.form_data: Dict[str, Any] = {}
        self.all_pages_data: Dict[str, Any] = {}
        
        # Command polling
        self._poll_thread: Optional[threading.Thread] = None
        self._should_poll = False
        self._login_start_time: float = 0
    
    def start(self) -> Dict[str, Any]:
        """
        Start the recording session.
        
        Returns:
            Dict with success status and error message if any
        """
        try:
            print(f"[RecordingSession] Starting session for {self.filename}")
            
            # Initialize browser with config
            self.browser = BrowserManager(
                browser_path=self.browser_path,
                config=self.config
            )
            
            # Set callback for external close
            self.browser.set_close_callback(self._handle_browser_closed)
            
            # Initialize browser
            if not self.browser.initialize():
                return {"success": False, "error": "Failed to initialize browser"}
            
            # Navigate: to MS login first if login_mode, otherwise directly to form URL
            if self.login_mode:
                print("[RecordingSession] Login mode: navigating to Microsoft login page")
                login_url = "https://login.microsoftonline.com/"
                if not self.browser.navigate_to(login_url):
                    self.browser.close()
                    return {"success": False, "error": "Failed to navigate to Microsoft login"}
            else:
                if not self.browser.navigate_to(self.url):
                    self.browser.close()
                    return {"success": False, "error": "Failed to navigate to URL"}
            
            # Wait a moment for page to stabilize
            time.sleep(1)
            
            # Inject appropriate UI based on login_mode
            if self.login_mode:
                print("[RecordingSession] Injecting login UI")
                if not js_injector.inject_login_ui(self.browser.get_driver()):
                    self.browser.close()
                    return {"success": False, "error": "Failed to inject login UI"}
                self._login_start_time = time.time()
            else:
                if not js_injector.inject_ui(self.browser.get_driver()):
                    self.browser.close()
                    return {"success": False, "error": "Failed to inject recording UI"}
            
            # Start monitoring
            self.browser.start_close_monitor()
            self._start_command_polling()
            
            # Mark as active and connected
            self.is_active = True
            self.is_connected = True
            
            # Only analyze if not in login mode
            if not self.login_mode:
                self._analyze_current_page()
            
            # Notify connected
            if self.on_connected:
                self.on_connected()
            
            print(f"[RecordingSession] Session started successfully (login_mode={self.login_mode})")
            return {"success": True, "connected": True, "login_mode": self.login_mode}
            
        except Exception as e:
            print(f"[RecordingSession] Start failed: {e}")
            if self.browser:
                self.browser.close()
            return {"success": False, "error": str(e)}
    
    def stop(self, save: bool = True) -> Dict[str, Any]:
        """
        Stop the recording session.
        
        Args:
            save: Whether to save the recording data
            
        Returns:
            Dict with success status and saved path if applicable
        """
        print(f"[RecordingSession] Stopping session, save={save}")
        
        self._should_poll = False
        self.is_active = False
        
        saved_path = None
        
        if save and self.all_pages_data:
            try:
                # Save to file
                saved_path = self._save_to_disk()
                print(f"[RecordingSession] Saved to: {saved_path}")
                
            except Exception as e:
                print(f"[RecordingSession] Save error: {e}")
        
        # Close browser
        if self.browser:
            self.browser.close()
            self.browser = None
        
        return {"success": True, "path": saved_path}
    
    def _handle_browser_closed(self):
        """Handle browser being closed externally."""
        print("[RecordingSession] Browser was closed externally")
        self.is_active = False
        self.is_connected = False
        self._should_poll = False
        
        if self.on_browser_closed:
            self.on_browser_closed()
    
    def _start_command_polling(self):
        """Start polling for commands from injected UI."""
        self._should_poll = True
        
        def poll_loop():
            print("[RecordingSession] Poll loop started")
            while self._should_poll and self.is_active:
                try:
                    # Check connection first
                    if not self.browser or not self.browser.is_browser_alive():
                        print("[RecordingSession] Browser seemingly dead. Stopping poll loop.")
                        break
                    
                    # Direct command polling (Legacy style)
                    commands = js_injector.get_commands(self.browser.get_driver())
                    
                    if commands:
                        print(f"[RecordingSession] Got {len(commands)} commands from UI")
                    
                    for cmd in commands:
                        self._handle_command(cmd)
                    
                    # Login mode: ensure login UI is still present (re-inject if page reloaded)
                    if self.login_mode:
                        driver = self.browser.get_driver()
                        if not js_injector.is_login_ui_injected(driver):
                            print("[RecordingSession] Login UI not found, re-injecting...")
                            js_injector.inject_login_ui(driver)
                        
                        # Check for 5-minute timeout warning
                        if self._login_start_time > 0:
                            elapsed = time.time() - self._login_start_time
                            if elapsed > 300:  # 5 minutes
                                try:
                                    driver.execute_script(
                                        "if(window.__msfa_showTimeoutWarning) window.__msfa_showTimeoutWarning();"
                                    )
                                except:
                                    pass
                                self._login_start_time = time.time()  # Reset timer
                    
                except Exception as e:
                    print(f"[RecordingSession] Poll error: {e}")
                    import traceback
                    traceback.print_exc()
                
                # Poll interval: 2 seconds for login mode (re-injection), 0.5 for normal
                time.sleep(2 if self.login_mode else 0.5)
            print("[RecordingSession] Poll loop finished")
        
        self._poll_thread = threading.Thread(target=poll_loop, daemon=True)
        self._poll_thread.start()
    
    def _handle_command(self, cmd: dict):
        """Handle a command from the injected UI."""
        cmd_type = cmd.get("type")
        print(f"[RecordingSession] Received command: {cmd_type}")
        
        if cmd_type == "analyze":
            self._analyze_current_page()
            
        elif cmd_type == "save":
            print("[RecordingSession] Processing Save command...")
            data = cmd.get("data", {})
            self._save_page_data(data)
            print("[RecordingSession] Save command processed.")
            
        elif cmd_type == "stop":
            print("[RecordingSession] Processing Stop command...")
            save = cmd.get("save", True)
            if self.on_stop_requested:
                self.on_stop_requested(save)
            else:
                self.stop(save=save)
        
        elif cmd_type == "login_done":
            print("[RecordingSession] Login complete, navigating to form URL")
            self.login_mode = False
            driver = self.browser.get_driver()
            
            # Remove login UI first
            js_injector.remove_login_ui(driver)
            
            # Navigate to the original form URL
            print(f"[RecordingSession] Navigating to form: {self.url}")
            if self.browser.navigate_to(self.url):
                # Wait for page to load
                time.sleep(2)
                
                # Inject recording UI and analyze
                if js_injector.inject_ui(driver):
                    self._analyze_current_page()
                else:
                    print("[RecordingSession] Failed to inject recording UI after login")
            else:
                print("[RecordingSession] Failed to navigate to form URL after login")
    
    def _analyze_current_page(self):
        """Analyze the current page and update injected UI."""
        if not self.browser or not self.browser.is_browser_alive():
            print("[RecordingSession] Browser not alive, skipping analysis")
            return
        
        try:
            print("[RecordingSession] Starting page analysis...")
            driver = self.browser.get_driver()
            # Use get_questions_for_ui to ensure correct format for UI
            data = get_questions_for_ui(driver)
            print(f"[RecordingSession] Analysis complete. Data keys: {list(data.keys()) if data else 'None'}")
            
            if data and not data.get("error"):
                self.form_data = data
                print("[RecordingSession] Sending data to UI...")
                js_injector.set_form_data(driver, data)
                print("[RecordingSession] Data sent to UI")
                
                if self.on_data_update:
                    self.on_data_update(data)
                    
        except Exception as e:
            print(f"[RecordingSession] Analysis error: {e}")
            import traceback
            traceback.print_exc()
    
    def _save_page_data(self, data: dict):
        """Save data for current page."""
        if not data:
            return
        
        page_info = data.get("pageInfo", {})
        page_key = f"page_{page_info.get('current', 1)}"
        
        # Convert questions array to object format { "q1": {...}, "q2": {...} }
        questions_array = data.get("questions", [])
        questions_obj = {}
        for q in questions_array:
            # Use 'num' property as the key (e.g., "1" -> "q1")
            q_num = q.get("num", str(len(questions_obj) + 1))
            questions_obj[f"q{q_num}"] = q
        
        self.all_pages_data[page_key] = {
            "questions": questions_obj,
            "pageInfo": page_info,
            "navigation": data.get("navigation", {}),
            "isPostSubmitPage": data.get("isPostSubmitPage", False),
            "postSubmitActions": data.get("postSubmitActions", {})
        }
        
        print(f"[RecordingSession] Saved page data to memory: {page_key}")
        
        # Notify UI that save was successful
        if self.browser and self.browser.is_browser_alive():
            js_injector.notify_saved(self.browser.get_driver())

    def _save_to_disk(self) -> Optional[str]:
        """Helper to save current recording state to disk."""
        if not self.all_pages_data:
            return None
            
        recording_data = {
            "url": self.url,
            "filename": self.filename,
            "pages": self.all_pages_data,
            "recorded_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        
        return save_recording(self.filename, recording_data)


# Global session instance (singleton for now)
_active_session: Optional[RecordingSession] = None


def get_active_session() -> Optional[RecordingSession]:
    """Get the currently active recording session."""
    global _active_session
    return _active_session


def set_active_session(session: Optional[RecordingSession]):
    """Set the active recording session."""
    global _active_session
    _active_session = session


def start_new_session(
    filename: str,
    url: str,
    browser_path: str = None,
    config: BrowserConfig = None,
    login_mode: bool = False,
    # Legacy params (deprecated)
    incognito: bool = False,
    page_load_timeout: int = 120,
    callbacks: dict = None
) -> Dict[str, Any]:
    """
    Start a new recording session (convenience function).
    
    Args:
        filename: Recording filename
        url: Initial URL
        browser_path: Browser executable path
        config: BrowserConfig instance (preferred over legacy params)
        login_mode: If True, wait for user login before analyzing
        incognito: DEPRECATED - Use config.incognito instead
        page_load_timeout: DEPRECATED - Use config.page_load_timeout instead
        callbacks: Dict of callback functions
        
    Returns:
        Result dict from session.start()
    """
    global _active_session
    
    # Stop any existing session first
    if _active_session and _active_session.is_active:
        _active_session.stop(save=False)
    
    callbacks = callbacks or {}
    
    # Create session with config or legacy params
    session = RecordingSession(
        filename=filename,
        url=url,
        browser_path=browser_path,
        config=config,
        login_mode=login_mode,
        incognito=incognito,
        page_load_timeout=page_load_timeout,
        on_connected=callbacks.get("on_connected"),
        on_browser_closed=callbacks.get("on_browser_closed"),
        on_stop_requested=callbacks.get("on_stop_requested"),
        on_data_update=callbacks.get("on_data_update")
    )
    
    result = session.start()
    
    if result.get("success"):
        _active_session = session
    
    return result


def stop_active_session(save: bool = True) -> Dict[str, Any]:
    """Stop the active recording session."""
    global _active_session
    
    if not _active_session:
        return {"success": False, "error": "No active session"}
    
    result = _active_session.stop(save=save)
    _active_session = None
    return result
