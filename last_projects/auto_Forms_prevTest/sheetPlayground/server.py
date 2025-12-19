"""
Servidor HTTP simple para Excel Split View
Ejecutar: python server.py
Abrir: http://localhost:8000
"""

import http.server
import socketserver
import os
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"🚀 Servidor iniciado en {url}")
        print("   Presiona Ctrl+C para detener")
        
        # Abrir navegador automáticamente
        #webbrowser.open(url)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Servidor detenido")
