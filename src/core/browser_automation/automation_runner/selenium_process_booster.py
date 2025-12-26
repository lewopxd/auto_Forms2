#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Selenium Process Booster
============================================
Gestión de recursos para automatización Selenium.
- Hiberna IDE + Language Server
- Asigna HIGH priority a procesos Selenium
- Maneja flujo de login y automation bar
"""
import sys
import os
import json
import threading
import time
from typing import Optional, Callable, List, Dict, Any

# Add paths for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
SRC_DIR = os.path.dirname(CORE_DIR)
sys.path.insert(0, SRC_DIR)

from core.process_manager import ProcessManager, HIGH_PRIORITY_CLASS
from core.browser_automation.browser_settings import BrowserConfig, build_chrome_options
from core.browser_automation.profile_utils import get_browser_profiles_path
from core.browser_automation.automation_runner.form_executor import FormExecutor, ExecutorConfig


class SeleniumProcessBooster:
    """Gestión de recursos para automatización Selenium."""
    
    _is_active: bool = False
    _driver = None
    _chromedriver_pid: Optional[int] = None
    _browser_pids: List[int] = []
    _should_monitor: bool = False
    _should_poll: bool = False
    _on_status_change: Optional[Callable[[str, str], None]] = None
    _package_data: Dict[str, Any] = {}
    _executor: Optional[FormExecutor] = None
    _executor_thread: Optional[threading.Thread] = None
    _executor_config: Dict[str, Any] = {}
    
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
        """Start automation session with login flow and automation bar."""
        if cls._is_active:
            cls._emit_status("warning", "Automatización ya está activa")
            return
        
        def start_thread():
            try:
                cls._is_active = True
                
                # === STEP 1: Load and parse package file ===
                package_path = browser_config.get("package_path", "")
                if package_path and os.path.exists(package_path):
                    cls._emit_status("loading", f"Cargando paquete...")
                    cls._package_data = cls._load_package(package_path)
                    cls._emit_status("loaded", f"✓ Paquete: {cls._package_data.get('filename', 'N/A')}")
                else:
                    cls._package_data = {"filename": "Sin paquete", "totalRows": 0, "totalQuestions": 0, "formUrl": ""}
                
                # === STEP 2: Hibernate IDE + Language Server ===
                cls._emit_status("hibernating", "▶ Hibernando IDE...")
                if ProcessManager.hibernate_antigravity():
                    cls._emit_status("hibernated", "✓ IDE + Language Server hibernado")
                else:
                    cls._emit_status("info", "No se encontró IDE para hibernar")
                
                # === STEP 3: Boost current Python process ===
                cls._emit_status("boosting", "Asignando prioridad HIGH a script...")
                if ProcessManager.boost_current_process():
                    cls._emit_status("boosted", f"✓ Script Python → HIGH (PID {os.getpid()})")
                
                # === STEP 4: Capture existing browser PIDs BEFORE launch ===
                initial_browser_pids = cls._get_browser_pids()
                cls._emit_status("info", f"Navegadores existentes: {len(initial_browser_pids)} procesos")
                
                # === STEP 5: Launch browser with Selenium ===
                cls._emit_status("launching", "Abriendo navegador Selenium...")
                
                driver = cls._launch_browser(browser_config)
                if not driver:
                    raise Exception("No se pudo iniciar el navegador")
                
                cls._driver = driver
                
                # === STEP 6: Boost ChromeDriver ===
                try:
                    chromedriver_pid = driver.service.process.pid
                    cls._chromedriver_pid = chromedriver_pid
                    if ProcessManager._set_priority(chromedriver_pid, HIGH_PRIORITY_CLASS):
                        cls._emit_status("boosted", f"✓ ChromeDriver → HIGH (PID {chromedriver_pid})")
                except Exception as e:
                    cls._emit_status("warning", f"ChromeDriver PID no disponible: {e}")
                
                # === STEP 7: Start browser monitor with initial PIDs ===
                cls._start_browser_monitor(initial_browser_pids)
                
                # === STEP 8: Handle Login Flow OR Direct to Form ===
                login_enabled = browser_config.get("login_enabled", False)
                login_url = browser_config.get("login_url", "")
                
                # Use alt URL if enabled, otherwise use package URL
                use_alt_url = browser_config.get("use_alt_url", False)
                alt_url = browser_config.get("alt_url", "")
                form_url = alt_url if (use_alt_url and alt_url) else cls._package_data.get("formUrl", "")
                
                if login_enabled and login_url:
                    # Login flow
                    cls._emit_status("navigating", f"Navegando a login...")
                    driver.get(login_url)
                    cls._wait_for_page_ready(driver)
                    cls._emit_status("login", "✓ Página de login cargada")
                    
                    # Inject login UI and wait for confirmation
                    cls._emit_status("injecting", "Inyectando UI de login...")
                    login_result = cls._handle_login_flow(driver)
                    
                    if not login_result:
                        cls._emit_status("cancelled", "Login cancelado por usuario")
                        cls.stop()
                        return
                    
                    cls._emit_status("login_done", "✓ Login completado")
                    
                    # Navigate to form URL
                    if form_url:
                        cls._emit_status("navigating", f"Navegando al formulario...")
                        driver.get(form_url)
                        cls._wait_for_page_ready(driver)
                else:
                    # Direct to form URL
                    if form_url:
                        cls._emit_status("navigating", f"Navegando al formulario...")
                        driver.get(form_url)
                        cls._wait_for_page_ready(driver)
                
                # === STEP 9: Inject Automation Bar ===
                cls._emit_status("injecting", "Inyectando barra de automatización...")
                cls._inject_automation_bar(driver)
                cls._emit_status("ready", "✓ Automatización activa")
                
                if on_ready:
                    on_ready()
                
                # === STEP 10: Start command polling ===
                cls._start_command_polling(driver)
                
                # === STEP 11: Monitor browser close ===
                cls._monitor_browser_close()
                
            except Exception as e:
                error_msg = str(e)
                cls._emit_status("error", f"✗ Error: {error_msg}")
                import traceback
                traceback.print_exc()
                cls._cleanup()
                if on_error:
                    on_error(error_msg)
        
        thread = threading.Thread(target=start_thread, daemon=True)
        thread.start()
    
    @classmethod
    def _load_package(cls, package_path: str) -> dict:
        """Load and parse .afpkg file."""
        try:
            with open(package_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Extract info
            filename = os.path.basename(package_path)
            instructions = data.get("instructions", {})
            resolved_rows = data.get("resolvedRows", [])
            
            # Count questions from all pages (pages is a LIST, not dict)
            total_questions = 0
            pages = instructions.get("pages", [])
            for page in pages:
                questions = page.get("questions", [])
                total_questions += len(questions)

            
            return {
                "filename": filename,
                "totalRows": len(resolved_rows),
                "totalQuestions": total_questions,
                "formUrl": instructions.get("url", ""),
                "data": data
            }
        except Exception as e:
            print(f"[SeleniumBooster] Error loading package: {e}")
            return {"filename": os.path.basename(package_path), "totalRows": 0, "totalQuestions": 0, "formUrl": ""}
    
    @classmethod
    def _launch_browser(cls, config: dict):
        """Launch browser with Selenium using BrowserConfig."""
        try:
            import undetected_chromedriver as uc
            
            browser_path = config.get("browser_path", "")
            browser_name = config.get("browser_name", "")
            
            use_profile = config.get("use_profile", False)
            profile_name = config.get("profile_name", "Default")
            
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
            
            options = build_chrome_options(browser_cfg, browser_path)
            
            driver = uc.Chrome(options=options, use_subprocess=True)
            driver.set_page_load_timeout(120)
            
            return driver
            
        except ImportError:
            raise Exception("undetected-chromedriver no instalado")
        except Exception as e:
            raise Exception(f"Error al lanzar navegador: {e}")
    
    @classmethod
    def _wait_for_page_ready(cls, driver, timeout: int = 30):
        """Wait for page to be ready."""
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
    def _get_browser_pids(cls) -> set:
        """Get all current browser PIDs using psutil."""
        browser_patterns = ['chrome', 'chromium', 'brave', 'msedge', 'ungoogled']
        try:
            import psutil
            pids = set()
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    name = proc.info['name'].lower()
                    if any(p in name for p in browser_patterns):
                        pids.add(proc.info['pid'])
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return pids
        except ImportError:
            return set()
    
    @classmethod
    def _start_browser_monitor(cls, initial_pids: set):
        """Monitor and boost browser processes by detecting NEW processes."""
        cls._should_monitor = True
        cls._browser_pids = []
        
        def monitor():
            start_time = time.time()
            while cls._should_monitor and (time.time() - start_time) < 20:
                try:
                    current_pids = cls._get_browser_pids()
                    new_pids = current_pids - initial_pids
                    
                    for pid in new_pids:
                        if pid not in cls._browser_pids:
                            name = ProcessManager._get_process_name(pid)
                            if name and ProcessManager._set_priority(pid, HIGH_PRIORITY_CLASS):
                                cls._browser_pids.append(pid)
                                cls._emit_status("boosted", f"🚀 {name} → HIGH (PID {pid})")
                    
                    time.sleep(0.5)
                except Exception as e:
                    print(f"[SeleniumBooster] Monitor error: {e}")
                    break
            
            cls._emit_status("info", f"Monitor finalizado. {len(cls._browser_pids)} procesos boosted.")
        
        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
    
    @classmethod
    def _handle_login_flow(cls, driver) -> bool:
        """Handle login flow: inject UI, wait for user confirmation, auto-reinject on navigation."""
        cls._should_poll = True
        last_url = driver.current_url
        
        # Inject login UI
        cls._inject_login_ui(driver)
        
        # Poll for commands and handle page changes
        while cls._should_poll and cls._is_active:
            try:
                # Check for page navigation (URL changed)
                current_url = driver.current_url
                if current_url != last_url:
                    cls._emit_status("info", "Página navegada, reinyectando login UI...")
                    time.sleep(0.5)
                    cls._wait_for_page_ready(driver)
                    cls._inject_login_ui(driver)
                    last_url = current_url
                
                # Check for commands
                commands = cls._get_commands(driver)
                for cmd in commands:
                    cmd_type = cmd.get("type", "")
                    if cmd_type == "login_done":
                        cls._should_poll = False
                        return True
                    elif cmd_type == "cancel":
                        cls._should_poll = False
                        return False
                
                time.sleep(0.5)
                
            except Exception as e:
                # Browser might be navigating
                time.sleep(0.5)
        
        return False
    
    @classmethod
    def _inject_login_ui(cls, driver):
        """Inject login UI script."""
        script_path = os.path.join(SCRIPT_DIR, "injectedJS", "login_ui.js")
        
        try:
            if os.path.exists(script_path):
                with open(script_path, "r", encoding="utf-8") as f:
                    script = f.read()
                driver.execute_script(script)
                cls._emit_status("injected", "✓ Login UI inyectado")
            else:
                cls._emit_status("warning", f"Script no encontrado: {script_path}")
        except Exception as e:
            cls._emit_status("warning", f"Error inyectando login UI: {e}")
    
    @classmethod
    def _inject_automation_bar(cls, driver):
        """Inject automation bar with package info and full data."""
        script_path = os.path.join(SCRIPT_DIR, "injectedJS", "automation_bar.js")
        
        try:
            # Set package info before injecting - NOW WITH FULL DATA
            pkg = cls._package_data
            full_data = pkg.get("data", {})
            instructions = full_data.get("instructions", {})
            resolved_rows = full_data.get("resolvedRows", [])
            
            driver.execute_script("""
                window.__autoforms_package = {
                    filename: arguments[0],
                    totalRows: arguments[1],
                    totalQuestions: arguments[2],
                    formUrl: arguments[3],
                    instructions: arguments[4],
                    resolvedRows: arguments[5]
                };
            """, 
                pkg.get("filename", ""), 
                pkg.get("totalRows", 0), 
                pkg.get("totalQuestions", 0), 
                pkg.get("formUrl", ""),
                instructions,
                resolved_rows
            )
            
            if os.path.exists(script_path):
                with open(script_path, "r", encoding="utf-8") as f:
                    script = f.read()
                driver.execute_script(script)
                cls._emit_status("injected", "✓ Automation Bar inyectado")
            else:
                cls._emit_status("warning", f"Script no encontrado: {script_path}")
        except Exception as e:
            cls._emit_status("warning", f"Error inyectando bar: {e}")
    
    @classmethod
    def _get_commands(cls, driver) -> list:
        """Get pending commands from injected UI."""
        try:
            commands = driver.execute_script("""
                const cmds = window.__autoforms_commands || [];
                window.__autoforms_commands = [];
                return cmds;
            """)
            return commands or []
        except Exception:
            return []
    
    @classmethod
    def _start_command_polling(cls, driver):
        """Start polling for commands from automation bar."""
        cls._should_poll = True
        
        def poll():
            while cls._should_poll and cls._is_active:
                try:
                    commands = cls._get_commands(driver)
                    for cmd in commands:
                        cls._handle_bar_command(cmd)
                    time.sleep(0.5)
                except Exception:
                    time.sleep(1.0)
        
        thread = threading.Thread(target=poll, daemon=True)
        thread.start()
    
    @classmethod
    def _handle_bar_command(cls, cmd: dict):
        """Handle command from automation bar."""
        cmd_type = cmd.get("type", "")
        cls._emit_status("command", f"Comando recibido: {cmd_type}")
        
        if cmd_type == "start":
            cls._start_executor()
        elif cmd_type == "pause":
            if cls._executor:
                cls._executor.pause()
        elif cmd_type == "stop":
            if cls._executor:
                cls._executor.stop()
            # NO cerrar navegador, solo detener executor
            # cls.stop() se omite - el usuario puede cerrar manualmente o usar otro comando
        elif cmd_type == "next":
            if cls._executor:
                cls._executor.next_row()
        elif cmd_type == "jump_to_row":
            row_index = cmd.get("rowIndex", 0)
            if cls._executor:
                cls._executor.jump_to_row(row_index)
        elif cmd_type == "mode":
            one_by_one = cmd.get("oneByOne", False)
            cls._executor_config["oneByOne"] = one_by_one
            if cls._executor:
                cls._executor.config.one_by_one_mode = one_by_one
        elif cmd_type == "config_update":
            config_data = cmd.get("config", {})
            cls._update_executor_config(config_data)
    
    @classmethod
    def _update_executor_config(cls, config_data: dict):
        """Update executor configuration from UI."""
        # Map UI config to executor config format
        cls._executor_config.update({
            "delayBetweenRowsRandom": config_data.get("randomDelay", False),
            "delayBetweenRowsMs": int(config_data.get("fixedDelay", 2) * 1000),
            "delayBetweenRowsMinMs": int(config_data.get("minDelay", 1) * 1000),
            "delayBetweenRowsMaxMs": int(config_data.get("maxDelay", 3) * 1000),
            "humanActionsEnabled": config_data.get("humanActionsEnabled", False),
            "typingDelayMinMs": config_data.get("typingDelayMinMs", 30),
            "typingDelayMaxMs": config_data.get("typingDelayMaxMs", 120),
            "overrideDelays": config_data.get("overrideDelays", False),
            "delayMinMs": config_data.get("delayMinMs", 500),
            "delayMaxMs": config_data.get("delayMaxMs", 1500),
            "highlightElements": config_data.get("highlightElements", True),
            "scrollToElement": config_data.get("scrollToElement", True),
            "moveMouseToElement": config_data.get("moveMouseToElement", True),
            "clickQuestionFirst": config_data.get("clickQuestionFirst", True),
            "validateAfterFill": config_data.get("validateAfterFill", True),
        })
        
        if cls._executor:
            cls._executor.update_config(cls._executor_config)
    
    @classmethod
    def _start_executor(cls):
        """Start the form executor in a separate thread."""
        if cls._executor and cls._executor.is_running:
            # Resume if paused
            cls._executor.resume()
            return
        
        if not cls._driver or not cls._package_data:
            cls._emit_status("error", "No hay driver o paquete cargado")
            return
        
        # Create callbacks for UI updates
        def on_action_start(action_info: dict):
            try:
                cls._driver.execute_script(
                    "window.__autoforms_showAction && window.__autoforms_showAction(arguments[0]);",
                    action_info
                )
            except Exception as e:
                print(f"[SeleniumBooster] Action start UI error: {e}")
        
        def on_action_complete(result):
            try:
                state = "success" if result.success else "error"
                cls._driver.execute_script(
                    "window.__autoforms_setActionState && window.__autoforms_setActionState(arguments[0]);",
                    state
                )
            except Exception as e:
                print(f"[SeleniumBooster] Action complete UI error: {e}")
        
        def on_row_complete(row_index: int):
            try:
                cls._driver.execute_script(
                    "window.__autoforms_setCurrentRow && window.__autoforms_setCurrentRow(arguments[0]);",
                    row_index + 1  # Next row
                )
            except Exception as e:
                print(f"[SeleniumBooster] Row complete UI error: {e}")
        
        def on_status_change(status: str, message: str):
            cls._emit_status(status, message)
            try:
                cls._driver.execute_script(
                    "window.__autoforms_updateStatus && window.__autoforms_updateStatus(arguments[0], arguments[1]);",
                    status, message
                )
            except Exception:
                pass
        
        # Create executor
        config = ExecutorConfig.from_dict(cls._executor_config)
        cls._executor = FormExecutor(
            driver=cls._driver,
            package_data=cls._package_data,
            config=config,
            on_action_start=on_action_start,
            on_action_complete=on_action_complete,
            on_row_complete=on_row_complete,
            on_status_change=on_status_change
        )
        
        # Start in thread
        def run_executor():
            try:
                cls._executor.start()
            except Exception as e:
                cls._emit_status("error", f"Error en executor: {e}")
        
        cls._executor_thread = threading.Thread(target=run_executor, daemon=True)
        cls._executor_thread.start()
        cls._emit_status("running", "▶ Automatización iniciada")
    
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
        cls._should_poll = False
        
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
        cls._should_poll = False
        cls._package_data = {}
        cls._executor = None
        cls._executor_thread = None
        cls._executor_config = {}
