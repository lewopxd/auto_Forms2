"""
Selenium Handlers for Bridge API
Handles browser detection, form record management, and recording sessions.

NOTE: Selenium imports are OPTIONAL. If selenium is not installed,
the handlers will return graceful error messages instead of crashing.
"""
import sys
import os
from typing import Dict, Any

# Ensure core is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# === OPTIONAL SELENIUM IMPORTS ===
# These are wrapped in try/except so the server doesn't crash if selenium isn't installed
SELENIUM_AVAILABLE = False
_selenium_import_error = None

try:
    from core.browser_automation.browser_detector import BrowserDetector
    from core.browser_automation.browser_settings import BrowserConfig, get_available_profiles
    from core.browser_automation.form_storage import (
        get_all_forms, 
        load_form_data_from_path, 
        delete_record,
        rename_record,
        import_record
    )
    from core.browser_automation.recording_session import (
        start_new_session,
        stop_active_session,
        get_active_session
    )
    from core.browser_automation.profile_utils import (
        get_chrome_profiles_path,
        get_browser_profiles_path,
        list_chrome_profiles,
        is_profile_in_use,
        get_profile_info
    )
    from core.ui_freeze import UIFreezeManager
    SELENIUM_AVAILABLE = True
except ImportError as e:
    _selenium_import_error = str(e)
    print(f"[SeleniumHandler] WARNING: Selenium modules not available: {e}")
    print("[SeleniumHandler] Recording features will be disabled.")
    
    # Define dummy references so the code doesn't crash
    BrowserDetector = None
    BrowserConfig = None
    get_available_profiles = None
    get_all_forms = None
    load_form_data_from_path = None
    delete_record = None
    rename_record = None
    import_record = None
    start_new_session = None
    stop_active_session = None
    get_active_session = None
    get_chrome_profiles_path = None
    list_chrome_profiles = None
    is_profile_in_use = None
    get_profile_info = None
    UIFreezeManager = None


