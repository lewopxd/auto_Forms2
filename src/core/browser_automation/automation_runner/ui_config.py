#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Runner - Main UI
============================================
DearPyGUI-based UI for automation runner.
Ultra-lightweight, GPU-accelerated, modern look.
UI loads instantly, browser detection happens in background.
"""
import sys
import os
import threading

# Add parent paths for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

import dearpygui.dearpygui as dpg


class AutomationRunnerUI:
    """Main UI for Automation Runner."""
    
    def __init__(self):
        self.detector = None
        self.browsers = []
        self.browser_names_map = {}  # display_name -> browser_data
        self.profiles = []
        self.profile_names_map = {}  # display_name -> profile_data
        self.selected_browser = None
        self.selected_profile = None
        self.current_config = self._get_default_config()
    
    def _get_default_config(self):
        """Get default configuration."""
        return {
            "browser_name": "",
            "browser_path": "",
            "use_profile": False,
            "profile_name": "",
            "profile_path": "",
            "login_enabled": True,
            "login_url": "https://login.microsoftonline.com/",
        }
    
    def _load_current_config(self):
        """Load current configuration from config.py (runs in background)."""
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
            print(f"[UI] Using default config: {e}")
    
    def _detect_browsers_async(self):
        """Detect browsers in background thread."""
        def detect():
            try:
                from core.browser_automation.browser_detector import BrowserDetector
                self.detector = BrowserDetector()
                self.browsers = self.detector.get_dropdown_choices()
                
                # Build name->data map
                self.browser_names_map = {}
                browser_display_names = []
                for b in self.browsers:
                    display = b.get("display", b.get("name", "Unknown"))
                    self.browser_names_map[display] = b
                    browser_display_names.append(display)
                
                # Update UI in main thread
                dpg.configure_item("browsers_listbox", items=browser_display_names)
                dpg.configure_item("status_text", default_value=f"✓ {len(self.browsers)} navegadores detectados", color=(100, 200, 100))
                
                # Pre-select saved browser if exists
                if self.current_config["browser_name"]:
                    for display, data in self.browser_names_map.items():
                        if data.get("name") == self.current_config["browser_name"]:
                            dpg.set_value("browsers_listbox", display)
                            self.selected_browser = data
                            break
                
                # Load profiles if needed
                if self.current_config["use_profile"] and self.selected_browser:
                    self._update_profiles_list()
                    
            except Exception as e:
                print(f"[UI] Error detecting browsers: {e}")
                dpg.configure_item("status_text", default_value=f"✗ Error: {e}", color=(255, 100, 100))
        
        threading.Thread(target=detect, daemon=True).start()
    
    def _on_browser_selected(self, sender, app_data, user_data):
        """Handle browser selection change. app_data is the SELECTED STRING."""
        selected_display = app_data  # This is the display string, not index
        if selected_display in self.browser_names_map:
            self.selected_browser = self.browser_names_map[selected_display]
            print(f"[UI] Browser: {self.selected_browser.get('name')}")
            
            # Update profiles if checkbox is checked
            if dpg.get_value("use_profile_checkbox"):
                self._update_profiles_list()
    
    def _on_use_profile_changed(self, sender, app_data, user_data):
        """Handle use profile checkbox change."""
        if app_data:
            dpg.show_item("profiles_group")
            self._update_profiles_list()
        else:
            dpg.hide_item("profiles_group")
            self.selected_profile = None
    
    def _update_profiles_list(self):
        """Update profiles listbox based on selected browser."""
        if not self.selected_browser:
            self.profiles = []
            self.profile_names_map = {}
            dpg.configure_item("profiles_listbox", items=["(Seleccione navegador primero)"])
            return
        
        try:
            from core.browser_automation.profile_utils import list_browser_profiles
            
            browser_name = self.selected_browser.get("name", "")
            browser_path = self.selected_browser.get("path", "")
            
            self.profiles = list_browser_profiles(browser_name, browser_path)
            
            # Build map
            self.profile_names_map = {}
            profile_display_names = []
            for p in self.profiles:
                display = p.get("display_name", p.get("name", "Unknown"))
                self.profile_names_map[display] = p
                profile_display_names.append(display)
            
            if profile_display_names:
                dpg.configure_item("profiles_listbox", items=profile_display_names)
                # Pre-select saved profile
                if self.current_config["profile_name"]:
                    for display, data in self.profile_names_map.items():
                        if data.get("name") == self.current_config["profile_name"]:
                            dpg.set_value("profiles_listbox", display)
                            self.selected_profile = data
                            break
            else:
                dpg.configure_item("profiles_listbox", items=["(No se encontraron perfiles)"])
                
        except Exception as e:
            print(f"[UI] Error listing profiles: {e}")
            dpg.configure_item("profiles_listbox", items=[f"(Error: {e})"])
    
    def _on_profile_selected(self, sender, app_data, user_data):
        """Handle profile selection. app_data is the SELECTED STRING."""
        selected_display = app_data
        if selected_display in self.profile_names_map:
            self.selected_profile = self.profile_names_map[selected_display]
            print(f"[UI] Profile: {self.selected_profile.get('name')}")
    
    def _on_login_enabled_changed(self, sender, app_data, user_data):
        """Handle login enabled checkbox change."""
        if app_data:
            dpg.show_item("login_url_group")
        else:
            dpg.hide_item("login_url_group")
    
    def _save_config(self, sender, app_data, user_data):
        """Save configuration to config.py file."""
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
        
        config_content = f'''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automation Runner - Configuration
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
SLEEP_IDE = True
'''
        
        config_path = os.path.join(os.path.dirname(__file__), "config.py")
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                f.write(config_content)
            dpg.configure_item("status_text", default_value="✓ Configuración guardada", color=(0, 255, 0))
        except Exception as e:
            dpg.configure_item("status_text", default_value=f"✗ Error: {e}", color=(255, 0, 0))
    
    def _close(self, sender, app_data, user_data):
        """Close the UI."""
        dpg.stop_dearpygui()
    
    def run(self):
        """Run the UI - loads instantly, detects browsers in background."""
        dpg.create_context()
        
        # Load config in background
        threading.Thread(target=self._load_current_config, daemon=True).start()
        
        # Create main window IMMEDIATELY (no waiting for browser detection)
        with dpg.window(label="AutoForms - Automation Runner", tag="main_window", width=500, height=420):
            dpg.add_spacer(height=5)
            
            # Browser section
            dpg.add_text("Navegador", color=(200, 200, 200))
            dpg.add_listbox(
                tag="browsers_listbox",
                items=["Detectando navegadores..."],
                num_items=4,
                width=-1,
                callback=self._on_browser_selected
            )
            
            dpg.add_spacer(height=10)
            
            # Profile checkbox
            dpg.add_checkbox(
                tag="use_profile_checkbox",
                label="Usar perfil del navegador",
                default_value=False,
                callback=self._on_use_profile_changed
            )
            
            # Profiles group (hidden by default)
            with dpg.group(tag="profiles_group", show=False):
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
                default_value=True,
                callback=self._on_login_enabled_changed
            )
            
            # Login URL group
            with dpg.group(tag="login_url_group", show=True):
                dpg.add_input_text(
                    tag="login_url_input",
                    label="URL",
                    default_value="https://login.microsoftonline.com/",
                    width=-1,
                    indent=20
                )
            
            dpg.add_spacer(height=15)
            dpg.add_separator()
            dpg.add_spacer(height=8)
            
            # Status text
            dpg.add_text("Iniciando...", tag="status_text", color=(150, 150, 150))
            
            dpg.add_spacer(height=5)
            
            # Buttons
            with dpg.group(horizontal=True):
                dpg.add_button(label="Guardar Config", callback=self._save_config, width=120)
                dpg.add_button(label="Cerrar", callback=self._close, width=80)
        
        # Setup viewport and show IMMEDIATELY
        dpg.create_viewport(title="AutoForms - Automation Runner", width=520, height=480)
        dpg.setup_dearpygui()
        dpg.show_viewport()
        dpg.set_primary_window("main_window", True)
        
        # NOW detect browsers in background (UI already visible)
        self._detect_browsers_async()
        
        dpg.start_dearpygui()
        dpg.destroy_context()


def main():
    """Entry point."""
    ui = AutomationRunnerUI()
    ui.run()


if __name__ == "__main__":
    main()
