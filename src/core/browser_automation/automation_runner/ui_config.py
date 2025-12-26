#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Runner - Configuration UI
============================================
DearPyGUI-based UI for configuring automation settings.
Ultra-lightweight, GPU-accelerated, modern look.
"""
import sys
import os

# Add parent paths for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

import dearpygui.dearpygui as dpg
from core.browser_automation.browser_detector import BrowserDetector
from core.browser_automation.profile_utils import list_browser_profiles, get_browser_profiles_path


class AutomationConfigUI:
    """Configuration UI for Automation Runner."""
    
    def __init__(self):
        self.detector = BrowserDetector()
        self.browsers = []
        self.profiles = []
        self.selected_browser = None
        self.selected_profile = None
        
        # Load current config
        self._load_current_config()
    
    def _load_current_config(self):
        """Load current configuration from config.py."""
        try:
            from core.browser_automation.automation_runner import config
            self.current_config = {
                "browser_name": getattr(config, "BROWSER_NAME", ""),
                "browser_path": getattr(config, "BROWSER_PATH", ""),
                "use_profile": getattr(config, "USE_PROFILE", False),
                "profile_name": getattr(config, "PROFILE_NAME", ""),
                "profile_path": getattr(config, "PROFILE_PATH", ""),
                "login_enabled": getattr(config, "LOGIN_ENABLED", True),
                "login_url": getattr(config, "LOGIN_URL", "https://login.microsoftonline.com/"),
            }
        except Exception as e:
            print(f"[ConfigUI] Error loading config: {e}")
            self.current_config = {
                "browser_name": "",
                "browser_path": "",
                "use_profile": False,
                "profile_name": "",
                "profile_path": "",
                "login_enabled": True,
                "login_url": "https://login.microsoftonline.com/",
            }
    
    def _detect_browsers(self):
        """Detect available browsers."""
        self.browsers = self.detector.get_dropdown_choices()
        return self.browsers
    
    def _on_browser_selected(self, sender, app_data, user_data):
        """Handle browser selection change."""
        selected_idx = app_data
        if 0 <= selected_idx < len(self.browsers):
            self.selected_browser = self.browsers[selected_idx]
            print(f"[ConfigUI] Browser selected: {self.selected_browser['name']}")
            
            # Update profiles list if profile checkbox is checked
            if dpg.get_value("use_profile_checkbox"):
                self._update_profiles_list()
    
    def _on_use_profile_changed(self, sender, app_data, user_data):
        """Handle use profile checkbox change."""
        use_profile = app_data
        if use_profile:
            dpg.show_item("profiles_group")
            self._update_profiles_list()
        else:
            dpg.hide_item("profiles_group")
            self.selected_profile = None
    
    def _update_profiles_list(self):
        """Update profiles listbox based on selected browser."""
        if not self.selected_browser:
            self.profiles = []
            dpg.configure_item("profiles_listbox", items=[])
            return
        
        browser_name = self.selected_browser.get("name", "")
        browser_path = self.selected_browser.get("path", "")
        
        self.profiles = list_browser_profiles(browser_name, browser_path)
        profile_names = [p.get("display_name", p.get("name", "Unknown")) for p in self.profiles]
        
        dpg.configure_item("profiles_listbox", items=profile_names)
        print(f"[ConfigUI] Found {len(self.profiles)} profiles for {browser_name}")
    
    def _on_profile_selected(self, sender, app_data, user_data):
        """Handle profile selection change."""
        selected_idx = app_data
        if 0 <= selected_idx < len(self.profiles):
            self.selected_profile = self.profiles[selected_idx]
            print(f"[ConfigUI] Profile selected: {self.selected_profile['name']}")
    
    def _on_login_enabled_changed(self, sender, app_data, user_data):
        """Handle login enabled checkbox change."""
        if app_data:
            dpg.show_item("login_url_group")
        else:
            dpg.hide_item("login_url_group")
    
    def _save_config(self, sender, app_data, user_data):
        """Save configuration to config.py file."""
        # Gather values
        browser_name = ""
        browser_path = ""
        if self.selected_browser:
            browser_name = self.selected_browser.get("name", "")
            browser_path = self.selected_browser.get("path", "")
        
        use_profile = dpg.get_value("use_profile_checkbox")
        profile_name = ""
        profile_path = ""
        if use_profile and self.selected_profile:
            profile_name = self.selected_profile.get("name", "")
            profile_path = self.selected_profile.get("path", "")
        
        login_enabled = dpg.get_value("login_enabled_checkbox")
        login_url = dpg.get_value("login_url_input")
        
        # Generate config file content
        config_content = f'''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Runner - Configuration
============================================
Configuration variables for the Selenium automation module.
Edit this file to change settings.
"""

