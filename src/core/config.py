#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: config.py
Created: 2025-12-16
Author: @lewopxd

Description:
Application configuration constants.
============================================
"""

# --- Application Identity ---
APP_NAME = "AutoForms"
APP_VERSION = "2.0.0"
APP_AUTHOR = "@lewopxd"

# --- Development Settings ---
DEBUG_MODE = True           # Enable DevTools in webview
UNIQUE_URL = True           # Add UUID to URL to prevent cache
PERSISTENT_WEBVIEW_DEV = True  # Enable for fast dev - requires setuptools installed

# --- Window Defaults ---
DEFAULT_WINDOW = {
    "width": 1200,
    "height": 800,
    "min_width": 800,
    "min_height": 600,
    "title": "AutoForms",
    "background_color": "#1a1a2e"
}

# --- Logger Settings ---
LOG_LEVEL = "DEBUG"         # DEBUG, INFO, WARN, ERROR, SILENT
LOG_COLORS = True           # Enable ANSI colors in terminal
LOG_TO_FILE = False         # Enable file logging
LOG_FILE_NAME = "autoforms.log"
