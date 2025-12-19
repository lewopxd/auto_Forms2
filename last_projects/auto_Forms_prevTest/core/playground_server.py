"""
Playground Server - Serves sheetPlayground files on localhost
"""
import http.server
import socketserver
import os
import threading
import webbrowser


class PlaygroundServer:
    """Threaded HTTP server for playground files."""
    
    _instance = None
    _server = None
    _thread = None
    _port = 8000
    
    @classmethod
    def get_playground_dir(cls):
        """Get the sheetPlayground directory path."""
        return os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'sheetPlayground'
        )
    
    @classmethod
    def start(cls, port=8000, open_browser=True):
        """Start the playground server."""
        if cls._server is not None:
            # Server already running, just open browser
            if open_browser:
                webbrowser.open(f"http://localhost:{cls._port}")
            return cls._port
        
        cls._port = port
        playground_dir = cls.get_playground_dir()
        
        if not os.path.exists(playground_dir):
            raise FileNotFoundError(f"Playground directory not found: {playground_dir}")
        
        # Create handler with custom directory
        handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(
            *args, directory=playground_dir, **kwargs
        )
        
        # Try to start server, increment port if busy
        for attempt in range(10):
            try:
                cls._server = socketserver.TCPServer(("", cls._port), handler)
                cls._server.allow_reuse_address = True
                break
            except OSError:
                cls._port += 1
        else:
            raise RuntimeError("Could not find available port")
        
        # Run server in background thread
        cls._thread = threading.Thread(target=cls._server.serve_forever, daemon=True)
        cls._thread.start()
        
        # Open browser
        if open_browser:
            webbrowser.open(f"http://localhost:{cls._port}")
        
        return cls._port
    
    @classmethod
    def stop(cls):
        """Stop the playground server."""
        if cls._server:
            cls._server.shutdown()
            cls._server = None
            cls._thread = None
    
    @classmethod
    def is_running(cls):
        """Check if server is running."""
        return cls._server is not None
    
    @classmethod
    def get_url(cls):
        """Get the server URL."""
        if cls._server:
            return f"http://localhost:{cls._port}"
        return None
