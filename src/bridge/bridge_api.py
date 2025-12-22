#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: bridge_api.py
Created: 2025-12-16
Author: @lewopxd

Description:
Main bridge API for bidirectional Python ↔ JavaScript communication.
Handles message routing, handler registration, and response formatting.
============================================
"""

import uuid
import json
from typing import Dict, Any, Callable, Optional
from datetime import datetime

# Import Logger
try:
    from core.logger import Logger
except ImportError:
    try:
        from ..core.logger import Logger
    except ImportError:
        class Logger:
            @staticmethod
            def debug(msg): print(f"DEBUG: {msg}")
            @staticmethod
            def info(msg): print(f"INFO: {msg}")
            @staticmethod
            def warn(msg): print(f"WARN: {msg}")
            @staticmethod
            def error(msg): print(f"ERROR: {msg}")


class BridgeAPI:
    """
    Main API for Python ↔ JavaScript communication.
    
    Handles:
    - Registering message handlers
    - Processing incoming messages from JavaScript
    - Sending responses back to JavaScript
    - Sending proactive messages to JavaScript
    
    Message Protocol:
        JS → Python (request):
            {"id": "uuid", "msg": "handler_name", "content": {...}}
        
        Python → JS (response):
            {"id": "uuid", "response": "ok|error", "content": {...}}
    """
    
    def __init__(self, window, storage, on_ready_callback: Callable = None):
        """
        Initialize the bridge API.
        
        Args:
            window: pywebview window instance
            storage: AppStorage instance for persistence
            on_ready_callback: Function to call when handshake completes
        """
        self.window = window
        self.storage = storage
        self.on_ready_callback = on_ready_callback
        
        self.handlers: Dict[str, Callable] = {}
        self.is_ready: bool = False
        
        # Register default system handlers
        self._register_default_handlers()
    
    def _register_default_handlers(self):
        """Register built-in system handlers."""
        self.register_handler("handshake", self._handle_handshake)
        self.register_handler("ping", self._handle_ping)
        self.register_handler("get_app_info", self._handle_get_app_info)
        self.register_handler("get_ui_settings", self._handle_get_ui_settings)
        self.register_handler("save_ui_setting", self._handle_save_ui_setting)
    
    # ═══════════════════════════════════════════════════════════
    # HANDLER REGISTRATION
    # ═══════════════════════════════════════════════════════════
    
    def register_handler(self, msg_name: str, handler: Callable[[Dict[str, Any]], Dict[str, Any]]):
        """
        Register a handler for a message type.
        
        Args:
            msg_name: The message type to handle (e.g., "get_form_data")
            handler: Function that takes content dict and returns response dict
        """
        self.handlers[msg_name] = handler
        Logger.debug(f"[Bridge] Handler registered: {msg_name}")
    
    def get_registered_handlers(self) -> list:
        """Get list of registered handler names."""
        return list(self.handlers.keys())
    
    # ═══════════════════════════════════════════════════════════
    # MESSAGE HANDLING
    # ═══════════════════════════════════════════════════════════
    
    def handle_message(self, message: Any) -> Dict[str, Any]:
        """
        Process an incoming message from JavaScript.
        
        This is the main entry point exposed to pywebview.
        
        Args:
            message: Message dict or JSON string
            
        Returns:
            Response dict with id, response, and content
        """
        try:
            # Parse JSON if message is a string
            if isinstance(message, str):
                try:
                    message = json.loads(message)
                except json.JSONDecodeError:
                    return self._error_response("unknown", f"Invalid JSON: {message}")

            msg_id = message.get("id", str(uuid.uuid4()))
            msg_name = message.get("msg", "")
            content = message.get("content", {})
            
            # Validate message structure
            if not msg_name:
                return self._error_response(msg_id, "Invalid message: missing 'msg' field")
            
            # Find handler
            handler = self.handlers.get(msg_name)
            
            if not handler:
                Logger.warn(f"[Bridge] No handler for: {msg_name}")
                return self._error_response(msg_id, f"No handler for message type: {msg_name}")
            
            # Execute handler
            Logger.debug(f"[Bridge] Handling: {msg_name}")
            result = handler(content)
            
            # Return response (pywebview serializes return dicts automatically)
            return {
                "id": msg_id,
                "response": "ok",
                "content": result if result else {}
            }
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            Logger.error(f"[Bridge] Error handling '{message.get('msg', 'unknown')}': {e}")
            Logger.debug(f"[Bridge] Traceback:\n{error_details}")
            
            return {
                "id": message.get("id", "unknown"),
                "response": "error",
                "content": {"error": str(e), "traceback": error_details}
            }
    
    def _error_response(self, msg_id: str, error: str) -> Dict[str, Any]:
        """Create a standardized error response."""
        return {
            "id": msg_id,
            "response": "error",
            "content": {"error": error}
        }
    
    # ═══════════════════════════════════════════════════════════
    # SEND TO JAVASCRIPT
    # ═══════════════════════════════════════════════════════════
    
    def send_to_js(self, msg_name: str, content: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """
        Send a proactive message to JavaScript.
        
        Args:
            msg_name: Type of message to send
            content: Optional message content
            
        Returns:
            Message ID if sent successfully, None otherwise
        """
        if not self.is_ready:
            Logger.warn("[Bridge] Cannot send to JS: not ready yet")
            return None
        
        message = {
            "id": str(uuid.uuid4()),
            "msg": msg_name,
            "content": content or {},
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            js_code = f"window.bridgePy.receiveFromPython({json.dumps(message)})"
            self.window.evaluate_js(js_code)
            Logger.debug(f"[Bridge] Sent to JS: {msg_name}")
            return message["id"]
        except Exception as e:
            Logger.error(f"[Bridge] Failed to send to JS: {e}")
            return None
    
    # ═══════════════════════════════════════════════════════════
    # DEFAULT HANDLERS
    # ═══════════════════════════════════════════════════════════
    
    def _handle_handshake(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle the initial handshake from JavaScript.
        
        This is called when the UI is ready and indicates
        that bidirectional communication is established.
        """
        was_refresh = self.is_ready  # If already ready, this is a page refresh
        self.is_ready = True
        
        if was_refresh:
            Logger.info("[Bridge] Handshake (REFRESH) - JS reloaded")
        else:
            Logger.info("[Bridge] Handshake complete - JS ready")
            
            # Call the ready callback (shows window, etc.)
            if self.on_ready_callback:
                try:
                    self.on_ready_callback()
                except Exception as e:
                    Logger.error(f"[Bridge] Error in ready callback: {e}")
        
        # Include Light UI Mode config for JS to apply optimizations
        try:
            from core.config import LIGHT_UI_MODE, LIGHT_UI_ZOOM
        except ImportError:
            LIGHT_UI_MODE = False
            LIGHT_UI_ZOOM = 1.0
        
        return {
            "status": "ready",
            "timestamp": datetime.now().isoformat(),
            "version": "2.0.0",
            "was_refresh": was_refresh,
            "handlers": self.get_registered_handlers(),
            "light_ui_mode": LIGHT_UI_MODE,
            "light_ui_zoom": LIGHT_UI_ZOOM
        }
    
    def _handle_ping(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Simple ping/pong for connection testing."""
        return {
            "pong": True,
            "timestamp": datetime.now().isoformat(),
            "echo": content.get("echo", None)
        }
    
    def _handle_get_app_info(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Return application information."""
        try:
            from core.config import APP_NAME, APP_VERSION, APP_AUTHOR
        except ImportError:
            APP_NAME = "AutoForms"
            APP_VERSION = "2.0.0"
            APP_AUTHOR = "@lewopxd"
        
        return {
            "name": APP_NAME,
            "version": APP_VERSION,
            "author": APP_AUTHOR,
            "handlers": self.get_registered_handlers()
        }
    
    def _handle_get_ui_settings(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Get UI settings from storage."""
        try:
            if self.storage:
                return self.storage.get_ui_settings()
            return {}
        except Exception as e:
            Logger.error(f"[Bridge] Error getting UI settings: {e}")
            return {}
    
    def _handle_save_ui_setting(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Save a UI setting to storage."""
        try:
            if not self.storage:
                return {"success": False, "error": "Storage not available"}
            
            key = content.get("key")
            value = content.get("value")
            
            if key is None:
                return {"success": False, "error": "Missing 'key' parameter"}
            
            success = self.storage.save_ui_setting(key, value)
            return {"success": success}
            
        except Exception as e:
            Logger.error(f"[Bridge] Error saving UI setting: {e}")
            return {"success": False, "error": str(e)}
