"""
Browser Settings - Centralized Configuration Module.

Defines browser profiles, anti-detection flags, and Chrome options builder.
This is the SINGLE SOURCE OF TRUTH for all browser configuration.

Usage:
    from browser_settings import BrowserConfig, build_chrome_options
    
    config = BrowserConfig(efficiency_profile="efficiency")
    options = build_chrome_options(config)
"""
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
import random

try:
    import undetected_chromedriver as uc
except ImportError:
    uc = None


# =============================================================================
# BROWSER CONFIGURATION DATACLASS
# =============================================================================

@dataclass
class BrowserConfig:
    """
    Complete browser configuration - Serializable and UI-editable.
    
    All fields have sensible defaults. The UI can override any field.
    This dataclass can be serialized to JSON for persistence.
    """
    
    # --- Efficiency Profile ---
    # Base preset: normal | balanced | efficiency | extreme
    efficiency_profile: str = "efficiency"
    
    # --- Resource Flags (Override profile settings) ---
    gpu_enabled: bool = True           # Enable GPU acceleration
    images_enabled: bool = True        # Load images
    animations_enabled: bool = True    # Enable CSS animations
    extensions_enabled: bool = False   # Load browser extensions
    
    # --- Cold Start & Performance ---
    cold_start_optimization: bool = True  # Skip first-run dialogs, reduce startup time
    page_load_timeout: int = 30           # Seconds to wait for page load
    element_wait_timeout: int = 10        # Seconds to wait for element presence
    implicit_wait: int = 5                # Implicit wait for element searches
    
    # --- Session & Appearance ---
    headless: bool = False             # Run without visible window
    incognito: bool = False            # Use incognito/private mode
    window_width_min: int = 1200       # Random window width range (min)
    window_width_max: int = 1400       # Random window width range (max)
    window_height_min: int = 800       # Random window height range (min)
    window_height_max: int = 1000      # Random window height range (max)
    
    # --- Anti-Detection (Enabled by default) ---
    anti_detection_enabled: bool = True       # Base anti-automation flags
    mock_webdriver: bool = True               # Hide navigator.webdriver property
    randomize_window_size: bool = True        # Avoid fingerprinting by exact size
    exclude_automation_switches: bool = True  # Exclude flags that reveal automation
    disable_webrtc_leak: bool = True          # Prevent IP leak via WebRTC
    spoof_plugins: bool = True                # Spoof plugin/navigator data
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary for JSON serialization."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'BrowserConfig':
        """Create config from dictionary (e.g., from JSON)."""
        # Filter only valid fields to avoid errors from unknown keys
        valid_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in valid_fields}
        return cls(**filtered)


# =============================================================================
# EFFICIENCY PROFILES
# =============================================================================

EFFICIENCY_PROFILES: Dict[str, Dict[str, Any]] = {
    "normal": {
        "description": "No optimizations - Maximum compatibility",
        "description_detail": "Loads everything: images, animations, extensions.",
        "args": [],
        "prefs": {},
    },
    "balanced": {
        "description": "Moderate optimization",
        "description_detail": "Disables sync, translation, background networking.",
        "args": [
            "--disable-sync",
            "--disable-translate",
            "--disable-background-networking",
            "--disable-dev-shm-usage",
        ],
        "prefs": {
            "profile.default_content_setting_values.notifications": 2,
        },
    },
    "efficiency": {  # RECOMMENDED DEFAULT
        "description": "Maximum efficiency without sacrificing visual validation",
        "description_detail": "Disables logging, crash reports, background processes. Keeps images.",
        "args": [
            "--disable-dev-shm-usage",
            "--disable-crash-reporter",
            "--disable-logging",
            "--log-level=3",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--disable-default-apps",
            "--disable-hang-monitor",
            "--disable-prompt-on-repost",
            "--metrics-recording-only",
            "--mute-audio",
            "--disable-extensions",
            "--disable-component-update",
        ],
        "prefs": {
            "profile.default_content_setting_values.notifications": 2,
        },
    },
    "extreme": {
        "description": "Maximum efficiency - No images or animations",
        "description_detail": "Everything disabled. No GPU, no images, no remote fonts.",
        "args": [
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-dev-shm-usage",
            "--disable-crash-reporter",
            "--disable-logging",
            "--log-level=3",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--disable-default-apps",
            "--disable-hang-monitor",
            "--disable-prompt-on-repost",
            "--metrics-recording-only",
            "--mute-audio",
            "--disable-smooth-scrolling",
            "--disable-animations",
            "--animation-duration-scale=0",
            "--blink-settings=imagesEnabled=false",
            "--disable-remote-fonts",
            "--disable-extensions",
        ],
        "prefs": {
            "profile.managed_default_content_settings.images": 2,
            "profile.default_content_setting_values.notifications": 2,
        },
    },
}


