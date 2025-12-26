"""
AutoForms - Servidor de Prueba para UI Inyectada
============================================================
Servidor de desarrollo para probar la barra de automatización inyectada
sin necesidad de usar Selenium. Crea un HTML de prueba, inyecta el script
y lo sirve en localhost para iteración rápida de diseño.

Uso:
    python server_test.py
    python server_test.py --port 8080
    python server_test.py --package "ruta/al/archivo.afpkg"
"""

import http.server
import socketserver
import json
import os
import argparse
from pathlib import Path

# Configuración
DEFAULT_PORT = 5500
SCRIPT_DIR = Path(__file__).parent.resolve()

# Datos de paquete de prueba por defecto
DEFAULT_PACKAGE_DATA = {
    "filename": "automation_test_package.afpkg",
    "totalRows": 62,
    "totalQuestions": 21,
    "formUrl": "https://forms.office.com/example"
}


def load_package_data(package_path: str = None) -> dict:
    """Carga datos del paquete .afpkg si se proporciona, o usa datos de prueba."""
    if package_path and os.path.exists(package_path):
        try:
            with open(package_path, 'r', encoding='utf-8') as f:
                pkg = json.load(f)
            
            # Extraer información relevante del paquete
            meta = pkg.get('meta', {})
            instructions = pkg.get('instructions', {})
            resolved_rows = pkg.get('resolvedRows', [])
            
            # Contar preguntas totales
            total_questions = 0
            for page in instructions.get('pages', []):
                total_questions += len(page.get('questions', []))
            
            return {
                "filename": os.path.basename(package_path),
                "totalRows": len(resolved_rows),
                "totalQuestions": total_questions,
                "formUrl": instructions.get('url', ''),
                "_fullPackage": pkg  # Paquete completo para debugging
            }
        except Exception as e:
            print(f"⚠️  Error cargando paquete: {e}")
            print("   Usando datos de prueba por defecto...")
    
    return DEFAULT_PACKAGE_DATA


def load_injection_script() -> str:
    """Carga el script automation_bar.js"""
    script_path = SCRIPT_DIR / "automation_bar.js"
    if script_path.exists():
        with open(script_path, 'r', encoding='utf-8') as f:
            return f.read()
    return "console.error('[AutoForms] Script automation_bar.js no encontrado');"


def generate_test_html(package_data: dict) -> str:
    """Genera el HTML de prueba con el script inyectado."""
    
    # Cargar el script de la barra
    automation_bar_script = load_injection_script()
    
    # Preparar datos del paquete para inyección (sin _fullPackage si existe)
    pkg_for_injection = {k: v for k, v in package_data.items() if k != '_fullPackage'}
    
    html = f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AutoForms - Test UI Inyectada</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        
        .test-container {{
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 48px 64px;
            max-width: 600px;
            text-align: center;
            box-shadow: 
                0 25px 50px -12px rgba(0, 0, 0, 0.25),
                0 0 0 1px rgba(255, 255, 255, 0.1);
        }}
        
        .logo {{
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 20px;
            margin: 0 auto 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
        }}
        
        .logo svg {{
            width: 48px;
            height: 48px;
            color: white;
        }}
        
        h1 {{
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 16px;
        }}
        
        .subtitle {{
            color: #6b7280;
            font-size: 16px;
            margin-bottom: 32px;
        }}
        
        .info-card {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
        }}
        
        .info-card h2 {{
            font-size: 14px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 16px;
        }}
        
        .info-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            text-align: left;
        }}
        
        .info-item {{
            display: flex;
            flex-direction: column;
            gap: 4px;
        }}
        
        .info-label {{
            font-size: 12px;
            color: #94a3b8;
            font-weight: 500;
        }}
        
        .info-value {{
            font-size: 15px;
            color: #1e293b;
            font-weight: 600;
        }}
        
        .actions {{
            display: flex;
            gap: 12px;
            justify-content: center;
        }}
        
        .btn {{
            padding: 12px 24px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
        }}
        
        .btn-primary {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
        }}
        
        .btn-primary:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }}
        
        .btn-secondary {{
            background: white;
            color: #667eea;
            border: 2px solid #667eea;
        }}
        
        .btn-secondary:hover {{
            background: #f8fafc;
        }}
        
        .console-hint {{
            margin-top: 24px;
            padding: 12px 16px;
            background: #1e293b;
            border-radius: 8px;
            color: #94a3b8;
            font-family: 'Fira Code', 'Consolas', monospace;
            font-size: 12px;
            text-align: left;
        }}
        
        .console-hint code {{
            color: #22c55e;
        }}
        
        .status-indicator {{
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 100px;
            font-size: 13px;
            color: #047857;
            margin-bottom: 24px;
        }}
        
        .status-dot {{
            width: 8px;
            height: 8px;
            background: #22c55e;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }}
        
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.5; }}
        }}
    </style>
