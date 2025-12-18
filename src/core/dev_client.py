#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: dev_client.py
Created: 2025-12-18
Author: @lewopxd

Description:
Client module to communicate with the persistent 
WebView dev server.
============================================
"""

import sys
import os
import socket
import json
import subprocess
from pathlib import Path


PORT_FILE = Path.home() / ".autoforms_dev_port"
DEFAULT_PORT = 57432


def get_server_info() -> dict | None:
    """
    Get the dev server info from the port file.
    Returns dict with port and pid, or None if not found.
    """
    try:
        if PORT_FILE.exists():
            data = json.loads(PORT_FILE.read_text())
            return data
    except Exception:
        pass
    return None


def is_dev_server_running() -> tuple[bool, int | None]:
    """
    Check if the dev server is running.
    Returns (is_running, port).
    """
    info = get_server_info()
    
    if not info:
        return False, None
    
    port = info.get("port", DEFAULT_PORT)
    
    # Try to connect
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        sock.connect(('127.0.0.1', port))
        
        # Send ping
        sock.sendall(b"PING\n")
        response = sock.recv(1024).decode('utf-8').strip()
        sock.close()
        
        if response == "PONG":
            return True, port
        else:
            return False, None
            
    except (socket.error, socket.timeout, ConnectionRefusedError):
        # Server not responding, clean up stale port file
        try:
            PORT_FILE.unlink()
        except Exception:
            pass
        return False, None


def send_command(cmd: str, port: int = None) -> tuple[bool, str]:
    """
    Send a command to the dev server.
    Returns (success, response_message).
    """
    if port is None:
        info = get_server_info()
        port = info.get("port", DEFAULT_PORT) if info else DEFAULT_PORT
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect(('127.0.0.1', port))
        
        sock.sendall(f"{cmd}\n".encode('utf-8'))
        response = sock.recv(1024).decode('utf-8').strip()
        sock.close()
        
        if response.startswith("OK"):
            return True, response
        else:
            return False, response
            
    except socket.timeout:
        return False, "ERROR:TIMEOUT"
    except ConnectionRefusedError:
        return False, "ERROR:CONNECTION_REFUSED"
    except Exception as e:
        return False, f"ERROR:{e}"


def launch_dev_server() -> bool:
    """
    Launch the dev server in a new, completely independent console window.
    This console is NOT a child of the current process.
    Returns True if launched successfully.
    """
    try:
        # Path to dev_server.py
        dev_server_path = Path(__file__).parent / "dev_server.py"
        
        if not dev_server_path.exists():
            print(f"[DevClient] Error: dev_server.py not found at {dev_server_path}")
            return False
        
        # Get the Python executable
        python_exe = sys.executable
        
        if sys.platform == 'win32':
            # On Windows, use CREATE_NEW_CONSOLE to make truly independent process
            CREATE_NEW_CONSOLE = 0x00000010
            CREATE_NEW_PROCESS_GROUP = 0x00000200
            
            # Don't minimize - let user see the console immediately
            subprocess.Popen(
                [python_exe, str(dev_server_path)],
                creationflags=CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP,
                close_fds=True,
                start_new_session=True
            )
        else:
            # On Linux/Mac, use setsid to create new session
            subprocess.Popen(
                [python_exe, str(dev_server_path)],
                start_new_session=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        
        print("[DevClient] Dev server launched in new window")
        return True
        
    except Exception as e:
        print(f"[DevClient] Error launching dev server: {e}")
        import traceback
        traceback.print_exc()
        return False


def wait_for_server(timeout: float = 10.0, wait_for_webview: bool = True) -> bool:
    """
    Wait for the dev server to become ready.
    If wait_for_webview is True, also waits for webview to be loaded.
    Returns True if server is ready within timeout.
    """
    import time
    start = time.time()
    
    while time.time() - start < timeout:
        running, port = is_dev_server_running()
        if running:
            if not wait_for_webview:
                return True
            
            # Check if webview is ready
            success, response = send_command("STATUS", port)
            if success and "READY" in response:
                return True
        
        time.sleep(0.5)
    
    return False


def main():
    """Command-line interface for dev client."""
    if len(sys.argv) < 2:
        print("Usage: dev_client.py <command>")
        print("Commands: ping, reload, quit, status, launch")
        return 1
    
    cmd = sys.argv[1].upper()
    
    if cmd == "LAUNCH":
        running, port = is_dev_server_running()
        if running:
            print(f"Dev server already running on port {port}")
            return 0
        else:
            if launch_dev_server():
                print("Waiting for server to start...")
                if wait_for_server():
                    print("Dev server is ready!")
                    return 0
                else:
                    print("Timeout waiting for server")
                    return 1
            return 1
    
    running, port = is_dev_server_running()
    if not running:
        print("Dev server is not running")
        return 1
    
    success, response = send_command(cmd, port)
    print(f"Response: {response}")
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
