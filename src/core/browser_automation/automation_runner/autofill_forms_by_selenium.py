#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
AutoForms - Automation Runner
============================================
Independent Selenium automation script for MS Forms.
Can be executed standalone without the main app.

Usage:
    python autofill_forms_by_selenium.py           # Open main UI
    python autofill_forms_by_selenium.py --show    # Show current config
    python autofill_forms_by_selenium.py --help    # Show help
"""
import sys
import os
import argparse

# Add paths for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
SRC_DIR = os.path.dirname(CORE_DIR)
sys.path.insert(0, SRC_DIR)


def open_ui():
    """Open the main UI."""
    try:
        from core.browser_automation.automation_runner.ui_config import AutomationRunnerUI
        ui = AutomationRunnerUI()
        ui.run()
    except ImportError as e:
        print(f"[AutomationRunner] Error: {e}")
        print("[AutomationRunner] Install: pip install dearpygui")
        sys.exit(1)


def show_current_config():
    """Show current configuration values."""
    try:
        from core.browser_automation.automation_runner import config
        print("\n=== Configuration ===")
        print(f"  Browser:       {getattr(config, 'BROWSER_NAME', '(not set)')}")
        print(f"  Use Profile:   {getattr(config, 'USE_PROFILE', False)}")
        print(f"  Profile:       {getattr(config, 'PROFILE_NAME', '(not set)')}")
        print(f"  Login:         {getattr(config, 'LOGIN_ENABLED', True)}")
        print(f"  Login URL:     {getattr(config, 'LOGIN_URL', '')}")
        print(f"  Sleep IDE:     {getattr(config, 'SLEEP_IDE', True)}")
        print("=====================\n")
    except Exception as e:
        print(f"[AutomationRunner] Error: {e}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog="autofill_forms_by_selenium",
        description="AutoForms Automation Runner"
    )
    
    parser.add_argument("--show", "-s", action="store_true", help="Show current config")
    
    args = parser.parse_args()
    
    if args.show:
        show_current_config()
    else:
        # Default action: open UI
        open_ui()


if __name__ == "__main__":
    main()
