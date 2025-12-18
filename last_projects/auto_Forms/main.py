"""
MS Forms Automation - Unified Entry Point
Starts FastAPI server and opens browser
"""
import sys
import os
import subprocess
import threading
import time
import socket

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_ROOT)

from config.settings import SERVER, BROWSER


def find_available_port(start_port: int, end_port: int) -> int:
    """Find an available port in the given range."""
    for port in range(start_port, end_port + 1):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No available port found in range {start_port}-{end_port}")


def find_browser_path() -> str:
    """Find the preferred browser executable."""
    preferred = BROWSER.get("preferred", "default")
    
    # Check if custom path is specified
    custom_path = BROWSER.get(f"{preferred}_path")
    if custom_path and os.path.exists(custom_path):
        return custom_path
    
    # Common paths for Windows
    browser_paths = {
        "brave": [
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ],
        "chrome": [
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe"),
        ],
        "edge": [
            os.path.expandvars(r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe"),
        ],
    }
    
    # Try to find preferred browser
    if preferred in browser_paths:
        for path in browser_paths[preferred]:
            if os.path.exists(path):
                return path
    
    # Fallback: try all browsers
    for browser, paths in browser_paths.items():
        for path in paths:
            if os.path.exists(path):
                print(f"⚠️  {preferred} not found, using {browser}")
                return path
    
    # Ultimate fallback: use default system browser
    return None


def open_browser(url: str):
    """Open the URL in the preferred browser."""
    browser_path = find_browser_path()
    
    if browser_path:
        # Open in specific browser with new window
        try:
            subprocess.Popen(
                [browser_path, "--new-window", url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"🌐 Opened in {BROWSER.get('preferred', 'browser')}")
            return
        except Exception as e:
            print(f"⚠️  Failed to open browser: {e}")
    
    # Fallback to default browser
    import webbrowser
    webbrowser.open(url)
    print("🌐 Opened in default browser")


def run_server(port: int):
    """Run FastAPI server."""
    import uvicorn
    from server.app import app
    
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        reload=False
    )
    server = uvicorn.Server(config)
    server.run()


def main():
    """Main entry point."""
    print("=" * 50)
    print("  🚀 MS Forms Automation")
    print("=" * 50)
    print()
    
    # Find available port
    try:
        port_range = SERVER.get("port_range", (8000, 8010))
        primary_port = SERVER.get("port", 8000)
        
        # Try primary port first
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", primary_port))
                port = primary_port
        except OSError:
            port = find_available_port(port_range[0], port_range[1])
            print(f"⚠️  Port {primary_port} busy, using {port}")
        
    except RuntimeError as e:
        print(f"❌ {e}")
        return 1
    
    url = f"http://127.0.0.1:{port}"
    print(f"📡 Starting server on {url}")
    print()
    
    # Start server in background thread
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()
    
    # Wait for server to start
    print("⏳ Waiting for server...")
    max_wait = 10
    for i in range(max_wait * 10):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect(("127.0.0.1", port))
                break
        except ConnectionRefusedError:
            time.sleep(0.1)
    else:
        print("❌ Server failed to start")
        return 1
    
    print("✅ Server running!")
    print()
    
    # Open browser
    open_browser(url)
    
    print("-" * 50)
    print("  Press Ctrl+C to stop the server")
    print("-" * 50)
    print()
    
    try:
        # Keep main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print()
        print("👋 Shutting down...")
        return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
