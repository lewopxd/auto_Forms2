"""
Chrome Profile Utilities - Profile detection and validation.

Functions for:
- Detecting Chrome profile directory path
- Listing available profiles
- Checking if a profile is in use
"""
import os
import json
import subprocess
from typing import List, Dict, Optional


def get_chrome_profiles_path() -> Optional[str]:
    """
    Get the Chrome user data directory path.
    
    Returns:
        Path to Chrome's User Data directory, or None if not found
    """
    # Windows path (most common)
    local_app_data = os.environ.get('LOCALAPPDATA', '')
    chrome_path = os.path.join(local_app_data, 'Google', 'Chrome', 'User Data')
    
    if os.path.exists(chrome_path):
        return chrome_path
    
    # Alternative: Check Program Files for portable installations
    return None


def list_chrome_profiles(profiles_path: str = None) -> List[Dict[str, str]]:
    """
    List available Chrome profiles.
    
    Args:
        profiles_path: Path to Chrome User Data directory (auto-detect if None)
        
    Returns:
        List of profile dicts with 'name', 'display_name', and 'path'
    """
    if not profiles_path:
        profiles_path = get_chrome_profiles_path()
    
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
    
    return profiles


def is_profile_in_use(profiles_path: str, profile_name: str) -> bool:
    """
    Check if a Chrome profile is currently in use.
    
    This checks if Chrome is running with this profile by looking for
    lock files in the profile directory.
    
    Args:
        profiles_path: Path to Chrome User Data directory
        profile_name: Name of the profile (e.g., 'Default', 'Profile 1')
        
    Returns:
        True if profile is in use, False otherwise
    """
    if not profiles_path or not profile_name:
        return False
    
    profile_dir = os.path.join(profiles_path, profile_name)
    
    if not os.path.exists(profile_dir):
        return False
    
    # Method 1: Check for SingletonLock in User Data directory
    # This is the main lock file Chrome creates
    singleton_lock = os.path.join(profiles_path, 'SingletonLock')
    if os.path.exists(singleton_lock):
        # Lock file exists - Chrome might be running
        # But we need to verify it's actually locked (not stale)
        try:
            # Try to check if there's a Chrome process running
            result = subprocess.run(
                ['tasklist', '/FI', 'IMAGENAME eq chrome.exe', '/NH'],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            if 'chrome.exe' in result.stdout.lower():
                return True
        except Exception:
            pass
    
    # Method 2: Check for lockfile in profile directory
    lock_file = os.path.join(profile_dir, 'lockfile')
    if os.path.exists(lock_file):
        try:
            # Try to check if Chrome is running
            result = subprocess.run(
                ['tasklist', '/FI', 'IMAGENAME eq chrome.exe', '/NH'],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            if 'chrome.exe' in result.stdout.lower():
                return True
        except Exception:
            pass
    
    return False


def get_profile_info(profiles_path: str = None) -> Dict:
    """
    Get complete profile information for the UI.
    
    Returns:
        Dict with 'path', 'profiles', and 'available' flag
    """
    path = profiles_path or get_chrome_profiles_path()
    
    if not path:
        return {
            'available': False,
            'path': None,
            'profiles': [],
            'error': 'Chrome profiles directory not found'
        }
    
    profiles = list_chrome_profiles(path)
    
    return {
        'available': True,
        'path': path,
        'profiles': profiles
    }