# =============================================================================
# CHROME ARGUMENTS MAPPING
# =============================================================================

CHROME_ARGS_MAPPING: Dict[str, List[str]] = {
    # GPU control
    "gpu_disabled": [
        "--disable-gpu",
        "--disable-gpu-compositing",
    ],
    
    # Resource control
    "images_disabled": [
        "--blink-settings=imagesEnabled=false",
    ],
    "animations_disabled": [
        "--disable-animations",
        "--animation-duration-scale=0",
    ],
    
    # Cold start optimization
    "cold_start": [
        "--no-first-run",
        "--no-default-browser-check",
        "--password-store=basic",
        "--no-service-autorun",
        "--disable-default-apps",
        "--disable-popup-blocking",
        "--disable-client-side-phishing-detection",
        "--safebrowsing-disable-auto-update",
    ],
    
    # Anti-detection
    "anti_detection_base": [
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
    ],
    "webrtc_leak": [
        "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
}


# =============================================================================
# CHROME OPTIONS BUILDER
# =============================================================================

def build_chrome_options(config: BrowserConfig, browser_path: str = None) -> 'uc.ChromeOptions':
    """
    Build ChromeOptions from BrowserConfig.
    
    Args:
        config: BrowserConfig instance with all settings
        browser_path: Optional path to browser executable
        
    Returns:
        Configured uc.ChromeOptions ready for browser launch
    """
    if uc is None:
        raise ImportError("undetected-chromedriver is not installed")
    
    options = uc.ChromeOptions()
    
    # Set browser binary if provided
    if browser_path:
        options.binary_location = browser_path
    
    # Track added args to avoid duplicates
    added_args = set()
    
    def add_arg(arg: str):
        """Add argument if not already present."""
        if arg not in added_args:
            options.add_argument(arg)
            added_args.add(arg)
    
    # --- 1. Load base profile arguments ---
    profile_data = EFFICIENCY_PROFILES.get(
        config.efficiency_profile, 
        EFFICIENCY_PROFILES["efficiency"]
    )
    for arg in profile_data.get("args", []):
        add_arg(arg)
    
    # --- 2. Apply individual flag overrides (override profile) ---
    if not config.gpu_enabled:
        for arg in CHROME_ARGS_MAPPING["gpu_disabled"]:
            add_arg(arg)
    
    if not config.images_enabled:
        for arg in CHROME_ARGS_MAPPING["images_disabled"]:
            add_arg(arg)
    
    if not config.animations_enabled:
        for arg in CHROME_ARGS_MAPPING["animations_disabled"]:
            add_arg(arg)
    
    # --- 3. Cold start optimization ---
    if config.cold_start_optimization:
        for arg in CHROME_ARGS_MAPPING["cold_start"]:
            add_arg(arg)
    
    # --- 4. Anti-detection ---
    if config.anti_detection_enabled:
        for arg in CHROME_ARGS_MAPPING["anti_detection_base"]:
            add_arg(arg)
        
        if config.disable_webrtc_leak:
            for arg in CHROME_ARGS_MAPPING["webrtc_leak"]:
                add_arg(arg)
    
    # --- 5. Session modes ---
    if config.incognito:
        add_arg("--incognito")
    
    # --- 6. Window size (randomized for anti-fingerprinting) ---
    if config.randomize_window_size:
        width = random.randint(config.window_width_min, config.window_width_max)
        height = random.randint(config.window_height_min, config.window_height_max)
        add_arg(f"--window-size={width},{height}")
    
    # --- 7. Apply preferences ---
    prefs = profile_data.get("prefs", {})
    if prefs:
        options.add_experimental_option("prefs", prefs)
    
    return options


def get_available_profiles() -> Dict[str, Dict[str, str]]:
    """
    Get list of available efficiency profiles for UI display.
    
    Returns:
        Dict with profile names and their descriptions
    """
    return {
        name: {
            "description": data["description"],
            "description_detail": data["description_detail"],
        }
        for name, data in EFFICIENCY_PROFILES.items()
    }
