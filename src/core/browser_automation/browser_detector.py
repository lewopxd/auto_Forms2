"""
Browser Detector Module - Silent Detection
Detects installed Chromium-based browsers WITHOUT opening any windows.
Adapted for auto_Forms2 integration.

Configuration is loaded from browsers_config.json for easy customization.
"""
import os
import subprocess
import re
import json
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class BrowserInfo:
    """Information about a detected browser."""
    name: str
    display_name: str
    path: str
    version: Optional[str] = None
    is_valid: bool = False


def load_browser_config() -> Dict:
    """Load browser configuration from JSON file."""
    config_path = Path(__file__).parent / "browsers_config.json"
    
    if not config_path.exists():
        print(f"[BrowserDetector] WARNING: Config file not found: {config_path}")
        return {"browsers": {}}
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[BrowserDetector] ERROR loading config: {e}")
        return {"browsers": {}}


# Load configuration from JSON
_CONFIG = load_browser_config()

# Browser paths loaded from JSON
BROWSER_PATHS: Dict[str, Dict] = {}
BROWSER_USER_DATA_DIRS: Dict[str, str] = {}

# Parse config into the expected format
for browser_name, browser_data in _CONFIG.get("browsers", {}).items():
    BROWSER_PATHS[browser_name] = {
        "display_name": browser_data.get("display_name", browser_name),
        "paths": browser_data.get("paths", []),
    }
    if "user_data_dir" in browser_data:
        BROWSER_USER_DATA_DIRS[browser_name] = browser_data["user_data_dir"]


def get_browser_user_data_dir(browser_name: str) -> Optional[str]:
    """
    Get the user data directory for a browser.
    When Chrome/Brave/Edge is launched with this user-data-dir and a browser
    instance is already running with the same profile, it opens a new tab
    instead of a new window.
    """
    path = BROWSER_USER_DATA_DIRS.get(browser_name)
    if path:
        expanded = os.path.expandvars(path)
        if os.path.exists(expanded):
            return expanded
    return None


class BrowserDetector:
    """Detects installed browsers silently (no window opening)."""
    
    def __init__(self):
        self._cache: Dict[str, BrowserInfo] = {}
    
    def _find_browser_path(self, browser_name: str) -> Optional[str]:
        """Find the executable path for a browser."""
        if browser_name not in BROWSER_PATHS:
            return None
        
        for path in BROWSER_PATHS[browser_name]["paths"]:
            expanded = os.path.expandvars(path)
            if os.path.exists(expanded) and os.path.isfile(expanded):
                return expanded
        
        return None
    
    def _get_version_from_exe(self, path: str) -> Optional[str]:
        """Get version from executable file properties (Windows only, no window)."""
        try:
            # Use PowerShell to get file version without opening browser
            cmd = f'(Get-Item "{path}").VersionInfo.FileVersion'
            result = subprocess.run(
                ["powershell", "-Command", cmd],
                capture_output=True,
                text=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            version = result.stdout.strip()
            if version and re.match(r'\d+\.\d+', version):
                return version
        except Exception:
            pass
        return None
    
    def detect_browser(self, browser_name: str) -> Optional[BrowserInfo]:
        """Detect a specific browser silently."""
        if browser_name in self._cache:
            return self._cache[browser_name]
        
        if browser_name not in BROWSER_PATHS:
            return None
        
        config = BROWSER_PATHS[browser_name]
        path = self._find_browser_path(browser_name)
        
        if not path:
            return None
        
        # Get version silently from file properties
        # DISABLED for performance - version fetching via PowerShell is slow
        # version = self._get_version_from_exe(path)
        version = None
        
        info = BrowserInfo(
            name=browser_name,
            display_name=config["display_name"],
            path=path,
            version=version,
            is_valid=True
        )
        
        self._cache[browser_name] = info
        return info
    
    def detect_all_browsers(self) -> List[BrowserInfo]:
        """Detect all browsers silently."""
        browsers = []
        for browser_name in BROWSER_PATHS:
            info = self.detect_browser(browser_name)
            if info:
                browsers.append(info)
        return browsers
    
    def get_dropdown_choices(self) -> List[dict]:
        """Get choices for dropdown: [{name, display, path, version}]"""
        browsers = self.detect_all_browsers()
        choices = []
        for b in browsers:
            choices.append({
                "name": b.name,
                "display": f"{b.display_name}" + (f" ({b.version})" if b.version else ""),
                "path": b.path,
                "version": b.version
            })
        return choices
    
    def reload_config(self) -> None:
        """Reload configuration from JSON file and clear cache."""
        global _CONFIG, BROWSER_PATHS, BROWSER_USER_DATA_DIRS
        
        _CONFIG = load_browser_config()
        BROWSER_PATHS.clear()
        BROWSER_USER_DATA_DIRS.clear()
        
        for browser_name, browser_data in _CONFIG.get("browsers", {}).items():
            BROWSER_PATHS[browser_name] = {
                "display_name": browser_data.get("display_name", browser_name),
                "paths": browser_data.get("paths", []),
            }
            if "user_data_dir" in browser_data:
                BROWSER_USER_DATA_DIRS[browser_name] = browser_data["user_data_dir"]
        
        # Clear browser cache
        self._cache.clear()
        print("[BrowserDetector] Configuration reloaded")
