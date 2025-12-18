#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: storage.py
Created: 2025-12-16
Author: @lewopxd

Description:
Application data persistence system.
Manages reading, writing, and persisting configuration
and application state in JSON format.
============================================
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import os

# Import Logger
try:
    from .logger import Logger
except ImportError:
    # Fallback Logger if import fails
    class Logger:
        @staticmethod
        def debug(msg): print(f"DEBUG: {msg}")
        @staticmethod
        def info(msg): print(f"INFO: {msg}")
        @staticmethod
        def warn(msg): print(f"WARN: {msg}")
        @staticmethod
        def error(msg): print(f"ERROR: {msg}")


class AppStorage:
    """
    Manages persistent storage for AutoForms.
    Handles app configuration and state between sessions.
    """

    # --- CLASS VARIABLE: Static defaults for fallbacks ---
    DEFAULTS = {
        "providerData": {
            "window": {
                "width": 1200,
                "height": 800,
                "x": None,  # None = centered
                "y": None,
                "maximized": False
            },
            "app": {
                "last_closed_properly": False,
                "last_close_timestamp": None,
                "launch_count": 0,
                "version": "2.0.0"
            }
        },
        "uiData": {
            "theme": "dark",
            "language": "es"
        }
    }

    # ═══════════════════════════════════════════════════════════
    # INITIALIZATION
    # ═══════════════════════════════════════════════════════════
    
    def __init__(self, app_name: str = "AutoForms"):
        """
        Initializes the storage system.
        
        Args:
            app_name: Name of the application (used for filenames)
        """
        self.app_name = app_name
        self.storage_dir = self._get_storage_directory()
        self.config_file = self.storage_dir / f"{app_name.lower()}_config.json"
        
        # Create directory if it doesn't exist
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Use a copy of the static defaults for this instance
        self.defaults = self.DEFAULTS.copy()
        
        Logger.info(f"[Storage] Config path: {self.config_file}")

    # ═══════════════════════════════════════════════════════════
    # CORE I/O METHODS
    # ═══════════════════════════════════════════════════════════
    
    def _get_storage_directory(self) -> Path:
        """
        Gets the appropriate OS-specific directory for app data.
        
        Returns:
            Path to the storage directory
        """
        if os.name == 'nt':  # Windows
            base = Path(os.getenv('APPDATA', Path.home() / 'AppData' / 'Roaming'))
        elif os.name == 'posix':
            if hasattr(os, 'uname') and os.uname().sysname == 'Darwin':  # macOS
                base = Path.home() / 'Library' / 'Application Support'
            else:  # Linux
                base = Path(os.getenv('XDG_CONFIG_HOME', Path.home() / '.config'))
        else:
            base = Path.home()
        
        return base / self.app_name
    
    def load(self) -> Dict[str, Any]:
        """
        Loads the configuration from the JSON file.
        If it doesn't exist or is corrupt, it recreates it.
        
        Returns:
            Dictionary with the loaded configuration
        """
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Merge with defaults to ensure all keys exist
                merged = self._deep_merge(self.defaults.copy(), data)
                
                Logger.debug(f"[Storage] Config loaded from: {self.config_file.name}")
                return merged
            else:
                Logger.debug("[Storage] No previous config found, creating default...")
                # If it doesn't exist, create it with defaults
                self.save(self.DEFAULTS.copy()) 
                return self.DEFAULTS.copy()
                
        except json.JSONDecodeError as e:
            Logger.error(f"[Storage] Corrupt config detected: {e}")
            Logger.warn("[Storage] Deleting corrupt file and restoring defaults")
            try:
                self.config_file.unlink()
            except OSError as unlink_e:
                Logger.warn(f"[Storage] Could not delete corrupt file: {unlink_e}")
            
            self.save(self.DEFAULTS.copy()) 
            return self.DEFAULTS.copy()
            
        except Exception as e:
            Logger.error(f"[Storage] Unexpected error loading config: {e}")
            return self.DEFAULTS.copy()
    
    def save(self, data: Dict[str, Any]) -> bool:
        """
        Saves the configuration to the JSON file.
        
        Args:
            data: Dictionary with the data to save
            
        Returns:
            True if saved successfully, False otherwise
        """
        try:
            clean_data = data.copy()
            if '_metadata' in clean_data:
                del clean_data['_metadata']
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(clean_data, f, indent=2, ensure_ascii=False)
            
            Logger.debug(f"[Storage] Config saved to: {self.config_file.name}")
            return True
            
        except Exception as e:
            Logger.error(f"[Storage] Error saving config: {e}")
            return False

    # ═══════════════════════════════════════════════════════════
    # WINDOW STATE METHODS
    # ═══════════════════════════════════════════════════════════
    
    def get_window_state(self) -> Dict[str, Any]:
        """Gets the saved window state."""
        data = self.load()
        default_window = self.defaults.get('providerData', {}).get('window', {})
        current_state = default_window.copy()
        current_state.update(data.get('providerData', {}).get('window', {}))
        return current_state
    
    def save_window_state(self, width: int, height: int, x: int, y: int, maximized: bool = False) -> bool:
        """Saves the window's state."""
        data = self.load()
        if 'providerData' not in data:
            data['providerData'] = self.defaults['providerData'].copy()
        
        data['providerData']['window'] = {
            'width': width,
            'height': height,
            'x': x,
            'y': y,
            'maximized': maximized
        }
        return self.save(data)

    # ═══════════════════════════════════════════════════════════
    # SESSION MANAGEMENT METHODS
    # ═══════════════════════════════════════════════════════════
    
    def mark_proper_close(self) -> bool:
        """Marks that the application closed properly."""
        data = self.load()
        if 'providerData' not in data:
            data['providerData'] = self.defaults['providerData'].copy()
        if 'app' not in data['providerData']:
            data['providerData']['app'] = self.defaults['providerData']['app'].copy()
        
        data['providerData']['app']['last_closed_properly'] = True
        data['providerData']['app']['last_close_timestamp'] = datetime.now().isoformat()
        return self.save(data)
    
    def mark_improper_close(self) -> bool:
        """Marks that the application did NOT close properly (on launch)."""
        data = self.load()
        if 'providerData' not in data:
            data['providerData'] = self.defaults['providerData'].copy()
        if 'app' not in data['providerData']:
            data['providerData']['app'] = self.defaults['providerData']['app'].copy()

        data['providerData']['app']['last_closed_properly'] = False
        data['providerData']['app']['launch_count'] = data.get('providerData', {}).get('app', {}).get('launch_count', 0) + 1
        return self.save(data)
    
    def was_closed_properly(self) -> bool:
        """Checks if the last session closed properly."""
        data = self.load()
        return data.get('providerData', {}).get('app', {}).get('last_closed_properly', False)
    
    def finalize_session_save(self, window_state: Dict[str, Any]) -> bool:
        """
        Saves window state and marks proper close in a single operation.
        
        Args:
            window_state: Dict with width, height, x, y, maximized
            
        Returns:
            True if saved successfully
        """
        try:
            data = self.load()
            
            # Update window state
            if 'providerData' not in data:
                data['providerData'] = self.defaults['providerData'].copy()
            data['providerData']['window'] = window_state
            
            # Update app state (proper close)
            if 'app' not in data['providerData']:
                data['providerData']['app'] = self.defaults['providerData']['app'].copy()
            data['providerData']['app']['last_closed_properly'] = True
            data['providerData']['app']['last_close_timestamp'] = datetime.now().isoformat()
            
            Logger.info("[Storage] Saving final session state...")
            return self.save(data)
            
        except Exception as e:
            Logger.error(f"[Storage] Error saving final session: {e}")
            return False

    # ═══════════════════════════════════════════════════════════
    # UI SETTINGS METHODS
    # ═══════════════════════════════════════════════════════════
    
    def get_ui_settings(self) -> Dict[str, Any]:
        """Gets only the 'uiData' dictionary from the configuration."""
        try:
            data = self.load()
            return data.get("uiData", self.defaults.get("uiData", {}))
        except Exception as e:
            Logger.error(f"[Storage] Error getting uiData: {e}")
            return self.defaults.get("uiData", {})

    def save_ui_setting(self, key: str, value: Any) -> bool:
        """Saves a single key inside the 'uiData' dictionary."""
        try:
            data = self.load()
            
            if "uiData" not in data:
                data["uiData"] = self.defaults.get("uiData", {})
            
            data["uiData"][key] = value
            return self.save(data)
            
        except Exception as e:
            Logger.error(f"[Storage] Error saving uiData setting: {e}")
            return False

    # ═══════════════════════════════════════════════════════════
    # UTILITY METHODS
    # ═══════════════════════════════════════════════════════════
    
    def _deep_merge(self, base: Dict, update: Dict) -> Dict:
        """Deep merges two dictionaries."""
        for key, value in update.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                base[key] = self._deep_merge(base[key], value)
            else:
                base[key] = value
        return base
    
    def get_storage_path(self) -> str:
        """Returns the full path to the config file."""
        return str(self.config_file)
    
    def reset_to_defaults(self) -> bool:
        """Resets the configuration to defaults."""
        Logger.warn("[Storage] Resetting config to defaults")
        return self.save(self.DEFAULTS.copy())
