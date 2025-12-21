"""
Browser Profile Utilities - Profile detection and validation.

Functions for:
- Detecting profile directory paths for various Chromium-based browsers
- Listing available profiles
- Checking if a profile is in use
"""
import os
import json
import subprocess
from typing import List, Dict, Optional


# Browser-specific profile paths (Windows)
BROWSER_PROFILE_PATHS = {
    'chrome': os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'User Data'),
    'ungoogled_chromium': [
        # Common portable/installed paths
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Chromium', 'User Data'),
        os.path.join(os.environ.get('APPDATA', ''), 'Chromium', 'User Data'),
    ],
    'edge': os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Edge', 'User Data'),
    'brave': os.path.join(os.environ.get('LOCALAPPDATA', ''), 'BraveSoftware', 'Brave-Browser', 'User Data'),
    'opera': os.path.join(os.environ.get('APPDATA', ''), 'Opera Software', 'Opera Stable'),
    'vivaldi': os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Vivaldi', 'User Data'),
}

# Process names for each browser
BROWSER_PROCESS_NAMES = {
    'chrome': 'chrome.exe',
    'ungoogled_chromium': 'chrome.exe',  # Ungoogled uses chrome.exe
    'edge': 'msedge.exe',
    'brave': 'brave.exe',
    'opera': 'opera.exe',
    'vivaldi': 'vivaldi.exe',
}


def get_browser_profiles_path(browser_type: str = 'chrome', browser_path: str = None) -> Optional[str]:
    """
    Get the profile directory path for a specific browser.
    
    Args:
        browser_type: Type of browser (chrome, ungoogled_chromium, edge, brave, etc.)
        browser_path: Optional path to browser executable (for portable installations)
        
    Returns:
        Path to browser's User Data directory, or None if not found
    """
    # Normalize browser type
    browser_key = browser_type.lower().replace(' ', '_').replace('-', '_')
    
    # For ungoogled_chromium with custom path, try to find User Data relative to exe
    if browser_path and 'chromium' in browser_path.lower():
        # Try portable installation path (next to executable)
        exe_dir = os.path.dirname(browser_path)
        portable_path = os.path.join(exe_dir, 'User Data')
        if os.path.exists(portable_path):
            return portable_path
        
        # Try parent directory
        parent_dir = os.path.dirname(exe_dir)
        portable_path = os.path.join(parent_dir, 'User Data')
        if os.path.exists(portable_path):
            return portable_path
    
    # Get paths for this browser type
    paths = BROWSER_PROFILE_PATHS.get(browser_key)
    
    if paths is None:
        # Default to Chrome
        paths = BROWSER_PROFILE_PATHS['chrome']
    
    # If it's a list, find first existing path
    if isinstance(paths, list):
        for path in paths:
            if os.path.exists(path):
                return path
        return None
    else:
        # Single path
        if os.path.exists(paths):
            return paths
        return None


def list_browser_profiles(browser_type: str = 'chrome', browser_path: str = None) -> List[Dict[str, str]]:
    """
    List available profiles for a specific browser.
    
    Args:
        browser_type: Type of browser
        browser_path: Optional path to browser executable
        
    Returns:
        List of profile dicts with 'name', 'display_name', and 'path'
    """
    profiles_path = get_browser_profiles_path(browser_type, browser_path)
    
    if not profiles_path or not os.path.exists(profiles_path):
        return []
    
    profiles = []
    
    # Read Local State file for profile info
    local_state_path = os.path.join(profiles_path, 'Local State')
    profile_info = {}
    
    if os.path.exists(local_state_path):
        try:
            with open(local_state_path, 'r', encoding='utf-8') as f:
                local_state = json.load(f)
                profile_info = local_state.get('profile', {}).get('info_cache', {})
        except (json.JSONDecodeError, IOError) as e:
            print(f"[ProfileUtils] Error reading Local State: {e}")
    
    # Check for Default profile
    default_path = os.path.join(profiles_path, 'Default')
    if os.path.isdir(default_path):
        display_name = "Default"
        if 'Default' in profile_info:
            display_name = profile_info['Default'].get('name', 'Default')
        profiles.append({
            'name': 'Default',
            'display_name': display_name,
            'path': default_path
        })
    
    # Check for numbered profiles (Profile 1, Profile 2, etc.)
    try:
        for item in os.listdir(profiles_path):
            if item.startswith('Profile ') and os.path.isdir(os.path.join(profiles_path, item)):
                item_path = os.path.join(profiles_path, item)
                display_name = item
                if item in profile_info:
                    display_name = profile_info[item].get('name', item)
                profiles.append({
                    'name': item,
                    'display_name': display_name,
                    'path': item_path
                })
    except Exception as e:
        print(f"[ProfileUtils] Error listing profiles: {e}")
    
    return profiles