</head>
<body>
    <div class="test-container">
        <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
        </div>
        
        <h1>AutoForms UI Test</h1>
        <p class="subtitle">Entorno de prueba para la barra de automatización inyectada</p>
        
        <div class="status-indicator">
            <div class="status-dot"></div>
            Script Inyectado Correctamente
        </div>
        
        <div class="info-card">
            <h2>📦 Paquete Cargado</h2>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Archivo</span>
                    <span class="info-value">{package_data.get('filename', 'N/A')}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Total Filas</span>
                    <span class="info-value">{package_data.get('totalRows', 0)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Preguntas</span>
                    <span class="info-value">{package_data.get('totalQuestions', 0)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">URL Form</span>
                    <span class="info-value" style="font-size: 11px; word-break: break-all;">{package_data.get('formUrl', 'N/A')[:40]}...</span>
                </div>
            </div>
        </div>
        
        <div class="actions">
            <button class="btn btn-primary" onclick="testPlay()">▶ Test Play</button>
            <button class="btn btn-secondary" onclick="testStatus()">🔄 Test Status</button>
        </div>
        
        <div class="console-hint">
            💡 Abre <code>DevTools (F12)</code> → Console para ver los comandos
        </div>
    </div>
    
    <script>
        // ═══════════════════════════════════════════════════════════════════
        // INYECCIÓN DEL PAQUETE - Esto simula lo que hace Python antes de inyectar
        // ═══════════════════════════════════════════════════════════════════
        window.__autoforms_package = {json.dumps(pkg_for_injection, ensure_ascii=False)};
        
        // ═══════════════════════════════════════════════════════════════════
        // SCRIPT INYECTADO: automation_bar.js
        // ═══════════════════════════════════════════════════════════════════
        {automation_bar_script}
        
        // ═══════════════════════════════════════════════════════════════════
        // FUNCIONES DE PRUEBA
        // ═══════════════════════════════════════════════════════════════════
        
        function testPlay() {{
            console.log('📋 Comandos actuales:', window.__autoforms_commands);
            window.__autoforms_updateStatus('running', 'Procesando fila 1 de 62...');
        }}
        
        function testStatus() {{
            const statuses = ['idle', 'running', 'paused', 'error'];
            const messages = ['Listo', 'Procesando...', 'Pausado', 'Error de conexión'];
            const idx = Math.floor(Math.random() * statuses.length);
            window.__autoforms_updateStatus(statuses[idx], messages[idx]);
        }}
        
        // Monitorear comandos enviados desde la barra
        setInterval(() => {{
            if (window.__autoforms_commands && window.__autoforms_commands.length > 0) {{
                const cmd = window.__autoforms_commands.shift();
                console.log('🎯 Comando recibido:', cmd);
            }}
        }}, 100);
        
        console.log('%c[AutoForms Test Server]%c Servidor de prueba iniciado', 
            'background: #667eea; color: white; padding: 2px 8px; border-radius: 4px;',
            'color: #667eea;'
        );
        console.log('📦 Paquete cargado:', window.__autoforms_package);
    </script>
</body>
</html>'''
    
    return html


class TestHandler(http.server.SimpleHTTPRequestHandler):
    """Handler personalizado para servir el HTML de prueba."""
    
    def __init__(self, *args, package_data=None, **kwargs):
        self.package_data = package_data or DEFAULT_PACKAGE_DATA
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        """Servir el HTML de prueba en la raíz."""
        if self.path == '/' or self.path == '/index.html':
            # Generar HTML dinámicamente
            html_content = generate_test_html(self.package_data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', len(html_content.encode('utf-8')))
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(html_content.encode('utf-8'))
        else:
            # Servir archivos estáticos normalmente
            super().do_GET()
    
    def log_message(self, format, *args):
        """Log personalizado con colores."""
        if '200' in str(args):
            print(f"  ✅ {args[0]}")
        elif '404' in str(args):
            print(f"  ❌ {args[0]} - No encontrado")
        else:
            print(f"  📝 {format % args}")


def run_server(port: int = DEFAULT_PORT, package_path: str = None):
    """Inicia el servidor de prueba."""
    
    # Cargar datos del paquete
    package_data = load_package_data(package_path)
    
    # Crear handler con los datos del paquete
    def handler_factory(*args, **kwargs):
        return TestHandler(*args, package_data=package_data, **kwargs)
    
    # Banner
    print("\n" + "═" * 60)
    print("  🚀 AutoForms UI Test Server")
    print("═" * 60)
    print(f"  📦 Paquete: {package_data.get('filename', 'Test')}")
    print(f"  📊 Filas: {package_data.get('totalRows', 0)} | Preguntas: {package_data.get('totalQuestions', 0)}")
    print("─" * 60)
    print(f"  🌐 URL: http://localhost:{port}")
    print(f"  💡 Presiona Ctrl+C para detener")
    print("═" * 60 + "\n")
    
    # Iniciar servidor
    with socketserver.TCPServer(("", port), handler_factory) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n  👋 Servidor detenido.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Servidor de prueba para UI inyectada de AutoForms"
    )
    parser.add_argument(
        '--port', '-p',
        type=int,
        default=DEFAULT_PORT,
        help=f"Puerto del servidor (default: {DEFAULT_PORT})"
    )
    parser.add_argument(
        '--package', '-pkg',
        type=str,
        default=None,
        help="Ruta al archivo .afpkg para cargar datos reales"
    )
    
    args = parser.parse_args()
    
    # Si no se especifica paquete, buscar uno de prueba
    if not args.package:
        test_pkg = SCRIPT_DIR.parent.parent.parent.parent.parent / "tests" / "automation_Packaeges_Files_for_Selenium_TEST" / "automation_c1f3_v2.afpkg"
        if test_pkg.exists():
            args.package = str(test_pkg)
            print(f"📦 Usando paquete de prueba encontrado: {test_pkg.name}")
    
    run_server(port=args.port, package_path=args.package)
