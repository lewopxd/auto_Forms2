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


class SeleniumProcessBooster:
    """
    Gestión de recursos para automatización Selenium.
    
    Flujo:
    1. Hibernar IDE + Language Server
    2. Boost script Python actual
    3. Abrir navegador y boost ChromeDriver + hijos
    4. Al terminar: despertar IDE con HIGH priority
    """
    
    _is_active: bool = False
    _driver = None
    _chromedriver_pid: Optional[int] = None
    _browser_pids: List[int] = []
    _boost_thread: Optional[threading.Thread] = None
    _should_monitor: bool = False
    _on_status_change: Optional[Callable[[str, str], None]] = None
    
    @classmethod
    def set_status_callback(cls, callback: Callable[[str, str], None]):
        """Set callback for status updates: callback(status, message)."""
        cls._on_status_change = callback
    
    @classmethod
    def _emit_status(cls, status: str, message: str):
        """Emit status update."""
        print(f"[SeleniumBooster] {message}")
        if cls._on_status_change:
            try:
                cls._on_status_change(status, message)
            except Exception as e:
                print(f"[SeleniumBooster] Callback error: {e}")
    
    @classmethod
    def is_active(cls) -> bool:
        """Check if automation is currently active."""
        return cls._is_active
    
    @classmethod
    def start(cls, browser_config: dict, on_ready: Callable = None, on_error: Callable[[str], None] = None):
        """
        Start automation session.
        
        Args:
            browser_config: Dict with browser_name, browser_path, use_profile, profile_name, login_url
            on_ready: Callback when browser is ready
            on_error: Callback on error
        """
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
                    cls._emit_status("warning", f"No se pudo obtener PID de ChromeDriver: {e}")
                
                # === STEP 5: Start browser children monitor ===
                cls._start_browser_monitor()
                
                # === STEP 6: Navigate to login URL if enabled ===
                login_url = browser_config.get("login_url", "")
                if browser_config.get("login_enabled", False) and login_url:
                    cls._emit_status("navigating", f"Navegando a {login_url[:50]}...")
                    driver.get(login_url)
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
        """Launch browser with Selenium."""
        try:
            import undetected_chromedriver as uc
            
            options = uc.ChromeOptions()
            
            # Set browser binary
            browser_path = config.get("browser_path", "")
            if browser_path and os.path.exists(browser_path):
                options.binary_location = browser_path
            
            # Profile settings
            if config.get("use_profile", False):
                profile_path = config.get("profile_path", "")
                profile_name = config.get("profile_name", "Default")
                if profile_path:
                    options.add_argument(f"--user-data-dir={profile_path}")
                    if profile_name and profile_name != "Default":
                        options.add_argument(f"--profile-directory={profile_name}")
            
            # Anti-detection settings
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("--disable-infobars")
            
            driver = uc.Chrome(options=options, use_subprocess=True)
            driver.set_page_load_timeout(120)
            
            return driver
            
        except ImportError:
            raise Exception("undetected-chromedriver no instalado")
        except Exception as e:
            raise Exception(f"Error al lanzar navegador: {e}")
    
    @classmethod
    def _start_browser_monitor(cls):
        """Monitor and boost browser child processes."""
        cls._should_monitor = True
        cls._browser_pids = []
        
        def monitor():
            if not cls._chromedriver_pid:
                return
            
            # Get descendants of ChromeDriver
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
        
        cls._boost_thread = threading.Thread(target=monitor, daemon=True)
        cls._boost_thread.start()
    
    @classmethod
    def _inject_test_script(cls, driver):
        """Inject test script that shows handshake card."""
        script = """
        (function() {
            // Remove existing card if any
            const existing = document.getElementById('autoforms-card');
            if (existing) existing.remove();
            
            // Create handshake card
            const card = document.createElement('div');
            card.id = 'autoforms-card';
            card.innerHTML = `
                <div style="position:fixed; top:20px; right:20px; 
                            background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            color:#fff; padding:16px 24px; border-radius:12px;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                            z-index:2147483647; font-family:system-ui;
                            border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-weight:600; font-size:14px; margin-bottom:8px;">
                        🤖 AutoForms Automation
                    </div>
                    <div style="color:#4ecdc4; font-size:12px;">
                        ✓ Conexión establecida
                    </div>
                </div>
            `;
            document.body.appendChild(card);
            
            // Set handshake flag
            window.__autoforms_handshake = { status: 'OK', timestamp: Date.now() };
            console.log('[AutoForms] Handshake: OK');
            
            return 'OK';
        })();
        """
        try:
            result = driver.execute_script(script)
            if result == 'OK':
                cls._emit_status("handshake", "✓ Handshake recibido")
        except Exception as e:
            cls._emit_status("warning", f"No se pudo inyectar script: {e}")
    
    @classmethod
    def _monitor_browser_close(cls):
        """Monitor if browser is closed externally."""
        def monitor():
            while cls._is_active and cls._driver:
                try:
                    # Try to get URL - fails if browser closed
                    _ = cls._driver.current_url
                    time.sleep(1.0)
                except Exception:
                    # Browser was closed
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
        
        # Close browser
        if cls._driver:
            try:
                cls._driver.quit()
                cls._emit_status("closed", "✓ Navegador cerrado")
            except Exception:
                pass
            cls._driver = None
        
        # Wake IDE + Language Server with HIGH priority
        cls._emit_status("waking", "Despertando IDE...")
        if ProcessManager.wake_antigravity():
            cls._emit_status("woken", "✓ IDE + Language Server → HIGH")
        
        cls._cleanup()
        cls._emit_status("stopped", "● Automatización detenida")
    
    @classmethod
    def _cleanup(cls):
        """Clean up state."""
        cls._is_active = False
        cls._driver = None
        cls._chromedriver_pid = None
        cls._browser_pids = []
        cls._should_monitor = False
