"""
Application Settings - Unified Configuration
All configurable parameters in one place
"""
import os
from pathlib import Path

# =============================================================================
# SERVER CONFIGURATION
# =============================================================================

SERVER = {
    "host": "127.0.0.1",
    "port": 8000,                    # Primary port
    "port_range": (8000, 8010),      # Try these if primary busy
}

# =============================================================================
# BROWSER CONFIGURATION
# =============================================================================

BROWSER = {
    # Preferred browser for UI: "brave", "chrome", "edge", "default"
    "preferred": "brave",
    
    # Browser executable paths (auto-detected if None)
    "brave_path": None,     # e.g., "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
    "chrome_path": None,    # e.g., "C:/Program Files/Google/Chrome/Application/chrome.exe"
    "edge_path": None,
    
    # Window settings for automation browser (undetected chrome)
    "headless": False,
    "window_width": (1200, 1400),
    "window_height": (800, 1000),
}

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

LOGGING = {
    # Log levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
    "console_level": "INFO",         # What shows in Python console
    "ui_level": "INFO",              # What's sent to UI (if connected)
    
    # Which modules to log (for filtering)
    "modules": {
        "server": True,
        "executor": True,
        "browser": True,
        "analyzer": True,
        "handlers": True,
    },
    
    # Queue logs for UI until subscriber connects
    "queue_for_ui": True,
    "max_queue_size": 100,
}

# =============================================================================
# TIMEOUTS (seconds)
# =============================================================================

TIMEOUTS = {
    # Page/element waits
    "page_load": 30,
    "element_wait": 10,
    "form_analysis": 15,
    "injection_delay": 0.5,
    
    # WebSocket communication
    "websocket_ack": 5,              # Seconds to wait for ACK
    "message_retry_delay": 1,        # Seconds between retries
    "max_retries": 3,
}

# =============================================================================
# PATHS
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent

PATHS = {
    "project_root": PROJECT_ROOT,
    "form_data": PROJECT_ROOT / "form_data",
    "web": PROJECT_ROOT / "web",
    "playground": PROJECT_ROOT / "sheetPlayground",
}

# =============================================================================
# DEBUG
# =============================================================================

DEBUG = os.environ.get("DEBUG", "false").lower() == "true"
