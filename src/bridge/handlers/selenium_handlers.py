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
                if self.bridge.window:
                    self.bridge.window.evaluate_js(
                        "window.dispatchEvent(new CustomEvent('recording_browser_closed', {detail: {}}));"
                    )
            
            def on_stop_requested(save: bool):
                print(f"[SeleniumHandler] Stop requested from injected UI, save={save}")
                result = stop_active_session(save=save)
                if self.bridge.window:
                    import json
                    self.bridge.window.evaluate_js(
                        f"window.dispatchEvent(new CustomEvent('recording_stopped', {{detail: {json.dumps(result)}}}));"
                    )
            
            result = start_new_session(
                filename=filename,
                url=url,
                browser_path=browser_path,
                config=config,
                callbacks={
                    "on_connected": on_connected,
                    "on_browser_closed": on_browser_closed,
                    "on_stop_requested": on_stop_requested
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
            return result
        except Exception as e:
            print(f"[SeleniumHandler] Error stopping recording: {e}")
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


def register_selenium_handlers(bridge):
    """Register all selenium handlers with the bridge."""
    print("[SeleniumHandler] register_selenium_handlers called")
    handler = SeleniumHandler(bridge)
    # Register the extra handlers manually if not in init
    bridge.register_handler("select_file_dialog", handler.handle_select_file_dialog)
    bridge.register_handler("select_save_dialog", handler.handle_select_save_dialog)
    bridge.register_handler("copy_file", handler.handle_copy_file)

