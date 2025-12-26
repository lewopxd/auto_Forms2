#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
AutoForms - Automation Runner
============================================
Independent Selenium automation script for MS Forms.
Can be executed standalone without the main app.

Usage:
    python autofill_forms_by_selenium.py --config    # Open configuration UI
    python autofill_forms_by_selenium.py --help      # Show help
    python autofill_forms_by_selenium.py --run FILE  # Run automation (Future)
"""
import sys
import os
import argparse

# Add paths for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
SRC_DIR = os.path.dirname(CORE_DIR)
sys.path.insert(0, SRC_DIR)


def open_config_ui():
    """Open the configuration UI."""
    print("[AutomationRunner] Opening configuration UI...")
    try:
        from core.browser_automation.automation_runner.ui_config import AutomationConfigUI
        ui = AutomationConfigUI()
        ui.run()
    except ImportError as e:
        print(f"[AutomationRunner] Error: Could not import UI module: {e}")
        print("[AutomationRunner] Make sure dearpygui is installed: pip install dearpygui")
        sys.exit(1)


def run_automation(afpkg_path: str):
    """Run automation on an .afpkg file (Future implementation)."""
    print(f"[AutomationRunner] Automation engine not yet implemented.")
    print(f"[AutomationRunner] Target file: {afpkg_path}")
    print("[AutomationRunner] This feature will be available in a future update.")
    # TODO: Implement Phase 2 - automation engine


def show_current_config():
    """Show current configuration values."""
    try:
        from core.browser_automation.automation_runner import config
        print("\n=== Current Configuration ===")
        print(f"  Browser:       {getattr(config, 'BROWSER_NAME', '(not set)')}")
        print(f"  Browser Path:  {getattr(config, 'BROWSER_PATH', '(not set)')}")
        print(f"  Use Profile:   {getattr(config, 'USE_PROFILE', False)}")
        print(f"  Profile Name:  {getattr(config, 'PROFILE_NAME', '(not set)')}")
        print(f"  Login Enabled: {getattr(config, 'LOGIN_ENABLED', True)}")
        print(f"  Login URL:     {getattr(config, 'LOGIN_URL', '(not set)')}")
        print(f"  Sleep IDE:     {getattr(config, 'SLEEP_IDE', True)}")
        print("==============================\n")
    except Exception as e:
        print(f"[AutomationRunner] Error reading config: {e}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog="autofill_forms_by_selenium",
        description="AutoForms Automation Runner - Automate MS Forms filling with Selenium",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python autofill_forms_by_selenium.py --config
      Open the configuration UI to set browser, profile, and login options.

  python autofill_forms_by_selenium.py --show
      Display current configuration values.

  python autofill_forms_by_selenium.py --run automation.afpkg
      Run automation on the specified .afpkg file (Future).
"""
    )
    
    parser.add_argument(
        "--config", "-c",
        action="store_true",
        help="Open configuration UI"
    )
    
    parser.add_argument(
        "--show", "-s",
        action="store_true", 
        help="Show current configuration"
    )
    
    parser.add_argument(
        "--run", "-r",
        metavar="FILE",
        type=str,
        help="Run automation on .afpkg file (Future)"
    )
    
    args = parser.parse_args()
    
    if args.config:
        open_config_ui()
    elif args.show:
        show_current_config()
    elif args.run:
        if not os.path.exists(args.run):
            print(f"[AutomationRunner] Error: File not found: {args.run}")
            sys.exit(1)
        run_automation(args.run)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