def is_profile_in_use(profiles_path: str, profile_name: str, browser_type: str = 'chrome') -> bool:
    """
    Check if a browser profile is currently in use.
    
    Uses multiple methods:
    1. Try to open SingletonLock file exclusively (most reliable)
    2. Check for running browser processes
    
    Args:
        profiles_path: Path to browser User Data directory
        profile_name: Name of the profile (e.g., 'Default', 'Profile 1')
        browser_type: Type of browser for process name lookup
        
    Returns:
        True if profile is in use, False otherwise
    """
    if not profiles_path or not profile_name:
        return False
    
    # Method 1: Try to get exclusive access to SingletonLock
    # This is the most reliable method
    singleton_lock = os.path.join(profiles_path, 'SingletonLock')
    if os.path.exists(singleton_lock):
        try:
            # Try to open the file for writing exclusively
            # If browser is running, this will fail
            with open(singleton_lock, 'r+b') as f:
                import msvcrt
                try:
                    msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                    msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
                    # Successfully locked = browser NOT running
                except (IOError, OSError):
                    # Failed to lock = browser IS running
                    return True
        except (PermissionError, IOError):
            # Can't even open the file = browser is likely running
            return True
        except Exception:
            pass
    
    # Method 2: Check for browser process running
    browser_key = browser_type.lower().replace(' ', '_').replace('-', '_')
    process_name = BROWSER_PROCESS_NAMES.get(browser_key, 'chrome.exe')
    
    try:
        result = subprocess.run(
            ['tasklist', '/FI', f'IMAGENAME eq {process_name}', '/NH'],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        if process_name.lower() in result.stdout.lower():
            # Browser process is running
            # But we can't be 100% sure it's using THIS profile
            # So we also check for lockfile in the specific profile
            profile_dir = os.path.join(profiles_path, profile_name)
            lock_file = os.path.join(profile_dir, 'lockfile')
            if os.path.exists(lock_file):
                return True
    except Exception:
        pass
    
    return False


def get_profile_info(browser_type: str = 'chrome', browser_path: str = None) -> Dict:
    """
    Get complete profile information for the UI.
    
    Args:
        browser_type: Type of browser
        browser_path: Optional path to browser executable
        
    Returns:
        Dict with 'path', 'profiles', 'available' flag, and 'browser_type'
    """
    path = get_browser_profiles_path(browser_type, browser_path)
    
    if not path:
        return {
            'available': False,
            'path': None,
            'profiles': [],
            'browser_type': browser_type,
            'error': f'Profile directory not found for {browser_type}'
        }
    
    profiles = list_browser_profiles(browser_type, browser_path)
    
    return {
        'available': True,
        'path': path,
        'profiles': profiles,
        'browser_type': browser_type
    }


# Keep backwards compatibility
def get_chrome_profiles_path() -> Optional[str]:
    """Backwards compatibility wrapper."""
    return get_browser_profiles_path('chrome')


def list_chrome_profiles(profiles_path: str = None) -> List[Dict[str, str]]:
    """Backwards compatibility wrapper."""
    if profiles_path:
        # Use provided path directly
        return list_browser_profiles.__wrapped__(profiles_path) if hasattr(list_browser_profiles, '__wrapped__') else []
    return list_browser_profiles('chrome')
