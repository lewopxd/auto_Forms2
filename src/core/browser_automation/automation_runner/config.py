#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Runner - Configuration
============================================
Configuration variables for the Selenium automation module.
Edit this file to change settings.
"""

# --- Browser Settings ---
BROWSER_NAME = ""           # chrome, edge, brave, ungoogled_chromium
BROWSER_PATH = ""           # Path to browser executable
USE_PROFILE = False         # Use browser profile
PROFILE_NAME = ""           # Default, Profile 1, etc.
PROFILE_PATH = ""           # Path to User Data directory

# --- Login Settings ---
LOGIN_ENABLED = True
LOGIN_URL = "https://login.microsoftonline.com/"

# --- IDE Control ---
SLEEP_IDE = True            # Suspend IDE (Antigravity) when starting automation
