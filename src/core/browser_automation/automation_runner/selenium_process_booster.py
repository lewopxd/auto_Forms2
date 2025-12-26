#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Selenium Process Booster
============================================
Gestión de recursos para automatización Selenium.
- Hiberna IDE + Language Server
- Asigna HIGH priority a procesos Selenium
- Restaura todo al terminar
"""
import sys
import os
import threading
import time
from typing import Optional, Callable, List

# Add paths for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
SRC_DIR = os.path.dirname(CORE_DIR)
sys.path.insert(0, SRC_DIR)

from core.process_manager import ProcessManager, HIGH_PRIORITY_CLASS
from core.browser_automation.browser_settings import BrowserConfig, build_chrome_options
from core.browser_automation.profile_utils import get_browser_profiles_path


class SeleniumProcessBooster:
    """Gestión de recursos para automatización Selenium."""
    
    _is_active: bool = False
    _driver = None
    _chromedriver_pid: Optional[int] = None
    _browser_pids: List[int] = []
    _should_monitor: bool = False
    _on_status_change: Optional[Callable[[str, str], None]] = None
    
    @classmethod
    def set_status_callback(cls, callback: Callable[[str, str], None]):
        cls._on_status_change = callback
    
    @classmethod
    def _emit_status(cls, status: str, message: str):
        print(f"[SeleniumBooster] {message}")
        if cls._on_status_change:
            try:
                cls._on_status_change(status, message)
            except Exception as e:
                print(f"[SeleniumBooster] Callback error: {e}")
    
    @classmethod
    def is_active(cls) -> bool:
        return cls._is_active
    
    @classmethod
    def start(cls, browser_config: dict, on_ready: Callable = None, on_error: Callable[[str], None] = None):
        """Start automation session."""
        if cls._is_active:
            cls._emit_status("warning", "Automatización ya está activa")
            return
        
        def start_thread():
            try:
                cls._is_active = True
                
                # === STEP 1: Hibernate IDE + Language Server ===
                cls._emit_status("hibernating", "▶ Hibernando IDE...")
                if ProcessManager.hibernate_antigravity():
                    cls._emit_status("hibernated", "✓ IDE + Language Server hibernado")
                else:
                    cls._emit_status("info", "No se encontró IDE para hibernar")
                
                # === STEP 2: Boost current Python process ===
                cls._emit_status("boosting", "Asignando prioridad HIGH a script...")
                if ProcessManager.boost_current_process():
                    cls._emit_status("boosted", f"✓ Script Python → HIGH (PID {os.getpid()})")
                
                # === STEP 3: Launch browser with Selenium ===
                cls._emit_status("launching", "Abriendo navegador Selenium...")
                
                driver = cls._launch_browser(browser_config)
                if not driver:
                    raise Exception("No se pudo iniciar el navegador")
                
                cls._driver = driver
                
                # === STEP 4: Boost ChromeDriver ===
                try:
                    chromedriver_pid = driver.service.process.pid
                    cls._chromedriver_pid = chromedriver_pid
                    if ProcessManager._set_priority(chromedriver_pid, HIGH_PRIORITY_CLASS):
                        cls._emit_status("boosted", f"✓ ChromeDriver → HIGH (PID {chromedriver_pid})")
                except Exception as e:
                    cls._emit_status("warning", f"ChromeDriver PID no disponible: {e}")
                
                # === STEP 5: Start browser children monitor ===
                cls._start_browser_monitor()
                
                # === STEP 6: Navigate to login URL if enabled ===
                login_url = browser_config.get("login_url", "")
                if browser_config.get("login_enabled", False) and login_url:
                    cls._emit_status("navigating", f"Navegando a {login_url[:50]}...")
                    driver.get(login_url)
                    # Wait for page to load
                    cls._wait_for_page_ready(driver)
                    cls._emit_status("navigated", "✓ Página cargada")
                
                # === STEP 7: Inject test script ===
                cls._emit_status("injecting", "Inyectando script de prueba...")
                cls._inject_test_script(driver)
                cls._emit_status("ready", "✓ Automatización activa")
                
                if on_ready:
                    on_ready()
                
                # === STEP 8: Monitor browser close ===
                cls._monitor_browser_close()
                
            except Exception as e:
                error_msg = str(e)
                cls._emit_status("error", f"✗ Error: {error_msg}")
                cls._cleanup()
                if on_error:
                    on_error(error_msg)
        
        thread = threading.Thread(target=start_thread, daemon=True)
        thread.start()
    
    @classmethod
    def _launch_browser(cls, config: dict):
        """Launch browser with Selenium using BrowserConfig."""
        try:
            import undetected_chromedriver as uc
            
            browser_path = config.get("browser_path", "")
            browser_name = config.get("browser_name", "")
            
            # Build BrowserConfig object
            use_profile = config.get("use_profile", False)
            profile_name = config.get("profile_name", "Default")
            
            # Get user-data-dir path (NOT the profile folder itself)
            user_data_dir = ""
            if use_profile:
                user_data_dir = get_browser_profiles_path(browser_name, browser_path)
                if user_data_dir:
                    cls._emit_status("info", f"Profile path: {user_data_dir}")
            
            browser_cfg = BrowserConfig(
                use_user_profile=use_profile,
                user_profile_path=user_data_dir if user_data_dir else "",
                user_profile_name=profile_name,
                page_load_timeout=120,
            )
            
            # Build options using existing system
            options = build_chrome_options(browser_cfg, browser_path)
            
            # Launch
            driver = uc.Chrome(options=options, use_subprocess=True)
            driver.set_page_load_timeout(120)
            
            return driver
            
        except ImportError:
            raise Exception("undetected-chromedriver no instalado")
        except Exception as e:
            raise Exception(f"Error al lanzar navegador: {e}")
    
    @classmethod
    def _wait_for_page_ready(cls, driver, timeout: int = 30):
        """Wait for page to be ready (document.body exists)."""
        start = time.time()
        while (time.time() - start) < timeout:
            try:
                ready = driver.execute_script(
                    "return document.readyState === 'complete' && document.body !== null"
                )
                if ready:
                    return True
            except Exception:
                pass
            time.sleep(0.3)
        return False
    
    @classmethod
    def _start_browser_monitor(cls):
        """Monitor and boost browser child processes."""
        cls._should_monitor = True
        cls._browser_pids = []
        
        def monitor():
            if not cls._chromedriver_pid:
                return
            
            start_time = time.time()
            while cls._should_monitor and (time.time() - start_time) < 15:
                try:
                    descendants = ProcessManager.get_all_descendants(cls._chromedriver_pid)
                    
                    for pid in descendants:
                        if pid not in cls._browser_pids:
                            name = ProcessManager._get_process_name(pid)
                            if name and ProcessManager._set_priority(pid, HIGH_PRIORITY_CLASS):
                                cls._browser_pids.append(pid)
                                cls._emit_status("boosted", f"🚀 {name} → HIGH (PID {pid})")
                    
                    time.sleep(1.0)
                except Exception as e:
                    print(f"[SeleniumBooster] Monitor error: {e}")
                    break
            
            cls._emit_status("info", f"Monitor finalizado. {len(cls._browser_pids)} procesos boosted.")
        
        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
    
    @classmethod
    def _inject_test_script(cls, driver):
        """Inject test script from file."""
        # Load script from file
        script_path = os.path.join(SCRIPT_DIR, "injectedJS", "test_handshake.js")
        
        if os.path.exists(script_path):
            with open(script_path, "r", encoding="utf-8") as f:
                script = f.read()
            cls._emit_status("info", f"Script cargado: {script_path}")
        else:
            # Fallback inline script
            cls._emit_status("warning", f"Script no encontrado: {script_path}, usando inline")
            script = """
            (function() {
                function waitForBody(cb, max) {
                    var start = Date.now();
                    (function check() {
                        if (document.body) { cb(); }
                        else if (Date.now() - start < max) { setTimeout(check, 100); }
                    })();
                }
                waitForBody(function() {
                    var card = document.createElement('div');
                    card.id = 'autoforms-handshake-card';
                    card.innerHTML = '<div style="position:fixed;top:20px;right:20px;background:#1a1a2e;color:#fff;padding:16px;border-radius:8px;z-index:2147483647;font-family:system-ui;box-shadow:0 4px 20px rgba(0,0,0,0.3);"><b>🤖 AutoForms</b><br><span style=\\'color:#4ecdc4\\'>✓ Conexión establecida</span></div>';
                    document.body.appendChild(card);
                    window.__autoforms_handshake = { status: 'OK', timestamp: Date.now() };
                    console.log('[AutoForms] Handshake: OK');
                }, 10000);
            })();
            """
        
        try:
            driver.execute_script(script)
            
            # Wait and verify handshake
            time.sleep(0.5)
            handshake = driver.execute_script("return window.__autoforms_handshake")
            if handshake and handshake.get("status") == "OK":
                cls._emit_status("handshake", "✓ Handshake recibido")
            else:
                cls._emit_status("warning", "Handshake no confirmado")
        except Exception as e:
            cls._emit_status("warning", f"Inyección: {e}")
    
    @classmethod
    def _monitor_browser_close(cls):
        """Monitor if browser is closed externally."""
        def monitor():
            while cls._is_active and cls._driver:
                try:
                    _ = cls._driver.current_url
                    time.sleep(1.0)
                except Exception:
                    cls._emit_status("closed", "Navegador cerrado externamente")
                    cls.stop()
                    break
        
        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
    
    @classmethod
    def stop(cls):
        """Stop automation and restore IDE."""
        if not cls._is_active:
            return
        
        cls._emit_status("stopping", "■ Deteniendo automatización...")
        cls._should_monitor = False
        
        if cls._driver:
            try:
                cls._driver.quit()
                cls._emit_status("closed", "✓ Navegador cerrado")
            except Exception:
                pass
            cls._driver = None
        
        cls._emit_status("waking", "Despertando IDE...")
        if ProcessManager.wake_antigravity():
            cls._emit_status("woken", "✓ IDE + Language Server → HIGH")
        
        cls._cleanup()
        cls._emit_status("stopped", "● Automatización detenida")
    
    @classmethod
    def _cleanup(cls):
        cls._is_active = False
        cls._driver = None
        cls._chromedriver_pid = None
        cls._browser_pids = []
        cls._should_monitor = False
