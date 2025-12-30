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
from core.browser_automation.automation_runner.modules.automation_result_storage import AutomationResultStorage


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
    _previous_session: Optional[AutomationResultStorage] = None
    _start_from_row: int = 0  # Row index to start from (for resume)
    
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
                
                # === STEP 9: Check for Previous Session ===
                try:
                    package_path = browser_config.get("package_path", "")
                    if cls._check_previous_session(package_path):
                        # Show resume dialog and wait for response
                        resume_info = cls._previous_session.get_resume_info()
                        response = cls._inject_resume_dialog(driver, resume_info)
                        
                        if response == "resume":
                            cls._start_from_row = resume_info["nextRow"] - 1  # Convert to 0-indexed
                            cls._emit_status("info", f"✓ Continuando desde fila {resume_info['nextRow']}")
                        else:
                            cls._start_from_row = 0
                            cls._previous_session = None
                            cls._emit_status("info", "Iniciando desde el principio")
                    else:
                        cls._start_from_row = 0
                except Exception as e:
                    cls._emit_status("warning", f"Error verificando sesión previa: {e}")
                    cls._start_from_row = 0
                    cls._previous_session = None
                
                # === STEP 10: Inject Automation Bar ===
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
        """Handle login flow: try auto-login first, then inject UI and wait for user confirmation."""
        cls._should_poll = True
        last_url = driver.current_url
        
        # ================================================================
        # STEP 1: Try auto-login first (click on saved account card)
        # ================================================================
        try:
            from .modules.login_detector import LoginDetector, LoginConfig
            
            login_detector = LoginDetector(driver, LoginConfig(verbose_logging=True))
            
            if login_detector.is_login_page():
                cls._emit_status("info", "Intentando auto-login...")
                auto_result = login_detector.try_auto_login(timeout_ms=15000)
                
                if auto_result.logged_in:
                    cls._emit_status("success", "✓ Auto-login exitoso")
                    return True
                else:
                    cls._emit_status("info", "Auto-login no disponible, mostrando UI de login...")
        except Exception as e:
            cls._emit_status("warning", f"Error en auto-login: {e}")
        
        # ================================================================
        # STEP 2: Fall back to manual login with UI injection
        # ================================================================
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
                    
                    # Check if we're now on a non-login page (login succeeded)
                    login_indicators = ['login.microsoftonline', 'login.live', 'login.microsoft']
                    if not any(ind in current_url for ind in login_indicators):
                        cls._emit_status("success", "✓ Login detectado (redirección)")
                        return True
                    
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
    def _check_previous_session(cls, package_path: str) -> bool:
        """
        Check for a previous session that can be resumed.
        
        Returns:
            True if user wants to resume, False to start fresh or no session found
        """
        if not package_path:
            return False
        
        cls._emit_status("info", "Buscando sesión previa...")
        previous = AutomationResultStorage.find_previous_session(package_path)
        
        if not previous:
            cls._emit_status("info", "No se encontró sesión previa")
            return False
        
        resume_info = previous.get_resume_info()
        cls._emit_status("info", f"Sesión previa encontrada: {resume_info['lastRowProcessed']}/{resume_info['totalRows']} filas")
        
        # Store for later use
        cls._previous_session = previous
        
        return True
    
    @classmethod
    def _inject_resume_dialog(cls, driver, resume_info: dict) -> Optional[str]:
        """
        Inject resume dialog and wait for user response.
        
        Returns:
            'resume' to continue from last row, 'start' to start fresh, None if cancelled
        """
        # Create and inject the resume dialog using execute_script arguments
        dialog_js = '''
        (function(info) {
            const ROOT_ID = '__autoforms_resume_dialog__';
            if (document.getElementById(ROOT_ID)) return;
            
            window.__autoforms_resume_response = null;
            
            const overlay = document.createElement('div');
            overlay.id = ROOT_ID;
            overlay.style.cssText = "position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;background:rgba(0,0,0,0.5)!important;backdrop-filter:blur(4px)!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;";
            
            overlay.innerHTML = '<div style="background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.25);width:420px;max-width:90vw;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;overflow:hidden;">' +
                '<div style="padding:16px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;">' +
                    '<div style="font-size:16px;font-weight:600;">📋 Sesión Anterior Detectada</div>' +
                    '<div style="font-size:12px;opacity:0.9;margin-top:4px;">' + (info.packageName || 'Paquete') + '</div>' +
                '</div>' +
                '<div style="padding:20px;">' +
                    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;">' +
                        '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
                            '<span style="color:#64748b;font-size:12px;">Última fila procesada:</span>' +
                            '<span style="font-weight:600;color:#1e293b;">' + info.lastRowProcessed + ' de ' + info.totalRows + '</span>' +
                        '</div>' +
                        '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
                            '<span style="color:#64748b;font-size:12px;">Éxitos / Errores:</span>' +
                            '<span style="font-weight:600;"><span style="color:#22c55e;">' + info.successCount + ' ✓</span> / <span style="color:#ef4444;">' + info.errorCount + ' ✗</span></span>' +
                        '</div>' +
                        '<div style="display:flex;justify-content:space-between;">' +
                            '<span style="color:#64748b;font-size:12px;">Pendientes:</span>' +
                            '<span style="font-weight:600;color:#f59e0b;">' + info.pendingCount + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;flex-direction:column;gap:10px;">' +
                        '<button id="__resume_btn" style="padding:12px 16px;background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">▶ Continuar desde fila ' + info.nextRow + '</button>' +
                        '<button id="__start_btn" style="padding:12px 16px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">🔄 Empezar desde el inicio</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
            
            document.body.appendChild(overlay);
            
            document.getElementById('__resume_btn').onclick = function() {
                window.__autoforms_resume_response = 'resume';
                overlay.remove();
            };
            
            document.getElementById('__start_btn').onclick = function() {
                window.__autoforms_resume_response = 'start';
                overlay.remove();
            };
        })(arguments[0]);
        '''
        
        try:
            driver.execute_script(dialog_js, resume_info)
            cls._emit_status("info", "Esperando respuesta del usuario...")
            
            # Poll for response
            start_time = time.time()
            timeout = 300  # 5 minutos máximo
            
            while time.time() - start_time < timeout:
                try:
                    response = driver.execute_script("return window.__autoforms_resume_response;")
                    if response:
                        return response
                except Exception:
                    pass
                time.sleep(0.3)
            
            # Timeout - remove dialog and return None
            try:
                driver.execute_script("""
                    var el = document.getElementById('__autoforms_resume_dialog__');
                    if (el) el.remove();
                """)
            except Exception:
                pass
            
            return None
            
        except Exception as e:
            cls._emit_status("warning", f"Error en diálogo de reanudación: {e}")
            return None

    
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
        elif cmd_type == "highlight_question":
            question_key = cmd.get("questionKey", "")
            cls._highlight_question_on_page(question_key)
        elif cmd_type == "excel_export_request":
            control_columns = cmd.get("controlColumns", [])
            cls._export_to_excel(control_columns)
    
    @classmethod
    def _update_executor_config(cls, config_data: dict):
        """Update executor configuration from UI."""
        # Map UI config to executor config format
        cls._executor_config.update({
            # ═══ Sección 1: Tiempos Globales ═══
            "delayBetweenRowsRandom": config_data.get("randomDelay", False),
            "delayBetweenRowsMs": config_data.get("fixedDelay", 2000),
            "delayBetweenRowsMinMs": config_data.get("minDelay", 1000),
            "delayBetweenRowsMaxMs": config_data.get("maxDelay", 3000),
            "overrideDelays": config_data.get("overrideDelays", False),
            "delayMinMs": config_data.get("delayMinMs", 500),
            "delayMaxMs": config_data.get("delayMaxMs", 1500),
            
            # ═══ Sección 2: Human Actions ═══
            "humanActionsEnabled": config_data.get("humanActionsEnabled", True),
            "scrollToElement": config_data.get("scrollToElement", True),
            "moveMouseToElement": config_data.get("moveMouseToElement", True),
            "clickQuestionFirst": config_data.get("clickQuestionFirst", True),
            
            # ═══ Sección 3: Validación ═══
            "validateAfterFill": config_data.get("validateAfterFill", True),
            "validateAfterSelect": config_data.get("validateAfterSelect", True),
            
            # ═══ Sección 4: Fill Config ═══
            "shortTextMethod": config_data.get("shortTextMethod", "keyByKey"),
            "typingDelayMinMs": config_data.get("typingDelayMinMs", 30),
            "typingDelayMaxMs": config_data.get("typingDelayMaxMs", 120),
            "autoDetectLongText": config_data.get("autoDetectLongText", True),
            "longTextThreshold": config_data.get("longTextThreshold", 30),
            "longTextMethod": config_data.get("longTextMethod", "sendKeys"),
            "veryLongTextThreshold": config_data.get("veryLongTextThreshold", 100),
            "veryLongTextMethod": config_data.get("veryLongTextMethod", "jsValue"),
            
            # ═══ Sección 5: Visual Feedback ═══
            "highlightElements": config_data.get("highlightElements", True),
            
            # ═══ Sección 6: Delays Especiales ═══
            "branchDelayMs": config_data.get("branchDelayMs", 1500),
            "pageChangeDelayMs": config_data.get("pageChangeDelayMs", 2000),
            
            # ═══ Sección 7: Post Submit Actions ═══
            "postSubmitEnabled": config_data.get("postSubmitEnabled", False),
            "postSubmitTimeoutMs": config_data.get("postSubmitTimeoutMs", 60000),
            
            # ═══ Sección 8: Manejo de Errores ═══
            "errorHandling": config_data.get("errorHandling", "continue"),
        })
        
        if cls._executor:
            cls._executor.update_config(cls._executor_config)
    
    @classmethod
    def _highlight_question_on_page(cls, question_key: str):
        """Highlight a question on the page by scrolling and applying glow effect."""
        if not cls._driver or not question_key:
            return
        
        try:
            # Get question info from package data
            full_data = cls._package_data.get("data", {})
            instructions = full_data.get("instructions", {})
            pages = instructions.get("pages", [])
            
            target_question = None
            for page in pages:
                for q in page.get("questions", []):
                    if q.get("key") == question_key:
                        target_question = q
                        break
                if target_question:
                    break
            
            if not target_question:
                cls._emit_status("warning", f"Pregunta {question_key} no encontrada en paquete")
                return
            
            # Get selector from question
            selenium_info = target_question.get("selenium", {})
            full_selector = selenium_info.get("fullSelector", "")
            
            if not full_selector:
                cls._emit_status("warning", f"Sin selector para {question_key}")
                return
            
            # Execute scroll and highlight in browser
            cls._driver.execute_script("""
                const selector = arguments[0];
                const color = arguments[1];
                
                // Find element
                let element = null;
                try {
                    element = document.querySelector(selector);
                } catch(e) {
                    console.log('[Highlight] Invalid selector:', selector);
                }
                
                if (!element) {
                    // Try parent question container
                    const match = selector.match(/QuestionId_[a-zA-Z0-9]+/);
                    if (match) {
                        const containerId = match[0].replace('_r', '_');
                        element = document.querySelector('[id*="' + containerId + '"]');
                    }
                }
                
                if (!element) {
                    console.log('[Highlight] Element not found for:', selector);
                    return;
                }
                
                // Scroll to element (centered in viewport)
                element.scrollIntoView({behavior: 'smooth', block: 'center'});
                
                // Wait for scroll then highlight
                setTimeout(() => {
                    // Remove any existing highlight
                    document.querySelectorAll('.__autoforms_temp_highlight').forEach(el => {
                        el.classList.remove('__autoforms_temp_highlight');
                    });
                    
                    // Add highlight style if not exists
                    if (!document.getElementById('__autoforms_temp_highlight_style')) {
                        const style = document.createElement('style');
                        style.id = '__autoforms_temp_highlight_style';
                        style.textContent = `
                            .__autoforms_temp_highlight {
                                outline: 3px solid ${color} !important;
                                box-shadow: 0 0 20px 8px ${color}80, 
                                            0 0 40px 15px ${color}40 !important;
                                animation: __autoforms_temp_pulse 1s ease-in-out 3 !important;
                                transition: all 0.3s ease !important;
                            }
                            @keyframes __autoforms_temp_pulse {
                                0%, 100% { box-shadow: 0 0 20px 8px ${color}80, 0 0 40px 15px ${color}40; }
                                50% { box-shadow: 0 0 30px 12px ${color}99, 0 0 60px 20px ${color}60; }
                            }
                        `;
                        document.head.appendChild(style);
                    }
                    
                    // Apply highlight
                    element.classList.add('__autoforms_temp_highlight');
                    
                    // Remove after 3 seconds
                    setTimeout(() => {
                        element.classList.remove('__autoforms_temp_highlight');
                    }, 3000);
                }, 350);
            """, full_selector, "#667eea")
            
            cls._emit_status("info", f"✓ Pregunta {question_key} resaltada")
            
        except Exception as e:
            cls._emit_status("warning", f"Error resaltando pregunta: {e}")
    
    @classmethod
    def _export_to_excel(cls, control_columns: list):
        """Export automation results to Excel with openpyxl."""
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter
            import tkinter as tk
            from tkinter import filedialog
            from datetime import datetime
            
            cls._emit_status("info", "Preparando exportación Excel...")
            
            # Get data from result storage if available
            full_data = cls._package_data.get("data", {})
            resolved_rows = full_data.get("resolvedRows", [])
            instructions = full_data.get("instructions", {})
            package_name = cls._package_data.get("filename", "unknown.afpkg").replace(".afpkg", "")
            
            if not resolved_rows:
                cls._emit_status("warning", "No hay datos de filas para exportar")
                return
            
            # Create workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "Resultados"
            
            # Define styles
            header_fill = PatternFill(start_color="667eea", end_color="667eea", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF")
            success_fill = PatternFill(start_color="dcfce7", end_color="dcfce7", fill_type="solid")
            error_fill = PatternFill(start_color="fee2e2", end_color="fee2e2", fill_type="solid")
            pending_fill = PatternFill(start_color="fef3c7", end_color="fef3c7", fill_type="solid")
            thin_border = Border(
                left=Side(style='thin'),
                right=Side(style='thin'),
                top=Side(style='thin'),
                bottom=Side(style='thin')
            )
            
            # Build headers: # | Control Columns | Estado | Resultado
            headers = ["#"]
            for col in control_columns:
                headers.append(col.get("text", col.get("key", "?")))
            headers.extend(["Estado", "Mensaje"])
            
            # Write headers
            for col_idx, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col_idx, value=header)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.border = thin_border
            
            # Freeze header row
            ws.freeze_panes = "A2"
            
            # Write data rows
            for row_idx, row_data in enumerate(resolved_rows, 2):
                answers = row_data.get("answers", {})
                
                # Row number
                cell = ws.cell(row=row_idx, column=1, value=row_idx - 1)
                cell.alignment = Alignment(horizontal="center")
                cell.border = thin_border
                
                # Control columns values
                col_offset = 2
                for col in control_columns:
                    key = col.get("key", "")
                    value = answers.get(key, "")
                    if isinstance(value, dict):
                        value = value.get("text", str(value))
                    cell = ws.cell(row=row_idx, column=col_offset, value=str(value) if value else "")
                    cell.border = thin_border
                    col_offset += 1
                
                # Get result status from result_storage if available
                status = "pending"
                message = ""
                
                # Estado column
                status_cell = ws.cell(row=row_idx, column=col_offset, value=status.upper())
                status_cell.alignment = Alignment(horizontal="center")
                status_cell.border = thin_border
                
                if status == "success":
                    status_cell.fill = success_fill
                elif status == "error":
                    status_cell.fill = error_fill
                else:
                    status_cell.fill = pending_fill
                
                # Mensaje column
                msg_cell = ws.cell(row=row_idx, column=col_offset + 1, value=message)
                msg_cell.border = thin_border
            
            # Auto-adjust column widths
            for col_idx in range(1, len(headers) + 1):
                ws.column_dimensions[get_column_letter(col_idx)].width = 18
            
            # Open save dialog
            root = tk.Tk()
            root.withdraw()  # Hide main window
            root.wm_attributes('-topmost', True)  # Bring to front
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            default_name = f"{package_name}_export_{timestamp}.xlsx"
            
            file_path = filedialog.asksaveasfilename(
                parent=root,
                defaultextension=".xlsx",
                filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")],
                initialfile=default_name,
                title="Guardar exportación Excel"
            )
            
            root.destroy()
            
            if file_path:
                wb.save(file_path)
                cls._emit_status("success", f"✓ Excel exportado: {os.path.basename(file_path)}")
            else:
                cls._emit_status("info", "Exportación cancelada")
            
        except ImportError:
            cls._emit_status("error", "openpyxl no instalado. Añade 'openpyxl' a requirements.txt")
        except Exception as e:
            cls._emit_status("error", f"Error exportando Excel: {e}")
            import traceback
            traceback.print_exc()

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
        
        # If resuming from previous session, set starting row
        if cls._start_from_row > 0:
            cls._executor.jump_to_row(cls._start_from_row)
            cls._emit_status("info", f"Executor configurado para iniciar en fila {cls._start_from_row + 1}")
        
        # Set up UI re-injection callback (called after PostSubmit returns to form)
        def reinject_ui():
            if cls._driver:
                cls._inject_automation_bar(cls._driver)
        
        cls._executor.on_ui_reinject = reinject_ui
        
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
        cls._previous_session = None
        cls._start_from_row = 0
