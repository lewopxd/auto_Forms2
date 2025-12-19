#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0 (FormFlow)
File: main.py
Created: 2025-12-16
Author: @lewopxd

Description:
Main entry point for the FormFlow application.
Uses multiprocessing for instant splash screen while
the webview loads in a child process.
============================================
"""

import sys
import multiprocessing
import time


def main():
    """
    Main entry point - runs in parent process.
    Shows splash screen immediately while webview loads in child.
    
    If PERSISTENT_WEBVIEW_DEV is enabled:
    - Check if dev server is running
    - If yes, send reload command and exit
    - If no, launch dev server in new console
    """
    
    # CRITICAL: multiprocessing requires freeze_support on Windows
    multiprocessing.freeze_support()
    
    # --- Minimal imports in parent process for speed ---
    import ctypes
    from pathlib import Path
    
    # Add src to path
    src_dir = Path(__file__).parent
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))
    
    # DPI Awareness (must be before any window creation)
    if sys.platform == 'win32':
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass
    
    # --- Check for Persistent WebView Dev Mode ---
    from core.config import PERSISTENT_WEBVIEW_DEV
    
    if PERSISTENT_WEBVIEW_DEV:
        from core.dev_client import is_dev_server_running, send_command, launch_dev_server, wait_for_server
        
        print("[Main] Persistent WebView Dev Mode enabled")
        
        running, port = is_dev_server_running()
        
        if running:
            # Server exists - send reload command
            print(f"[Main] Dev server found on port {port}, sending reload...")
            success, response = send_command("RELOAD", port)
            if success:
                print(f"[Main] Reload successful: {response}")
            else:
                print(f"[Main] Reload failed: {response}")
            return 0
        else:
            # No server running - launch it
            print("[Main] Dev server not running, launching...")
            if launch_dev_server():
                print("[Main] Dev server launched, waiting for it to be ready...")
                # Only wait for socket server (webview may take longer)
                if wait_for_server(timeout=10.0, wait_for_webview=False):
                    print("[Main] Dev server is ready!")
                else:
                    print("[Main] Warning: Timeout waiting for dev server")
            else:
                print("[Main] Failed to launch dev server, falling back to normal mode")
                # Fall through to normal startup
            return 0
    
    # --- Normal Mode (PERSISTENT_WEBVIEW_DEV = False) ---
    
    # --- Single Instance Check (fast, no heavy imports) ---
    from core.single_instance import SingleInstanceLock, show_already_running_dialog
    from core.config import APP_NAME
    
    lock = SingleInstanceLock(APP_NAME)
    if not lock.acquire():
        show_already_running_dialog(APP_NAME)
        return 1
    
    try:
        # --- Create IPC primitives ---
        log_queue = multiprocessing.Queue()
        ready_event = multiprocessing.Event()
        
        # --- FIRST: Create splash screen (must be before child starts) ---
        from core.splash import SplashScreen
        splash = SplashScreen(log_queue)
        splash.create()  # Creates tkinter window immediately
        
        # --- THEN: Start child process (runs webview) ---
        child = multiprocessing.Process(
            target=_run_webview_process,
            args=(log_queue, ready_event),
            daemon=False
        )
        child.start()
        
        # --- Run splash mainloop until ready ---
        splash.run(ready_event, child)
        
        # --- Wait for child to finish ---
        child.join()
        
        return 0
        
    except KeyboardInterrupt:
        print("\n[Main] Interrupted by user")
        return 0
    except Exception as e:
        print(f"[Main] Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        lock.release()



def _run_webview_process(log_queue: multiprocessing.Queue, 
                         ready_event: multiprocessing.Event):
    """
    Runs in child process - handles all heavy imports and webview.
    """
    start_time = time.time()
    
    def send_status(text: str):
        """Send status update to splash."""
        try:
            log_queue.put({"type": "status", "text": text})
        except Exception:
            pass
    
    def send_progress(value: float):
        """Send progress update (0.0 to 1.0)."""
        try:
            log_queue.put({"type": "progress", "value": value})
        except Exception:
            pass
    
    def send_done():
        """Signal splash to close."""
        try:
            log_queue.put({"type": "done"})
        except Exception:
            pass
    
    try:
        # --- Phase 1: Core imports ---
        send_status("Loading core modules...")
        send_progress(0.10)
        
        from pathlib import Path
        import ctypes
        import uuid
        
        src_dir = Path(__file__).parent
        if str(src_dir) not in sys.path:
            sys.path.insert(0, str(src_dir))
        
        send_progress(0.15)
        
        # --- Phase 2: Logger and Config ---
        send_status("Initializing configuration...")
        
        from core.config import (
            APP_NAME, APP_VERSION, DEBUG_MODE, UNIQUE_URL, DEFAULT_WINDOW
        )
        from core.logger import Logger
        
        Logger.initialize(level="DEBUG", colors=True)
        Logger.info(f"[Child] Starting {APP_NAME} v{APP_VERSION}")
        
        send_progress(0.25)
        
        # --- Phase 3: Storage ---
        send_status("Loading saved settings...")
        
        from core.storage import AppStorage
        storage = AppStorage(APP_NAME)
        
        if not storage.was_closed_properly():
            Logger.warn("[Child] Previous session did not close properly")
        storage.mark_improper_close()
        
        window_state = storage.get_window_state()
        is_maximized = window_state.get('maximized', False)
        
        send_progress(0.35)
        
        # --- Phase 4: pywebview import (SLOW) ---
        send_status("Loading WebView engine...")
        
        import_start = time.time()
        import webview
        import_time = (time.time() - import_start) * 1000
        
        Logger.info(f"[Child] WebView imported in {import_time:.0f}ms")
        send_progress(0.55)
        
        # --- Phase 5: Bridge setup ---
        send_status("Setting up bridge...")
        
        from bridge.bridge_api import BridgeAPI
        from bridge.handlers.system_handlers import register_system_handlers
        
        send_progress(0.65)
        
        # --- Phase 6: Create window ---
        send_status("Creating window...")
        
        ui_path = src_dir / "ui" / "index.html"
        if not ui_path.exists():
            raise FileNotFoundError(f"UI not found: {ui_path}")
        
        url = str(ui_path)
        if UNIQUE_URL:
            url = f"{url}?id={uuid.uuid4()}"
        
        window = webview.create_window(
            title=DEFAULT_WINDOW['title'],
            url=url,
            width=window_state.get('width', DEFAULT_WINDOW['width']),
            height=window_state.get('height', DEFAULT_WINDOW['height']),
            x=window_state.get('x'),
            y=window_state.get('y'),
            resizable=True,
            frameless=False,
            min_size=(DEFAULT_WINDOW['min_width'], DEFAULT_WINDOW['min_height']),
            background_color=DEFAULT_WINDOW['background_color'],
            confirm_close=False,
            hidden=True  # Start hidden
        )
        
        send_progress(0.75)
        
        # --- Phase 7: Initialize bridge ---
        send_status("Connecting bridge...")
        
        window_api = WindowAPI(window, storage)
        if is_maximized:
            window_api._is_maximized = True
        
        def on_ready():
            """Called when JS handshake completes."""
            elapsed = time.time() - start_time
            Logger.info(f"[Child] Handshake complete in {elapsed:.2f}s")
            
            if window_api._is_maximized:
                window.maximize()
        
        bridge = BridgeAPI(window, storage, on_ready_callback=on_ready)
        register_system_handlers(bridge)
        
        # Register Excel handlers
        from bridge.handlers.excel_handlers import register_excel_handlers
        register_excel_handlers(bridge)
        
        # Register Project handlers (autosave)
        from bridge.handlers.project_handlers import ProjectHandler
        ProjectHandler(bridge)
        
        # Register Selenium handlers (browser detection, form records)
        from bridge.handlers.selenium_handlers import register_selenium_handlers
        register_selenium_handlers(bridge)
        
        window.expose(
            bridge.handle_message,
            window_api.minimize,
            window_api.maximize,
            window_api.close
        )
        
        send_progress(0.85)
        
        # --- Phase 8: Window events ---
        def on_loaded():
            """Called when window is loaded - show window and close splash."""
            Logger.info("[Child] Window loaded, showing...")
            window.show()  # Show window now (webview is running)
            # Signal splash to close
            ready_event.set()
        
        def on_closing():
            Logger.info("[Child] Closing...")
            window_api.save_and_close(from_event=True)
        
        def on_maximized():
            window_api._is_maximized = True
        
        def on_restored():
            window_api._is_maximized = False
        
        window.events.loaded += on_loaded
        window.events.closing += on_closing
        window.events.maximized += on_maximized
        window.events.restored += on_restored
        
        send_status("Starting application...")
        send_progress(0.95)
        
        # --- Start webview ---
        # debug=False to prevent devtools from opening automatically
        Logger.info(f"[Child] Starting webview")
        webview.start(debug=True)
        
        Logger.info("[Child] Application closed")
        
    except Exception as e:
        print(f"[Child] Fatal error: {e}")
        import traceback
        traceback.print_exc()
        send_status(f"Error: {e}")
        # Signal splash to close on error
        ready_event.set()
        sys.exit(1)


class WindowAPI:
    """Window management API."""
    
    def __init__(self, window, storage):
        self.window = window
        self.storage = storage
        self._is_maximized = False
    
    def minimize(self):
        self.window.minimize()
        return True
    
    def maximize(self):
        if self._is_maximized:
            self.window.restore()
        else:
            self.window.maximize()
        return True
    
    def close(self):
        self.save_and_close(from_event=False)
        return True
    
    def save_and_close(self, from_event=False):
        if self.storage:
            try:
                from core.config import DEFAULT_WINDOW
                window_state = {
                    'width': self.window.width or DEFAULT_WINDOW['width'],
                    'height': self.window.height or DEFAULT_WINDOW['height'],
                    'x': self.window.x,
                    'y': self.window.y,
                    'maximized': self._is_maximized
                }
                self.storage.finalize_session_save(window_state)
            except Exception as e:
                print(f"[WindowAPI] Error saving: {e}")
        
        if not from_event:
            self.window.destroy()


if __name__ == '__main__':
    sys.exit(main())
