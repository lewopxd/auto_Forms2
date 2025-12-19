#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: dev_server.py
Created: 2025-12-18
Author: @lewopxd

Description:
Persistent WebView Dev Server.
Runs as a completely independent process with its own console.
The webview lives inside this process - when browser closes,
the server waits for commands to reopen it.
============================================
"""

import sys
import os
import socket
import threading
import time
import json
import ctypes
import signal
from pathlib import Path
from datetime import datetime

# Add src to path
src_dir = Path(__file__).parent.parent
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))


class DevServerConsole:
    """Colorful console logger for the dev server."""
    
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    
    @staticmethod
    def enable_ansi():
        if sys.platform == 'win32':
            try:
                kernel32 = ctypes.windll.kernel32
                kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            except Exception:
                pass
    
    @staticmethod
    def timestamp():
        return datetime.now().strftime("%H:%M:%S")
    
    @classmethod
    def header(cls, app_name: str, version: str, port: int):
        cls.enable_ansi()
        width = 64
        print()
        print(f"{cls.CYAN}{'═' * width}{cls.RESET}")
        title = f"  🚀 {app_name} Dev Server v{version}"
        print(f"{cls.CYAN}║{cls.BOLD}{cls.WHITE}{title}{cls.RESET}{' ' * (width - len(title) - 2)}{cls.CYAN}║{cls.RESET}")
        port_line = f"  Port: {port} | Press Ctrl+C to quit"
        print(f"{cls.CYAN}║{cls.RESET}{cls.YELLOW}{port_line}{cls.RESET}{' ' * (width - len(port_line) - 2)}{cls.CYAN}║{cls.RESET}")
        print(f"{cls.CYAN}{'═' * width}{cls.RESET}")
        print()
    
    @classmethod
    def info(cls, msg: str):
        print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.GREEN}✓{cls.RESET} {msg}")
    
    @classmethod
    def warn(cls, msg: str):
        print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.YELLOW}⚠{cls.RESET} {msg}")
    
    @classmethod
    def error(cls, msg: str):
        print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.RED}✗{cls.RESET} {msg}")
    
    @classmethod
    def incoming(cls, msg: str):
        print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.BLUE}←{cls.RESET} {msg}")
    
    @classmethod
    def outgoing(cls, msg: str):
        print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.MAGENTA}→{cls.RESET} {msg}")
    
    @classmethod
    def waiting(cls, msg: str = "Waiting for commands...", inline: bool = False):
        """Print waiting status. If inline=True, overwrites the same line."""
        if inline:
            # Use carriage return to overwrite same line
            print(f"\r{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.CYAN}►{cls.RESET} {msg}        ", end='', flush=True)
        else:
            print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.CYAN}►{cls.RESET} {msg}")
    
    @classmethod
    def webview(cls, msg: str):
        print(f"{cls.DIM}[{cls.timestamp()}]{cls.RESET} {cls.WHITE}🌐{cls.RESET} {msg}")


class DevServer:
    """
    Persistent WebView Development Server.
    
    This server manages the webview lifecycle independently.
    When the browser window is closed, the server stays running
    and can recreate the window on demand.
    """
    
    PORT_RANGE_START = 57432
    PORT_RANGE_END = 57532
    PORT_FILE = Path.home() / ".autoforms_dev_port"
    
    def __init__(self):
        self.window = None
        self.server_socket = None
        self.port = None
        self.running = True
        self.webview_ready = False
        self.webview_module = None
        self.console = DevServerConsole
        self.bridge = None
        self.storage = None
        self.window_api = None
        self._window_open = False
        self._pending_open = threading.Event()
        
    def find_available_port(self) -> int:
        for port in range(self.PORT_RANGE_START, self.PORT_RANGE_END):
            try:
                test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                test_socket.settimeout(0.1)
                test_socket.bind(('127.0.0.1', port))
                test_socket.close()
                return port
            except OSError:
                continue
        raise RuntimeError("No available port found")
    
    def save_port(self, port: int):
        try:
            self.PORT_FILE.write_text(json.dumps({
                "port": port,
                "pid": os.getpid(),
                "timestamp": datetime.now().isoformat(),
                "status": "ready"
            }))
        except Exception as e:
            self.console.warn(f"Could not save port: {e}")
    
    def clear_port_file(self):
        try:
            if self.PORT_FILE.exists():
                self.PORT_FILE.unlink()
        except Exception:
            pass
    
    def is_another_instance_running(self) -> tuple[bool, int | None]:
        """
        Check if another dev server instance is already running.
        Returns (is_running, port) tuple.
        """
        if not self.PORT_FILE.exists():
            return False, None
        
        try:
            data = json.loads(self.PORT_FILE.read_text())
            port = data.get("port")
            if not port:
                return False, None
            
            # Try to connect and ping the existing server
            test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            test_socket.settimeout(1.0)
            try:
                test_socket.connect(('127.0.0.1', port))
                test_socket.sendall(b"PING\n")
                response = test_socket.recv(64).decode('utf-8').strip()
                test_socket.close()
                
                if response == "PONG":
                    return True, port
                return False, None
            except (ConnectionRefusedError, socket.timeout, OSError):
                # Server not responding - it's a zombie port file
                self.console.warn(f"Stale port file found (port {port}), cleaning up...")
                self.clear_port_file()
                return False, None
        except Exception as e:
            self.console.warn(f"Error checking for existing instance: {e}")
            return False, None
    
    def disable_close_button(self):
        """Disable X button on console window."""
        if sys.platform == 'win32':
            try:
                hwnd = ctypes.windll.kernel32.GetConsoleWindow()
                if hwnd:
                    hmenu = ctypes.windll.user32.GetSystemMenu(hwnd, False)
                    ctypes.windll.user32.DeleteMenu(hmenu, 0xF060, 0x00000000)
            except Exception:
                pass
    
    def show_console(self):
        """Restore console window from minimized."""
        if sys.platform == 'win32':
            try:
                hwnd = ctypes.windll.kernel32.GetConsoleWindow()
                if hwnd:
                    ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            except Exception:
                pass
    
    def start_socket_server(self):
        self.port = self.find_available_port()
        self.save_port(self.port)
        
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(('127.0.0.1', self.port))
        self.server_socket.listen(5)
        self.server_socket.settimeout(1.0)
        
        def listen_loop():
            while self.running:
                try:
                    conn, addr = self.server_socket.accept()
                    threading.Thread(target=self.handle_connection, args=(conn, addr), daemon=True).start()
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        self.console.error(f"Socket error: {e}")
        
        threading.Thread(target=listen_loop, daemon=True).start()
        self.console.info(f"Socket server started on port {self.port}")
    
    def handle_connection(self, conn: socket.socket, addr):
        try:
            conn.settimeout(10.0)
            data = conn.recv(1024).decode('utf-8').strip()
            
            if not data:
                conn.close()
                return
            
            self.console.incoming(f"Command: {data}")
            response = self.handle_command(data)
            conn.sendall(f"{response}\n".encode('utf-8'))
            self.console.outgoing(f"Response: {response}")
            conn.close()
            
        except Exception as e:
            self.console.error(f"Connection error: {e}")
            try:
                conn.sendall(f"ERROR:{e}\n".encode('utf-8'))
                conn.close()
            except Exception:
                pass
    
    def handle_command(self, cmd: str) -> str:
        cmd = cmd.upper().strip()
        
        if cmd == "PING":
            return "PONG"
        
        elif cmd == "STATUS":
            if self._window_open and self.webview_ready:
                return f"OK:READY:{self.port}"
            elif self._window_open:
                return f"OK:LOADING:{self.port}"
            else:
                return f"OK:CLOSED:{self.port}"
        
        elif cmd == "RELOAD":
            return self.do_reload()
        
        elif cmd == "OPEN":
            return self.do_open()
        
        elif cmd == "QUIT":
            self.running = False
            threading.Thread(target=self.shutdown, daemon=True).start()
            return "OK:SHUTTING_DOWN"
        
        else:
            return f"ERROR:UNKNOWN:{cmd}"
    
    def do_reload(self) -> str:
        """Reload the page or open window if closed."""
        if not self._window_open or not self.window:
            # Window is closed, trigger reopen
            self.console.webview("Window was closed, reopening...")
            self._pending_open.set()
            return "OK:REOPENING"
        
        if not self.webview_ready:
            return "ERROR:NOT_READY"
        
        try:
            self.console.outgoing("Clearing cache & reloading...")
            self.window.evaluate_js("""
                (function() {
                    try { localStorage.clear(); } catch(e) {}
                    try { sessionStorage.clear(); } catch(e) {}
                })();
            """)
            self.window.evaluate_js("location.reload(true);")
            return "OK:RELOADED"
        except Exception as e:
            self.console.error(f"Reload error: {e}")
            return f"ERROR:{e}"
    
    def do_open(self) -> str:
        """Open the browser window if closed."""
        if self._window_open:
            return "OK:ALREADY_OPEN"
        
        self._pending_open.set()
        return "OK:OPENING"
    
    def on_webview_loaded(self):
        self.webview_ready = True
        self._window_open = True
        self.console.webview("Page loaded and ready")
    
    def on_webview_closing(self):
        self.console.webview("Browser closed. Run 'python main.py' to reopen.")
        self._window_open = False
        self.webview_ready = False
    
    def shutdown(self):
        time.sleep(0.3)
        self.running = False
        self.clear_port_file()
        
        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception:
                pass
        
        self.console.info("Server shutdown complete")
        os._exit(0)
    
    def create_window(self):
        """Create and show the webview window."""
        from core.config import APP_NAME, APP_VERSION, DEFAULT_WINDOW, DEBUG_MODE
        from bridge.bridge_api import BridgeAPI
        from bridge.handlers.system_handlers import register_system_handlers
        from bridge.handlers.excel_handlers import register_excel_handlers
        from bridge.handlers.project_handlers import ProjectHandler
        from bridge.handlers.selenium_handlers import register_selenium_handlers
        from core.storage import AppStorage
        
        src_dir = Path(__file__).parent.parent
        ui_path = src_dir / "ui" / "index.html"
        
        if not ui_path.exists():
            self.console.error(f"UI not found: {ui_path}")
            return
        
        self.storage = AppStorage(APP_NAME)
        window_state = self.storage.get_window_state()
        
        self.window = self.webview_module.create_window(
            title=f"{DEFAULT_WINDOW['title']} [DEV]",
            url=str(ui_path),
            width=window_state.get('width', DEFAULT_WINDOW['width']),
            height=window_state.get('height', DEFAULT_WINDOW['height']),
            x=window_state.get('x'),
            y=window_state.get('y'),
            resizable=True,
            frameless=False,
            min_size=(DEFAULT_WINDOW['min_width'], DEFAULT_WINDOW['min_height']),
            background_color=DEFAULT_WINDOW['background_color'],
            confirm_close=False
        )
        
        def on_ready():
            self.console.webview("Bridge handshake complete")
        
        self.bridge = BridgeAPI(self.window, self.storage, on_ready_callback=on_ready)
        register_system_handlers(self.bridge)
        register_excel_handlers(self.bridge)
        ProjectHandler(self.bridge)
        register_selenium_handlers(self.bridge)
        
        class WindowAPI:
            def __init__(api_self, window, storage):
                api_self.window = window
                api_self.storage = storage
                api_self._is_maximized = False
            
            def minimize(api_self):
                api_self.window.minimize()
                return True
            
            def maximize(api_self):
                if api_self._is_maximized:
                    api_self.window.restore()
                else:
                    api_self.window.maximize()
                api_self._is_maximized = not api_self._is_maximized
                return True
            
            def close(api_self):
                api_self.window.destroy()
                return True
        
        self.window_api = WindowAPI(self.window, self.storage)
        
        self.window.expose(
            self.bridge.handle_message,
            self.window_api.minimize,
            self.window_api.maximize,
            self.window_api.close
        )
        
        self.window.events.loaded += self.on_webview_loaded
        self.window.events.closing += self.on_webview_closing
        
        if window_state.get('maximized', False):
            self.window.events.loaded += lambda: self.window.maximize()
        
        self._window_open = True
        self.console.webview("Browser window created")
    
    def run_webview_loop(self):
        """Main webview loop - creates windows on demand."""
        from core.config import DEBUG_MODE
        
        self.console.info("Creating initial browser window...")
        self.create_window()
        
        # Start webview - this blocks until ALL windows are closed
        self.webview_module.start(debug=DEBUG_MODE)
        
        # If we get here, user closed the window
        # Now we wait for OPEN/RELOAD command to restart
        self.console.webview("Webview engine stopped")
        
        while self.running:
            # Silent wait - no log spam
            
            # Wait for pending open signal
            if self._pending_open.wait(timeout=1.0):
                self._pending_open.clear()
                
                if not self.running:
                    break
                
                self.console.webview("Restarting browser window...")
                self.create_window()
                self.webview_module.start(debug=DEBUG_MODE)
                self.console.webview("Webview engine stopped again")
    
    def start(self):
        """Main entry point."""
        from core.config import APP_NAME, APP_VERSION, DEBUG_MODE
        
        # Show immediate startup message - user sees this instantly
        self.console.enable_ansi()
        print(f"\n{self.console.CYAN}══════════════════════════════════════════════════════════════{self.console.RESET}")
        print(f"{self.console.CYAN}║{self.console.BOLD}{self.console.WHITE}  🚀 {APP_NAME} Dev Server v{APP_VERSION} - Starting...{self.console.RESET}")
        print(f"{self.console.CYAN}══════════════════════════════════════════════════════════════{self.console.RESET}\n")
        
        # IMMEDIATELY create a reservation file to prevent race conditions
        # This blocks other instances from starting while we initialize
        my_pid = os.getpid()
        reservation_data = {
            "port": 0,  # Will be updated once socket is ready
            "pid": my_pid,
            "timestamp": datetime.now().isoformat(),
            "status": "starting"
        }
        
        # Check if another instance is already running (or reserving)
        is_running, existing_port = self.is_another_instance_running()
        if is_running:
            self.console.error(f"Another dev server is already running on port {existing_port}!")
            self.console.error("Cannot start a second instance. Use the existing server or close it first.")
            print(f"\n{self.console.YELLOW}Press any key to exit...{self.console.RESET}")
            try:
                import msvcrt
                msvcrt.getch()
            except Exception:
                input()
            return
        
        # Also check for a reservation file (race condition prevention)
        if self.PORT_FILE.exists():
            try:
                existing_data = json.loads(self.PORT_FILE.read_text())
                existing_pid = existing_data.get("pid")
                existing_status = existing_data.get("status")
                
                # If another process is "starting", check if it's still alive
                if existing_status == "starting" and existing_pid and existing_pid != my_pid:
                    # Check if that PID is still running
                    try:
                        os.kill(existing_pid, 0)  # Signal 0 = check if process exists
                        # Process exists - another instance is starting
                        self.console.error(f"Another dev server (PID {existing_pid}) is starting up!")
                        self.console.error("Wait for it to finish or close it first.")
                        print(f"\n{self.console.YELLOW}Press any key to exit...{self.console.RESET}")
                        try:
                            import msvcrt
                            msvcrt.getch()
                        except Exception:
                            input()
                        return
                    except (OSError, ProcessLookupError):
                        # Process is dead - we can take over
                        self.console.warn(f"Stale reservation file from dead PID {existing_pid}, cleaning up...")
            except Exception as e:
                self.console.warn(f"Error reading reservation file: {e}")
        
        # Write our reservation immediately
        try:
            self.PORT_FILE.write_text(json.dumps(reservation_data))
            self.console.info(f"Reservation created (PID {my_pid})")
        except Exception as e:
            self.console.error(f"Could not create reservation file: {e}")
            return
        
        # Disable close button
        self.disable_close_button()
        
        # Start socket server
        self.console.info("Starting socket server...")
        self.start_socket_server()
        self.console.info(f"Socket server ready on port {self.port}")
        
        # Import webview (heavy)
        self.console.info("Loading WebView engine...")
        import webview
        self.webview_module = webview
        self.console.info("WebView module loaded (EdgeChromium)")
        
        # Signal handlers
        def signal_handler(sig, frame):
            self.console.warn("Ctrl+C received, shutting down...")
            self.shutdown()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Run main webview loop
        self.run_webview_loop()
        
        # Cleanup
        self.console.info("Dev server exiting")
        self.shutdown()


def main():
    if sys.platform == 'win32':
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass
    
    server = DevServer()
    server.start()


if __name__ == "__main__":
    main()
