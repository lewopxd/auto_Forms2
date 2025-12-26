#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Runner - Main UI
============================================
DearPyGUI-based UI for automation control.
Ultra-lightweight, GPU-accelerated, instant load.
"""
import sys
import os
import threading

# Add parent paths for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

import dearpygui.dearpygui as dpg


class AutomationRunnerUI:
    """Main UI for Automation Runner with Start/Stop control."""
    
    def __init__(self):
        self.detector = None
        self.browsers = []
        self.browser_names_map = {}
        self.profiles = []
        self.profile_names_map = {}
        self.selected_browser = None
        self.selected_profile = None
        self.current_config = self._get_default_config()
        self.is_running = False
    
    def _get_default_config(self):
        return {
            "browser_name": "",
            "browser_path": "",
            "use_profile": False,
            "profile_name": "",
            "profile_path": "",
            "login_enabled": True,
            "login_url": "https://login.microsoftonline.com/",
        }
    
    def _load_config_async(self):
        """Load config in background."""
        def load():
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
                # Apply to UI if it's ready
                if dpg.does_item_exist("use_profile_checkbox"):
                    dpg.set_value("use_profile_checkbox", self.current_config["use_profile"])
                if dpg.does_item_exist("login_enabled_checkbox"):
                    dpg.set_value("login_enabled_checkbox", self.current_config["login_enabled"])
                if dpg.does_item_exist("login_url_input"):
                    dpg.set_value("login_url_input", self.current_config["login_url"])
            except Exception as e:
                print(f"[UI] Config load error: {e}")
        threading.Thread(target=load, daemon=True).start()
    
    def _detect_browsers_async(self):
        """Detect browsers in background."""
        def detect():
            try:
                from core.browser_automation.browser_detector import BrowserDetector
                self.detector = BrowserDetector()
                self.browsers = self.detector.get_dropdown_choices()
                
                self.browser_names_map = {}
                browser_display_names = []
                for b in self.browsers:
                    display = b.get("display", b.get("name", "Unknown"))
                    self.browser_names_map[display] = b
                    browser_display_names.append(display)
                
                dpg.configure_item("browsers_listbox", items=browser_display_names)
                self._update_status(f"✓ {len(self.browsers)} navegadores", (100, 200, 100))
                
                # Pre-select saved browser
                if self.current_config["browser_name"]:
                    for display, data in self.browser_names_map.items():
                        if data.get("name") == self.current_config["browser_name"]:
                            dpg.set_value("browsers_listbox", display)
                            self.selected_browser = data
                            break
                
                if self.current_config["use_profile"] and self.selected_browser:
                    self._update_profiles_list()
                    
            except Exception as e:
                self._update_status(f"✗ {e}", (255, 100, 100))
        threading.Thread(target=detect, daemon=True).start()
    
    def _on_browser_selected(self, sender, app_data, user_data):
        selected_display = app_data
        if selected_display in self.browser_names_map:
            self.selected_browser = self.browser_names_map[selected_display]
            if dpg.get_value("use_profile_checkbox"):
                self._update_profiles_list()
    
    def _on_use_profile_changed(self, sender, app_data, user_data):
        if app_data:
            dpg.show_item("profiles_group")
            self._update_profiles_list()
        else:
            dpg.hide_item("profiles_group")
            self.selected_profile = None
    
    def _update_profiles_list(self):
        if not self.selected_browser:
            dpg.configure_item("profiles_listbox", items=["(Seleccione navegador)"])
            return
        try:
            from core.browser_automation.profile_utils import list_browser_profiles
            browser_name = self.selected_browser.get("name", "")
            browser_path = self.selected_browser.get("path", "")
            self.profiles = list_browser_profiles(browser_name, browser_path)
            
            self.profile_names_map = {}
            profile_display_names = []
            for p in self.profiles:
                display = p.get("display_name", p.get("name", "Unknown"))
                self.profile_names_map[display] = p
                profile_display_names.append(display)
            
            if profile_display_names:
                dpg.configure_item("profiles_listbox", items=profile_display_names)
                if self.current_config["profile_name"]:
                    for display, data in self.profile_names_map.items():
                        if data.get("name") == self.current_config["profile_name"]:
                            dpg.set_value("profiles_listbox", display)
                            self.selected_profile = data
                            break
            else:
                dpg.configure_item("profiles_listbox", items=["(Sin perfiles)"])
        except Exception as e:
            dpg.configure_item("profiles_listbox", items=[f"Error: {e}"])
    
    def _on_profile_selected(self, sender, app_data, user_data):
        if app_data in self.profile_names_map:
            self.selected_profile = self.profile_names_map[app_data]
    
    def _on_login_enabled_changed(self, sender, app_data, user_data):
        if app_data:
            dpg.show_item("login_url_group")
        else:
            dpg.hide_item("login_url_group")
    
    def _update_status(self, message: str, color: tuple = (150, 150, 150)):
        """Update status text."""
        if dpg.does_item_exist("status_text"):
            dpg.configure_item("status_text", default_value=message, color=color)
    
    def _get_browser_config(self) -> dict:
        """Build browser config from current UI state."""
        config = {
            "browser_name": "",
            "browser_path": "",
            "use_profile": dpg.get_value("use_profile_checkbox"),
            "profile_name": "",
            "profile_path": "",
            "login_enabled": dpg.get_value("login_enabled_checkbox"),
            "login_url": dpg.get_value("login_url_input"),
        }
        
        if self.selected_browser:
            config["browser_name"] = self.selected_browser.get("name", "")
            config["browser_path"] = self.selected_browser.get("path", "")
        
        if config["use_profile"] and self.selected_profile:
            config["profile_name"] = self.selected_profile.get("name", "")
            config["profile_path"] = self.selected_profile.get("path", "")
        
        return config
    
    def _on_start_stop_click(self, sender, app_data, user_data):
        """Handle Start/Stop button click."""
        if self.is_running:
            self._stop_automation()
        else:
            self._start_automation()
    
    def _start_automation(self):
        """Start the automation."""
        if not self.selected_browser:
            self._update_status("⚠ Seleccione un navegador", (255, 200, 100))
            return
        
        self.is_running = True
        dpg.configure_item("start_stop_btn", label="■ DETENER AUTOMATIZACIÓN")
        dpg.bind_item_theme("start_stop_btn", "stop_btn_theme")
        self._update_status("▶ Iniciando...", (100, 200, 255))
        
        # Disable config controls
        dpg.disable_item("browsers_listbox")
        dpg.disable_item("use_profile_checkbox")
        dpg.disable_item("login_enabled_checkbox")
        
        # Status callback for booster
        def on_status(status: str, message: str):
            color = (150, 150, 150)
            if "✓" in message or status in ["ready", "boosted", "handshake"]:
                color = (100, 255, 150)
            elif "✗" in message or status == "error":
                color = (255, 100, 100)
            elif "▶" in message or "🚀" in message:
                color = (100, 200, 255)
            self._update_status(message, color)
        
        def on_ready():
            self._update_status("● Automatización activa", (100, 255, 150))
        
        def on_error(error: str):
            self._update_status(f"✗ {error}", (255, 100, 100))
            self._reset_ui_state()
        
        # Import and start booster
        try:
            from core.browser_automation.automation_runner.selenium_process_booster import SeleniumProcessBooster
            SeleniumProcessBooster.set_status_callback(on_status)
            
            config = self._get_browser_config()
            SeleniumProcessBooster.start(config, on_ready=on_ready, on_error=on_error)
        except Exception as e:
            self._update_status(f"✗ Error: {e}", (255, 100, 100))
            self._reset_ui_state()
    
    def _stop_automation(self):
        """Stop the automation."""
        self._update_status("■ Deteniendo...", (255, 200, 100))
        
        try:
            from core.browser_automation.automation_runner.selenium_process_booster import SeleniumProcessBooster
            SeleniumProcessBooster.stop()
        except Exception as e:
            print(f"[UI] Stop error: {e}")
        
        self._reset_ui_state()
        self._update_status("● Listo para iniciar", (150, 150, 150))
    
    def _reset_ui_state(self):
        """Reset UI to idle state."""
        self.is_running = False
        dpg.configure_item("start_stop_btn", label="▶ INICIAR AUTOMATIZACIÓN")
        dpg.bind_item_theme("start_stop_btn", "start_btn_theme")
        dpg.enable_item("browsers_listbox")
        dpg.enable_item("use_profile_checkbox")
        dpg.enable_item("login_enabled_checkbox")
    
    def _close(self, sender, app_data, user_data):
        """Close UI - stop automation first if running."""
        if self.is_running:
            self._stop_automation()
        dpg.stop_dearpygui()
    
    def run(self):
        """Run the UI."""
        dpg.create_context()
        
        # Load config
        self._load_config_async()
        
        # === THEMES ===
        with dpg.theme(tag="start_btn_theme"):
            with dpg.theme_component(dpg.mvButton):
                dpg.add_theme_color(dpg.mvThemeCol_Button, (40, 120, 80))
                dpg.add_theme_color(dpg.mvThemeCol_ButtonHovered, (50, 150, 100))
                dpg.add_theme_color(dpg.mvThemeCol_ButtonActive, (30, 100, 70))
        
        with dpg.theme(tag="stop_btn_theme"):
            with dpg.theme_component(dpg.mvButton):
                dpg.add_theme_color(dpg.mvThemeCol_Button, (150, 50, 50))
                dpg.add_theme_color(dpg.mvThemeCol_ButtonHovered, (180, 70, 70))
                dpg.add_theme_color(dpg.mvThemeCol_ButtonActive, (120, 40, 40))
        
        # === MAIN WINDOW ===
        with dpg.window(label="AutoForms - Automation Runner", tag="main_window", width=500, height=480):
            dpg.add_spacer(height=5)
            
            # Browser section
            dpg.add_text("Navegador", color=(200, 200, 200))
            dpg.add_listbox(
                tag="browsers_listbox",
                items=["Detectando..."],
                num_items=4,
                width=-1,
                callback=self._on_browser_selected
            )
            
            dpg.add_spacer(height=8)
            
            # Profile checkbox
            dpg.add_checkbox(
                tag="use_profile_checkbox",
                label="Usar perfil del navegador",
                default_value=False,
                callback=self._on_use_profile_changed
            )
            
            with dpg.group(tag="profiles_group", show=False):
                dpg.add_listbox(
                    tag="profiles_listbox",
                    items=[],
                    num_items=3,
                    width=-1,
                    callback=self._on_profile_selected,
                    indent=20
                )
            
            dpg.add_spacer(height=8)
            
            # Login checkbox
            dpg.add_checkbox(
                tag="login_enabled_checkbox",
                label="Permitir Login Manual",
                default_value=True,
                callback=self._on_login_enabled_changed
            )
            
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
            dpg.add_spacer(height=10)
            
            # Status
            dpg.add_text("● Listo para iniciar", tag="status_text", color=(150, 150, 150))
            
            dpg.add_spacer(height=10)
            
            # === START/STOP BUTTON ===
            dpg.add_button(
                tag="start_stop_btn",
                label="▶ INICIAR AUTOMATIZACIÓN",
                callback=self._on_start_stop_click,
                width=-1,
                height=40
            )
            dpg.bind_item_theme("start_stop_btn", "start_btn_theme")
            
            dpg.add_spacer(height=8)
            
            dpg.add_button(label="Cerrar", callback=self._close, width=80)
        
        # Setup and show
        dpg.create_viewport(title="AutoForms - Automation Runner", width=520, height=540)
        dpg.setup_dearpygui()
        dpg.show_viewport()
        dpg.set_primary_window("main_window", True)
        
        # Detect browsers after UI is visible
        self._detect_browsers_async()
        
        dpg.start_dearpygui()
        dpg.destroy_context()


def main():
    ui = AutomationRunnerUI()
    ui.run()


if __name__ == "__main__":
    main()
