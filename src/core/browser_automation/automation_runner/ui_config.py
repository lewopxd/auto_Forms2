#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Runner - Main UI
============================================
DearPyGUI-based UI for automation control.
Ultra-lightweight, GPU-accelerated, instant load.
With state persistence and package metadata display.
"""
import sys
import os
import json
import threading

# Add parent paths for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR))))

import dearpygui.dearpygui as dpg

# State file path (next to this script)
STATE_FILE = os.path.join(SCRIPT_DIR, "ui_state.json")


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
        self.is_running = False
        self.loaded_package_path = ""
        self.package_info = {}
        self.saved_state = self._load_state()
    
    def _load_state(self) -> dict:
        """Load saved UI state from JSON file."""
        try:
            if os.path.exists(STATE_FILE):
                with open(STATE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"[UI] Error loading state: {e}")
        return {}
    
    def _save_state(self):
        """Save current UI state to JSON file."""
        try:
            state = {
                "browser_name": self.selected_browser.get("name", "") if self.selected_browser else "",
                "profile_name": self.selected_profile.get("name", "") if self.selected_profile else "",
                "use_profile": dpg.get_value("use_profile_checkbox") if dpg.does_item_exist("use_profile_checkbox") else False,
                "login_enabled": dpg.get_value("login_enabled_checkbox") if dpg.does_item_exist("login_enabled_checkbox") else True,
                "login_url": dpg.get_value("login_url_input") if dpg.does_item_exist("login_url_input") else "",
                "package_path": self.loaded_package_path,
                "use_alt_url": dpg.get_value("use_alt_url_checkbox") if dpg.does_item_exist("use_alt_url_checkbox") else False,
                "alt_url": dpg.get_value("alt_url_input") if dpg.does_item_exist("alt_url_input") else "",
            }
            with open(STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
            print(f"[UI] State saved")
        except Exception as e:
            print(f"[UI] Error saving state: {e}")
    
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
                
                # Restore saved browser selection
                saved_browser = self.saved_state.get("browser_name", "")
                if saved_browser:
                    for display, data in self.browser_names_map.items():
                        if data.get("name") == saved_browser:
                            dpg.set_value("browsers_listbox", display)
                            self.selected_browser = data
                            # Now load profiles if use_profile was enabled
                            if self.saved_state.get("use_profile", False):
                                self._update_profiles_list()
                            break
                    
            except Exception as e:
                self._update_status(f"✗ {e}", (255, 100, 100))
        threading.Thread(target=detect, daemon=True).start()
    
    def _update_profiles_list(self):
        """Update profiles listbox for selected browser."""
        if not self.selected_browser:
            return
            
        def load():
            try:
                from core.browser_automation.profile_utils import get_browser_profiles
                browser_name = self.selected_browser.get("name", "")
                browser_path = self.selected_browser.get("path", "")
                
                self.profiles = get_browser_profiles(browser_name, browser_path)
                
                self.profile_names_map = {}
                profile_display_names = []
                for p in self.profiles:
                    display = p.get("display", p.get("name", "Default"))
                    self.profile_names_map[display] = p
                    profile_display_names.append(display)
                
                if dpg.does_item_exist("profiles_listbox"):
                    dpg.configure_item("profiles_listbox", items=profile_display_names)
                
                # Restore saved profile selection
                saved_profile = self.saved_state.get("profile_name", "")
                if saved_profile:
                    for display, data in self.profile_names_map.items():
                        if data.get("name") == saved_profile:
                            dpg.set_value("profiles_listbox", display)
                            self.selected_profile = data
                            break
                            
            except Exception as e:
                print(f"[UI] Profile load error: {e}")
        threading.Thread(target=load, daemon=True).start()
    
    def _on_browser_selected(self, sender, app_data, user_data):
        """Handle browser selection."""
        selected_display = app_data
        if selected_display in self.browser_names_map:
            self.selected_browser = self.browser_names_map[selected_display]
            if dpg.get_value("use_profile_checkbox"):
                self._update_profiles_list()
    
    def _on_profile_selected(self, sender, app_data, user_data):
        """Handle profile selection."""
        selected_display = app_data
        if selected_display in self.profile_names_map:
            self.selected_profile = self.profile_names_map[selected_display]
    
    def _on_use_profile_changed(self, sender, app_data, user_data):
        """Handle use profile checkbox change."""
        if app_data:
            dpg.show_item("profiles_group")
            if self.selected_browser:
                self._update_profiles_list()
        else:
            dpg.hide_item("profiles_group")
    
    def _on_login_enabled_changed(self, sender, app_data, user_data):
        """Handle login enabled checkbox change."""
        if app_data:
            dpg.show_item("login_url_group")
        else:
            dpg.hide_item("login_url_group")
    
    def _on_use_alt_url_changed(self, sender, app_data, user_data):
        """Handle alt URL checkbox change."""
        if app_data:
            dpg.show_item("alt_url_group")
        else:
            dpg.hide_item("alt_url_group")
    
    def _update_status(self, message: str, color: tuple = (150, 150, 150)):
        """Update status text."""
        if dpg.does_item_exist("status_text"):
            dpg.configure_item("status_text", default_value=message, color=color)
    
    def _get_browser_config(self) -> dict:
        """Build browser config from current UI state."""
        # Get alt URL if enabled
        use_alt_url = dpg.get_value("use_alt_url_checkbox") if dpg.does_item_exist("use_alt_url_checkbox") else False
        alt_url = dpg.get_value("alt_url_input") if dpg.does_item_exist("alt_url_input") else ""
        
        config = {
            "browser_name": "",
            "browser_path": "",
            "use_profile": dpg.get_value("use_profile_checkbox"),
            "profile_name": "",
            "profile_path": "",
            "login_enabled": dpg.get_value("login_enabled_checkbox"),
            "login_url": dpg.get_value("login_url_input"),
            "package_path": self.loaded_package_path,
            "use_alt_url": use_alt_url,
            "alt_url": alt_url,
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
        
        if not self.loaded_package_path:
            self._update_status("⚠ Cargue un paquete .afpkg", (255, 200, 100))
            return
        
        # Save state before starting
        self._save_state()
        
        self.is_running = True
        dpg.configure_item("start_stop_btn", label="■ DETENER AUTOMATIZACIÓN")
        dpg.bind_item_theme("start_stop_btn", "stop_btn_theme")
        self._update_status("▶ Iniciando...", (100, 200, 255))
        
        # Disable config controls
        dpg.disable_item("browsers_listbox")
        dpg.disable_item("use_profile_checkbox")
        dpg.disable_item("login_enabled_checkbox")
        dpg.disable_item("load_package_btn")
        
        # Status callback for booster
        def on_status(status: str, message: str):
            color = (150, 150, 150)
            if "✓" in message or status in ["ready", "boosted", "handshake", "injected", "loaded", "login_done"]:
                color = (100, 255, 150)
            elif "✗" in message or status == "error":
                color = (255, 100, 100)
            elif "▶" in message or "🚀" in message:
                color = (100, 200, 255)
            elif status in ["stopped", "closed", "cancelled"]:
                color = (255, 200, 100)
            self._update_status(message, color)
            
            # Detect automation ended → reset UI
            if status in ["stopped", "cancelled"]:
                self._reset_ui_state()
                self._update_status("● Listo para iniciar", (150, 150, 150))
        
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
        if dpg.does_item_exist("load_package_btn"):
            dpg.enable_item("load_package_btn")
    
    def _on_load_package_click(self, sender, app_data, user_data):
        """Show native Windows file dialog to load package."""
        def open_dialog():
            try:
                import tkinter as tk
                from tkinter import filedialog
                
                root = tk.Tk()
                root.withdraw()
                root.attributes('-topmost', True)
                
                file_path = filedialog.askopenfilename(
                    title="Seleccionar Paquete de Automatización",
                    filetypes=[("AutoForms Package", "*.afpkg"), ("All Files", "*.*")],
                    parent=root
                )
                
                root.destroy()
                
                if file_path:
                    self._load_package(file_path)
            except Exception as e:
                self._update_status(f"✗ Error: {e}", (255, 100, 100))
        
        threading.Thread(target=open_dialog, daemon=True).start()

    def _load_package(self, file_path: str):
        """Load package and update UI with metadata."""
        self.loaded_package_path = file_path
        dpg.set_value("package_path_input", file_path)
        
        # Parse package for metadata
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            instructions = data.get("instructions", {})
            resolved_rows = data.get("resolvedRows", [])
            meta = data.get("meta", {})
            
            # Count questions
            total_questions = 0
            pages = instructions.get("pages", [])
            for page in pages:
                questions = page.get("questions", [])
                total_questions += len(questions)
            
            self.package_info = {
                "filename": os.path.basename(file_path),
                "totalRows": len(resolved_rows),
                "totalQuestions": total_questions,
                "formUrl": instructions.get("url", ""),
                "sourceExcel": meta.get("sourceExcel", ""),
                "sourceSheet": meta.get("sourceSheet", ""),
            }
            
            # Update metadata section
            self._update_package_metadata()
            dpg.show_item("package_metadata_group")
            
            self._update_status(f"✓ Paquete cargado", (100, 200, 100))
            print(f"[UI] Package loaded: {file_path}")
            
        except Exception as e:
            self._update_status(f"✗ Error: {e}", (255, 100, 100))
            print(f"[UI] Package load error: {e}")
    
    def _update_package_metadata(self):
        """Update package metadata display."""
        if dpg.does_item_exist("pkg_filename_text"):
            dpg.set_value("pkg_filename_text", f"📦 {self.package_info.get('filename', 'N/A')}")
        if dpg.does_item_exist("pkg_rows_text"):
            dpg.set_value("pkg_rows_text", f"Filas: {self.package_info.get('totalRows', 0)}")
        if dpg.does_item_exist("pkg_questions_text"):
            dpg.set_value("pkg_questions_text", f"Preguntas: {self.package_info.get('totalQuestions', 0)}")
        if dpg.does_item_exist("pkg_url_text"):
            url = self.package_info.get('formUrl', '')
            dpg.set_value("pkg_url_text", url[:60] + "..." if len(url) > 60 else url)
    
    def _close(self, sender, app_data, user_data):
        """Close UI - save state and stop automation if running."""
        self._save_state()
        if self.is_running:
            self._stop_automation()
        dpg.stop_dearpygui()
    
    def _restore_saved_state(self):
        """Restore UI from saved state."""
        if not self.saved_state:
            return
        
        # Restore checkboxes
        if dpg.does_item_exist("use_profile_checkbox"):
            use_profile = self.saved_state.get("use_profile", False)
            dpg.set_value("use_profile_checkbox", use_profile)
            if use_profile:
                dpg.show_item("profiles_group")
        
        if dpg.does_item_exist("login_enabled_checkbox"):
            login_enabled = self.saved_state.get("login_enabled", True)
            dpg.set_value("login_enabled_checkbox", login_enabled)
            if login_enabled:
                dpg.show_item("login_url_group")
            else:
                dpg.hide_item("login_url_group")
        
        if dpg.does_item_exist("login_url_input"):
            dpg.set_value("login_url_input", self.saved_state.get("login_url", "https://login.microsoftonline.com/"))
        
        if dpg.does_item_exist("use_alt_url_checkbox"):
            use_alt = self.saved_state.get("use_alt_url", False)
            dpg.set_value("use_alt_url_checkbox", use_alt)
            if use_alt:
                dpg.show_item("alt_url_group")
        
        if dpg.does_item_exist("alt_url_input"):
            dpg.set_value("alt_url_input", self.saved_state.get("alt_url", ""))
        
        # Restore package
        saved_package = self.saved_state.get("package_path", "")
        if saved_package and os.path.exists(saved_package):
            self._load_package(saved_package)
    
    def run(self):
        """Run the UI."""
        dpg.create_context()
        
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
        with dpg.window(label="AutoForms - Automation Runner", tag="main_window", width=520, height=580):
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
            
            dpg.add_spacer(height=10)
            dpg.add_separator()
            dpg.add_spacer(height=10)
            
            # === PACKAGE LOADER ===
            dpg.add_text("Paquete de Automatización", color=(200, 200, 200))
            with dpg.group(horizontal=True):
                dpg.add_input_text(
                    tag="package_path_input",
                    default_value="",
                    readonly=True,
                    width=-80,
                    hint="Seleccione un archivo .afpkg"
                )
                dpg.add_button(
                    tag="load_package_btn",
                    label="Cargar",
                    callback=self._on_load_package_click,
                    width=70
                )
            
            # === PACKAGE METADATA (hidden until package loaded) ===
            with dpg.group(tag="package_metadata_group", show=False):
                dpg.add_spacer(height=5)
                with dpg.group(horizontal=True):
                    dpg.add_text("", tag="pkg_filename_text", color=(100, 200, 255))
                dpg.add_spacer(height=3)
                with dpg.group(horizontal=True):
                    dpg.add_text("", tag="pkg_rows_text", color=(150, 150, 150))
                    dpg.add_spacer(width=20)
                    dpg.add_text("", tag="pkg_questions_text", color=(150, 150, 150))
                dpg.add_text("", tag="pkg_url_text", color=(100, 150, 100))
            
            dpg.add_spacer(height=8)
            
            # === ALT URL CHECKBOX ===
            dpg.add_checkbox(
                tag="use_alt_url_checkbox",
                label="Usar URL alternativa",
                default_value=False,
                callback=self._on_use_alt_url_changed
            )
            
            with dpg.group(tag="alt_url_group", show=False):
                dpg.add_input_text(
                    tag="alt_url_input",
                    label="URL",
                    default_value="",
                    width=-1,
                    hint="URL alternativa del formulario",
                    indent=20
                )
            
            dpg.add_spacer(height=10)
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
        dpg.create_viewport(title="AutoForms - Automation Runner", width=540, height=640)
        dpg.setup_dearpygui()
        dpg.show_viewport()
        dpg.set_primary_window("main_window", True)
        
        # Restore saved state
        self._restore_saved_state()
        
        # Detect browsers after UI is visible
        self._detect_browsers_async()
        
        dpg.start_dearpygui()
        dpg.destroy_context()


def main():
    ui = AutomationRunnerUI()
    ui.run()


if __name__ == "__main__":
    main()