# --- Browser Settings ---
BROWSER_NAME = "{browser_name}"
BROWSER_PATH = r"{browser_path}"
USE_PROFILE = {use_profile}
PROFILE_NAME = "{profile_name}"
PROFILE_PATH = r"{profile_path}"

# --- Login Settings ---
LOGIN_ENABLED = {login_enabled}
LOGIN_URL = "{login_url}"

# --- IDE Control ---
SLEEP_IDE = True            # Suspend IDE (Antigravity) when starting automation
'''
        
        # Write to config.py
        config_path = os.path.join(os.path.dirname(__file__), "config.py")
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                f.write(config_content)
            print(f"[ConfigUI] Configuration saved to {config_path}")
            
            # Show success message
            dpg.configure_item("status_text", default_value="✓ Configuración guardada", color=(0, 255, 0))
        except Exception as e:
            print(f"[ConfigUI] Error saving config: {e}")
            dpg.configure_item("status_text", default_value=f"✗ Error: {e}", color=(255, 0, 0))
    
    def _cancel(self, sender, app_data, user_data):
        """Cancel and close the UI."""
        dpg.stop_dearpygui()
    
    def run(self):
        """Run the configuration UI."""
        dpg.create_context()
        
        # Detect browsers
        self._detect_browsers()
        browser_names = [f"{b['display']}" for b in self.browsers]
        
        # Find pre-selected browser index
        preselect_browser_idx = 0
        for i, b in enumerate(self.browsers):
            if b.get("name") == self.current_config["browser_name"]:
                preselect_browser_idx = i
                self.selected_browser = b
                break
        
        # Create main window
        with dpg.window(label="AutoForms - Automation Config", tag="main_window", width=500, height=400):
            dpg.add_spacer(height=5)
            
            # Browser section
            dpg.add_text("Navegador", color=(200, 200, 200))
            dpg.add_listbox(
                tag="browsers_listbox",
                items=browser_names,
                default_value=preselect_browser_idx,
                num_items=4,
                width=-1,
                callback=self._on_browser_selected
            )
            
            dpg.add_spacer(height=10)
            
            # Profile checkbox
            dpg.add_checkbox(
                tag="use_profile_checkbox",
                label="Usar perfil del navegador",
                default_value=self.current_config["use_profile"],
                callback=self._on_use_profile_changed
            )
            
            # Profiles group (hidden by default)
            with dpg.group(tag="profiles_group", show=self.current_config["use_profile"]):
                dpg.add_listbox(
                    tag="profiles_listbox",
                    items=[],
                    num_items=3,
                    width=-1,
                    callback=self._on_profile_selected,
                    indent=20
                )
            
            dpg.add_spacer(height=10)
            
            # Login checkbox
            dpg.add_checkbox(
                tag="login_enabled_checkbox",
                label="Permitir Login Manual",
                default_value=self.current_config["login_enabled"],
                callback=self._on_login_enabled_changed
            )
            
            # Login URL group
            with dpg.group(tag="login_url_group", show=self.current_config["login_enabled"]):
                dpg.add_input_text(
                    tag="login_url_input",
                    label="URL de Login",
                    default_value=self.current_config["login_url"],
                    width=-1,
                    indent=20
                )
            
            dpg.add_spacer(height=20)
            dpg.add_separator()
            dpg.add_spacer(height=10)
            
            # Status text
            dpg.add_text("", tag="status_text")
            
            # Buttons
            with dpg.group(horizontal=True):
                dpg.add_button(label="Guardar", callback=self._save_config, width=100)
                dpg.add_button(label="Cancelar", callback=self._cancel, width=100)
        
        # Initialize profiles if use_profile is checked
        if self.current_config["use_profile"] and self.selected_browser:
            self._update_profiles_list()
            # Pre-select profile
            for i, p in enumerate(self.profiles):
                if p.get("name") == self.current_config["profile_name"]:
                    dpg.set_value("profiles_listbox", i)
                    self.selected_profile = p
                    break
        
        # Setup and run
        dpg.create_viewport(title="AutoForms - Automation Config", width=520, height=450)
        dpg.setup_dearpygui()
        dpg.show_viewport()
        dpg.set_primary_window("main_window", True)
        dpg.start_dearpygui()
        dpg.destroy_context()


def main():
    """Entry point for UI configuration."""
    ui = AutomationConfigUI()
    ui.run()


if __name__ == "__main__":
    main()
