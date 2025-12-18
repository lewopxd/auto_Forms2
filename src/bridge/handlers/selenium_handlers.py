"""
Selenium Handlers for Bridge API
Handles browser detection and form record management.
"""
import sys
import os
from typing import Dict, Any

# Ensure core is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.selenium.browser_detector import BrowserDetector
from core.selenium.form_storage import (
    get_all_forms, 
    load_form_data_from_path, 
    delete_record,
    rename_record,
    import_record
)


class SeleniumHandler:
    """Handles Selenium-related bridge messages."""
    
    def __init__(self, bridge):
        self.bridge = bridge
        self.detector = BrowserDetector()
        
        print("[SeleniumHandler] Registering handlers...")
        
        # Register handlers
        bridge.register_handler("detect_browsers", self.handle_detect_browsers)
        bridge.register_handler("list_form_records", self.handle_list_records)
        bridge.register_handler("load_form_record", self.handle_load_record)
        bridge.register_handler("delete_form_record", self.handle_delete_record)
        bridge.register_handler("rename_form_record", self.handle_rename_record)
        bridge.register_handler("import_form_record", self.handle_import_record)
        
        print("[SeleniumHandler] Handlers registered: detect_browsers, list/load/delete/rename/import records")
    
    def handle_detect_browsers(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Detect installed browsers."""
        print("[SeleniumHandler] handle_detect_browsers called")
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


def register_selenium_handlers(bridge):
    """Register all selenium handlers with the bridge."""
    print("[SeleniumHandler] register_selenium_handlers called")
    handler = SeleniumHandler(bridge)
    # Register the extra handlers manually if not in init
    bridge.register_handler("select_file_dialog", handler.handle_select_file_dialog)
    bridge.register_handler("select_save_dialog", handler.handle_select_save_dialog)
    bridge.register_handler("copy_file", handler.handle_copy_file)