class SeleniumHandler:
    """Handles Selenium-related bridge messages."""
    
    def __init__(self, bridge):
        self.bridge = bridge
        self.detector = None
        
        # Only create detector if selenium is available
        if SELENIUM_AVAILABLE and BrowserDetector:
            self.detector = BrowserDetector()
            print("[SeleniumHandler] Registering handlers (Selenium AVAILABLE)")
        else:
            print(f"[SeleniumHandler] Registering handlers (Selenium NOT available: {_selenium_import_error})")
        
        # Register handlers - they will return errors if selenium not available
        bridge.register_handler("detect_browsers", self.handle_detect_browsers)
        bridge.register_handler("list_form_records", self.handle_list_records)
        bridge.register_handler("load_form_record", self.handle_load_record)
        bridge.register_handler("delete_form_record", self.handle_delete_record)
        bridge.register_handler("rename_form_record", self.handle_rename_record)
        bridge.register_handler("import_form_record", self.handle_import_record)
        
        # Recording session handlers
        bridge.register_handler("start_recording", self.handle_start_recording)
        bridge.register_handler("stop_recording", self.handle_stop_recording)
        bridge.register_handler("get_recording_status", self.handle_get_recording_status)
        
        # Browser config handlers
        bridge.register_handler("get_browser_profiles", self.handle_get_browser_profiles)
        bridge.register_handler("list_chrome_profiles", self.handle_list_chrome_profiles)
        bridge.register_handler("check_profile_in_use", self.handle_check_profile_in_use)
        
        print("[SeleniumHandler] Handlers registered: browsers, records, recording, profiles")

    
    def _check_selenium(self) -> Dict[str, Any] | None:
        """Check if selenium is available. Returns error dict if not."""
        if not SELENIUM_AVAILABLE:
            return {
                "success": False, 
                "error": f"Selenium not installed: {_selenium_import_error}",
                "selenium_missing": True
            }
        return None
    
    def handle_detect_browsers(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Detect installed browsers."""
        print("[SeleniumHandler] handle_detect_browsers called")
        
        # Check selenium availability
        if not self.detector:
            return {"success": False, "error": "Browser detection not available", "browsers": []}
        
        try:
            browsers = self.detector.get_dropdown_choices()
            print(f"[SeleniumHandler] Detected {len(browsers)} browsers")
            return {"success": True, "browsers": browsers}
        except Exception as e:
            print(f"[SeleniumHandler] Error detecting browsers: {e}")
            return {"success": False, "error": str(e), "browsers": []}
    
    def handle_list_records(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """List all saved form records."""
        print("[SeleniumHandler] handle_list_records called")
        
        if err := self._check_selenium():
            err["forms"] = []
            return err
        
        try:
            forms = get_all_forms()
            print(f"[SeleniumHandler] Found {len(forms)} form records")
            return {"success": True, "forms": forms}
        except Exception as e:
            print(f"[SeleniumHandler] Error listing records: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e), "forms": []}
    
    def handle_load_record(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Load a specific form record by path."""
        print(f"[SeleniumHandler] handle_load_record called with: {content}")
        try:
            path = content.get("path", "")
            if not path:
                return {"success": False, "error": "No path provided"}
            
            data = load_form_data_from_path(path)
            if "error" in data:
                return {"success": False, "error": data["error"]}
            
            print(f"[SeleniumHandler] Loaded record from {path}")
            return {"success": True, "data": data}
        except Exception as e:
            print(f"[SeleniumHandler] Error loading record: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    def handle_delete_record(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a record file."""
        print(f"[SeleniumHandler] deleting record: {content}")
        try:
            path = content.get("path")
            if not path:
                return {"success": False, "error": "No path provided"}
                
            success = delete_record(path)
            return {"success": success}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def handle_rename_record(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Rename a record file."""
        print(f"[SeleniumHandler] renaming record: {content}")
        try:
            path = content.get("path")
            new_name = content.get("newName")
            
            if not path or not new_name:
                return {"success": False, "error": "Missing path or name"}
                
            return rename_record(path, new_name)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def handle_import_record(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Import an external record file."""
        print(f"[SeleniumHandler] importing record: {content}")
        try:
            src_path = content.get("path")
            if not src_path:
                return {"success": False, "error": "No path provided"}
                
            return import_record(src_path)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def handle_select_file_dialog(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Open a native file dialog to select a file."""
        print(f"[SeleniumHandler] opening file dialog: {content}")
        try:
            if not self.bridge.window:
                return {"success": False, "error": "No window access"}
            
            import webview
            
            file_types = content.get("file_types", ("All files (*.*)"))
            if isinstance(file_types, list):
                file_types = tuple(file_types)
                
            result = self.bridge.window.create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=file_types
            )
            
            path = result[0] if result else None
            return {"success": True, "path": path}
        except Exception as e:
            print(f"[SeleniumHandler] Error opening dialog: {e}")
            return {"success": False, "error": str(e)}

    def handle_select_save_dialog(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Open a native file dialog to save a file."""
        print(f"[SeleniumHandler] opening save dialog: {content}")
        try:
            if not self.bridge.window:
                return {"success": False, "error": "No window access"}
            
            import webview
            
            file_types = content.get("file_types", ("All files (*.*)",))
            if isinstance(file_types, list):
                file_types = tuple(file_types)
            
            default_name = content.get("default_name", "")
                
            result = self.bridge.window.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=default_name,
                file_types=file_types
            )
            
            path = result if isinstance(result, str) else (result[0] if result else None)
            return {"success": True, "path": path}
        except Exception as e:
            print(f"[SeleniumHandler] Error opening save dialog: {e}")
            return {"success": False, "error": str(e)}

    def handle_copy_file(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Copy a file from source to destination."""
        print(f"[SeleniumHandler] copying file: {content}")
        try:
            import shutil
            source = content.get("source")
            dest = content.get("dest")
            
            if not source or not dest:
                return {"success": False, "error": "Missing source or dest"}
            
            shutil.copy2(source, dest)
            return {"success": True, "path": dest}
        except Exception as e:
            print(f"[SeleniumHandler] Error copying file: {e}")
            return {"success": False, "error": str(e)}

    def handle_start_recording(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Start a new recording session with browser configuration."""
        print(f"[SeleniumHandler] start_recording called: {content}")
        try:
            filename = content.get("filename", "recording")
            url = content.get("url", "")
            browser = content.get("browser", "")
            options = content.get("options", {})
            browser_config = content.get("browser_config", {})
            login_mode = content.get("login_mode", False)
            
            if not url:
                return {"success": False, "error": "URL is required"}
            
            # Get browser path from detector
            browser_path = None
            if browser and self.detector:
                browsers = self.detector.get_dropdown_choices()
                for b in browsers:
                    if b.get("name") == browser:
                        browser_path = b.get("path")
                        break
            
            # Build BrowserConfig from browser_config dict or legacy options
            config = None
            if browser_config and BrowserConfig:
                # New way: full config dict from UI
                try:
                    config = BrowserConfig.from_dict(browser_config)
                    print(f"[SeleniumHandler] Using BrowserConfig: profile={config.efficiency_profile}")
                    
                    # Calculate user_profile_path based on browser type if using profile
                    if config.use_user_profile and not config.user_profile_path:
                        profile_path = get_browser_profiles_path(browser, browser_path)
                        if profile_path:
                            config.user_profile_path = profile_path
                            print(f"[SeleniumHandler] Calculated profile path for {browser}: {profile_path}")
                        else:
                            print(f"[SeleniumHandler] Warning: No profile path found for {browser}")
                    
                except Exception as e:
                    print(f"[SeleniumHandler] Error creating BrowserConfig: {e}")
            elif BrowserConfig:
                # Legacy fallback: build from options
                config = BrowserConfig(
                    incognito=options.get("noCache", False),
                    page_load_timeout=options.get("timeout", 120)
                )
                print(f"[SeleniumHandler] Using legacy options -> BrowserConfig")
            
            # Callbacks for UI notification
            def on_connected():
                print("[SeleniumHandler] Recording connected, notifying UI")
                if self.bridge.window:
                    self.bridge.window.evaluate_js(
                        "window.dispatchEvent(new CustomEvent('recording_connected', {detail: {}}));"
                    )
            
            def on_browser_closed():
                print("[SeleniumHandler] Browser closed externally, notifying UI")
                # === UNFREEZE UI ===
                if UIFreezeManager:
                    UIFreezeManager.unfreeze()
                if self.bridge.window:
                    self.bridge.window.evaluate_js(
                        "window.dispatchEvent(new CustomEvent('recording_browser_closed', {detail: {}}));"
                    )
            
            def on_stop_requested(save: bool):
                print(f"[SeleniumHandler] Stop requested from injected UI, save={save}")
                result = stop_active_session(save=save)
                # === UNFREEZE UI ===
                if UIFreezeManager:
                    UIFreezeManager.unfreeze()
                if self.bridge.window:
                    import json
                    self.bridge.window.evaluate_js(
                        f"window.dispatchEvent(new CustomEvent('recording_stopped', {{detail: {json.dumps(result)}}}));"
                    )
            
            def on_state_change(state: str, message: str):
                """Emit browser state change to UI."""
                print(f"[SeleniumHandler] State change: {state} - {message}")
                if self.bridge.window:
                    import json
                    detail = json.dumps({"state": state, "message": message})
                    self.bridge.window.evaluate_js(
                        f"window.dispatchEvent(new CustomEvent('browser_state_change', {{detail: {detail}}}));"
                    )
            
            def on_warning(warning_type: str, message: str):
                """Emit slow operation warning to UI."""
                print(f"[SeleniumHandler] Warning: {warning_type} - {message}")
                if self.bridge.window:
                    import json
                    detail = json.dumps({"type": warning_type, "message": message})
                    self.bridge.window.evaluate_js(
                        f"window.dispatchEvent(new CustomEvent('browser_warning', {{detail: {detail}}}));"
                    )
            
            # === FREEZE UI with 1 second delay (so user sees "Conectando" first) ===
            if UIFreezeManager and self.bridge.window:
                import threading
                def delayed_freeze():
                    UIFreezeManager.freeze(self.bridge.window, "recording")
                threading.Timer(1.0, delayed_freeze).start()
            
            print(f"[SeleniumHandler] Starting session with login_mode={login_mode}")
            result = start_new_session(
                filename=filename,
                url=url,
                browser_path=browser_path,
                config=config,
                login_mode=login_mode,
                callbacks={
                    "on_connected": on_connected,
                    "on_browser_closed": on_browser_closed,
                    "on_stop_requested": on_stop_requested,
                    "on_state_change": on_state_change,
                    "on_warning": on_warning
                }
            )
            
            return result
            
        except Exception as e:
            print(f"[SeleniumHandler] Error starting recording: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    def handle_get_browser_profiles(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get available browser efficiency profiles for UI display.
        
        Returns:
            Dict with profiles and their descriptions
        """
        print("[SeleniumHandler] get_browser_profiles called")
        try:
            if not get_available_profiles:
                return {"success": False, "error": "Browser settings not available"}
            
            profiles = get_available_profiles()
            return {"success": True, "profiles": profiles}
        except Exception as e:
            print(f"[SeleniumHandler] Error getting profiles: {e}")
            return {"success": False, "error": str(e)}

    def handle_stop_recording(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Stop the active recording session."""
        print(f"[SeleniumHandler] stop_recording called: {content}")
        try:
            save = content.get("save", True)
            result = stop_active_session(save=save)
            # === UNFREEZE UI ===
            if UIFreezeManager:
                UIFreezeManager.unfreeze()
            return result
        except Exception as e:
            print(f"[SeleniumHandler] Error stopping recording: {e}")
            # Unfreeze even on error
            if UIFreezeManager:
                UIFreezeManager.unfreeze()
            return {"success": False, "error": str(e)}

    def handle_get_recording_status(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Get the status of the active recording session."""
        try:
            session = get_active_session()
            if session:
                return {
                    "success": True,
                    "active": session.is_active,
                    "connected": session.is_connected,
                    "filename": session.filename,
                    "url": session.url
                }
            return {"success": True, "active": False}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def handle_list_chrome_profiles(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """List available profiles for the selected browser."""
        print("[SeleniumHandler] handle_list_chrome_profiles called")
        
        err = self._check_selenium()
        if err:
            return err
        
        try:
            browser_type = content.get("browser_type", "chrome")
            browser_path = content.get("browser_path", None)
            print(f"[SeleniumHandler] Listing profiles for browser: {browser_type}")
            info = get_profile_info(browser_type, browser_path)
            return {"success": True, **info}
        except Exception as e:
            print(f"[SeleniumHandler] Error listing profiles: {e}")
            return {"success": False, "error": str(e), "profiles": []}

    def handle_check_profile_in_use(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Check if a browser profile is currently in use."""
        print("[SeleniumHandler] handle_check_profile_in_use called")
        
        err = self._check_selenium()
        if err:
            return err
        
        try:
            browser_type = content.get("browser_type", "chrome")
            browser_path = content.get("browser_path", None)
            path = content.get("path") or get_browser_profiles_path(browser_type, browser_path)
            name = content.get("name", "Default")
            
            print(f"[SeleniumHandler] Checking profile in use: {name} for {browser_type}")
            in_use = is_profile_in_use(path, name, browser_type)
            return {"success": True, "in_use": in_use, "profile": name}
        except Exception as e:
            print(f"[SeleniumHandler] Error checking profile: {e}")
            return {"success": False, "error": str(e), "in_use": False}


def register_selenium_handlers(bridge):
    """Register all selenium handlers with the bridge."""
    print("[SeleniumHandler] register_selenium_handlers called")
    handler = SeleniumHandler(bridge)
    # Register the extra handlers manually if not in init
    bridge.register_handler("select_file_dialog", handler.handle_select_file_dialog)
    bridge.register_handler("select_save_dialog", handler.handle_select_save_dialog)
    bridge.register_handler("copy_file", handler.handle_copy_file)
    bridge.register_handler("save_recording_to_file", handler.handle_save_recording_to_file)


# Add missing method to SeleniumHandler class
def _handle_save_recording_to_file(self, content: Dict[str, Any]) -> Dict[str, Any]:
    """Save recording data to a .raf file (for exporting from project)."""
    print(f"[SeleniumHandler] save_recording_to_file called: {content.get('path', 'no path')}")
    try:
        import json
        path = content.get("path")
        data = content.get("data")
        
        if not path:
            return {"success": False, "error": "No path provided"}
        if not data:
            return {"success": False, "error": "No data provided"}
        
        # Ensure .raf extension
        if not path.lower().endswith('.raf'):
            path += '.raf'
        
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"[SeleniumHandler] Recording saved to: {path}")
        return {"success": True, "path": path}
    except Exception as e:
        print(f"[SeleniumHandler] Error saving recording: {e}")
        return {"success": False, "error": str(e)}

# Patch the method onto the class
SeleniumHandler.handle_save_recording_to_file = _handle_save_recording_to_file
