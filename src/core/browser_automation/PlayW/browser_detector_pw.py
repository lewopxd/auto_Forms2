"""
Browser Detector for Playwright.

Uses the common browser_detector.py to find installed browsers,
then filters by compatibility using compatibility.json.

Strategy:
1. Get all installed browsers from browser_detector.py
2. Load compatibility.json
3. Filter by exact key matching: browser.name in compatibility["channels"]
4. Check if Playwright Chromium binary is installed
5. Return filtered list
"""
import os
import json
import subprocess
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass

# Import common detector
from ..browser_detector import BrowserDetector


@dataclass
class PlaywrightBrowserInfo:
    """Browser information for Playwright."""
    name: str
    display_name: str
    pw_channel: Optional[str]  # None for builtin (chromium)
    pw_browser_type: str  # "chromium", "firefox", "webkit"
    path: Optional[str] = None
    version: Optional[str] = None
    is_builtin: bool = False
    priority: int = 100


def load_compatibility() -> Dict:
    """Load compatibility.json from same directory."""
    config_path = Path(__file__).parent / "compatibility.json"
    
    if not config_path.exists():
        print(f"[PlaywrightDetector] ERROR: compatibility.json not found at {config_path}")
        return {"builtin": {}, "channels": {}}
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[PlaywrightDetector] ERROR loading compatibility.json: {e}")
        return {"builtin": {}, "channels": {}}


def check_playwright_chromium_installed() -> bool:
    """
    Check if Playwright Chromium binary is installed.
    Instead of running playwright CLI (which timeouts), check for binary files directly.
    """
    try:
        # Playwright installs browsers in user's local cache
        # Windows: %LOCALAPPDATA%\ms-playwright
        
        localappdata = os.environ.get('LOCALAPPDATA', '')
        if not localappdata:
            print("[PlaywrightDetector] LOCALAPPDATA not found")
            return False
        
        playwright_dir = Path(localappdata) / "ms-playwright"
        if not playwright_dir.exists():
            print(f"[PlaywrightDetector] Playwright directory not found: {playwright_dir}")
            return False
        
        # Look for chromium-* directories (e.g., chromium-1234)
        chromium_dirs = list(playwright_dir.glob("chromium-*"))
        if not chromium_dirs:
            print(f"[PlaywrightDetector] No chromium directories found in {playwright_dir}")
            return False
        
        # Check if at least one has chrome.exe anywhere inside
        for chromium_dir in chromium_dirs:
            # Try multiple possible locations
            possible_locations = [
                chromium_dir / "chrome-win" / "chrome.exe",
                chromium_dir / "chrome.exe",
            ]
            
            # Also search recursively for chrome.exe
            chrome_files = list(chromium_dir.rglob("chrome.exe"))
            
            if chrome_files:
                print(f"[PlaywrightDetector] ✓ Found Chromium binary: {chrome_files[0]}")
                return True
            
            for location in possible_locations:
                if location.exists():
                    print(f"[PlaywrightDetector] ✓ Found Chromium binary: {location}")
                    return True
        
        print(f"[PlaywrightDetector] Chromium directories exist but no chrome.exe found")
        return False
        
    except Exception as e:
        print(f"[PlaywrightDetector] Error checking Chromium: {e}")
        import traceback
        traceback.print_exc()
        return False


class BrowserDetectorPW:
    """Detects Playwright-compatible browsers."""
    
    def __init__(self):
        self.common_detector = BrowserDetector()
        self.compatibility = load_compatibility()
    
    def detect_compatible_browsers(self) -> List[PlaywrightBrowserInfo]:
        """
        Detect all Playwright-compatible browsers.
        
        Returns:
            List of PlaywrightBrowserInfo sorted by priority
        """
        compatible = []
        
        # 1. Get all installed browsers from common detector
        print("[PlaywrightDetector] === Starting browser detection ===")
        installed = self.common_detector.detect_all_browsers()
        print(f"[PlaywrightDetector] Found {len(installed)} installed browsers from common detector:")
        for b in installed:
            print(f"  - {b.name}: {b.display_name} at {b.path}")
        
        # 2. Filter by compatibility
        channels = self.compatibility.get("channels", {})
        print(f"[PlaywrightDetector] Compatibility channels defined: {list(channels.keys())}")
        
        for browser in installed:
            # Exact key matching
            if browser.name in channels:
                channel_config = channels[browser.name]
                
                pw_browser = PlaywrightBrowserInfo(
                    name=browser.name,
                    display_name=browser.display_name,
                    pw_channel=channel_config.get("pw_channel"),
                    pw_browser_type=channel_config.get("pw_browser_type", "chromium"),
                    path=browser.path,
                    version=browser.version,
                    is_builtin=False,
                    priority=channel_config.get("priority", 100)
                )
                compatible.append(pw_browser)
                print(f"[PlaywrightDetector] ✓ COMPATIBLE: {browser.name} → channel={pw_browser.pw_channel}")
            else:
                print(f"[PlaywrightDetector] ✗ NOT COMPATIBLE: {browser.name} (not in channels)")
        
        # 3. Check for Playwright Chromium builtin
        builtin_chromium = self.compatibility.get("builtin", {}).get("chromium")
        if builtin_chromium:
            print("[PlaywrightDetector] Checking for Playwright Chromium binary...")
            if check_playwright_chromium_installed():
                chromium = PlaywrightBrowserInfo(
                    name="chromium",
                    display_name=builtin_chromium["display_name"],
                    pw_channel=None,  # Uses builtin binary
                    pw_browser_type="chromium",
                    path=None,
                    version=None,
                    is_builtin=True,
                    priority=builtin_chromium.get("priority", 1)
                )
                compatible.append(chromium)
                print("[PlaywrightDetector] ✓ Playwright Chromium binary available")
            else:
                print("[PlaywrightDetector] ✗ Playwright Chromium binary NOT installed")
        
        # 4. Sort by priority (lower = higher priority)
        compatible.sort(key=lambda x: x.priority)
        
        print(f"[PlaywrightDetector] === Detection complete: {len(compatible)} compatible browsers ===")
        return compatible
    
    def get_dropdown_choices(self) -> List[Dict]:
        """
        Get choices for dropdown in same format as Selenium detector.
        
        Returns:
            [{name, display, pw_channel, path, version, is_builtin}, ...]
        """
        browsers = self.detect_compatible_browsers()
        choices = []
        
        for b in browsers:
            choice = {
                "name": b.name,
                "display": f"{b.display_name}" + (f" ({b.version})" if b.version else ""),
                "pw_channel": b.pw_channel,
                "pw_browser_type": b.pw_browser_type,
                "path": b.path,
                "version": b.version,
                "is_builtin": b.is_builtin
            }
            choices.append(choice)
        
        return choices


# Testing
if __name__ == "__main__":
    detector = BrowserDetectorPW()
    browsers = detector.get_dropdown_choices()
    
    print(f"Found {len(browsers)} Playwright-compatible browsers:")
    for b in browsers:
        print(f"  - {b['display']} (channel: {b['pw_channel']}, builtin: {b['is_builtin']})")
