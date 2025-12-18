#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: system_handlers.py
Created: 2025-12-16
Author: @lewopxd

Description:
System-level handlers for the bridge API.
These are registered automatically by BridgeAPI.
============================================
"""

from typing import Dict, Any
from datetime import datetime

# Note: This file contains additional system handlers that can be
# registered with the BridgeAPI. The core handlers (handshake, ping, etc.)
# are defined directly in bridge_api.py.

# Import Logger
try:
    from core.logger import Logger
except ImportError:
    try:
        from ...core.logger import Logger
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


def register_system_handlers(bridge):
    """
    Register additional system handlers with the bridge.
    
    Args:
        bridge: BridgeAPI instance
    """
    bridge.register_handler("get_system_info", handle_get_system_info)
    bridge.register_handler("log_from_ui", handle_log_from_ui)


def handle_get_system_info(content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get system information.
    
    Returns platform, Python version, etc.
    """
    import sys
    import platform
    
    return {
        "platform": sys.platform,
        "platform_release": platform.release(),
        "platform_version": platform.version(),
        "python_version": sys.version,
        "architecture": platform.architecture()[0],
        "machine": platform.machine(),
        "timestamp": datetime.now().isoformat()
    }


def handle_log_from_ui(content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Log a message from the UI to Python's logger.
    
    Useful for debugging JavaScript code.
    """
    level = content.get("level", "info").lower()
    message = content.get("message", "")
    source = content.get("source", "UI")
    
    formatted_message = f"[{source}] {message}"
    
    if level == "debug":
        Logger.debug(formatted_message)
    elif level == "warn" or level == "warning":
        Logger.warn(formatted_message)
    elif level == "error":
        Logger.error(formatted_message)
    else:
        Logger.info(formatted_message)
    
    return {"logged": True}
