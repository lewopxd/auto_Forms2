"""
Browser Detector Module - Silent Detection
Detects installed Chromium-based browsers WITHOUT opening any windows.
Adapted for auto_Forms2 integration.
"""
import os
import subprocess
import re
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


# Browser search paths for Windows
BROWSER_PATHS: Dict[str, Dict] = {
    "brave": {
        "display_name": "Brave",
        "paths": [
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
        ],
    },
    "chrome": {
        "display_name": "Google Chrome",
        "paths": [
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
            r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
            r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
        ],
    },
    "edge": {
        "display_name": "Microsoft Edge",
        "paths": [
            r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe",
            r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe",
            r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
        ],
    },
}


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
        version = self._get_version_from_exe(path)
        
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
