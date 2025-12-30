# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
WidgetController - Control de Interactividad del Widget Inyectado
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Controlar la interactividad del widget de AutoForms
para permitir que Selenium pueda hacer clicks sin que el widget los intercepte.

Estrategia: pointer-events: none (el widget sigue visible pero clicks lo atraviesan)
"""

from selenium.webdriver.remote.webdriver import WebDriver


class WidgetController:
    """
    Control de interactividad del widget inyectado.
    
    El widget AutoForms usa Shadow DOM, por lo que solo necesitamos
    aplicar pointer-events al elemento host para afectar todo el árbol.
    
    Estrategias disponibles:
    1. pointer-events: none → Clicks atraviesan (RECOMENDADO)
    2. display: none → Ocultar completamente (fallback)
    3. z-index: -9999 → Enviar detrás del contenido (alternativa)
    """
    
    ROOT_ID = '__autoforms_bar_root__'
    
    def __init__(self, driver: WebDriver):
        """
        Inicializar controlador de widget.
        
        Args:
            driver: WebDriver de Selenium
        """
        self.driver = driver
        self._is_clicks_disabled = False
    
    def disable_clicks(self) -> bool:
        """
        Hace el widget transparente a clicks de Selenium.
        
        Aplica pointer-events: none al elemento host.
        Todos los elementos dentro del Shadow DOM heredan esta propiedad.
        
        Returns:
            True si se aplicó correctamente, False si el widget no existe
        """
        try:
            result = self.driver.execute_script('''
                const el = document.getElementById(arguments[0]);
                if (el) {
                    el._savedPointerEvents = el.style.pointerEvents || '';
                    el.style.pointerEvents = 'none';
                    return true;
                }
                return false;
            ''', self.ROOT_ID)
            self._is_clicks_disabled = bool(result)
            return self._is_clicks_disabled
        except Exception:
            return False
    
    def enable_clicks(self) -> bool:
        """
        Restaura la interactividad del widget.
        
        Returns:
            True si se restauró correctamente, False si el widget no existe
        """
        try:
            result = self.driver.execute_script('''
                const el = document.getElementById(arguments[0]);
                if (el) {
                    el.style.pointerEvents = el._savedPointerEvents || '';
                    return true;
                }
                return false;
            ''', self.ROOT_ID)
            self._is_clicks_disabled = False
            return bool(result)
        except Exception:
            return False
    
    def hide(self) -> bool:
        """
        Oculta completamente el widget (fallback).
        
        Usar solo si pointer-events no funciona.
        
        Returns:
            True si se ocultó correctamente
        """
        try:
            result = self.driver.execute_script('''
                const el = document.getElementById(arguments[0]);
                if (el) {
                    el._savedDisplay = el.style.display || '';
                    el.style.display = 'none';
                    return true;
                }
                return false;
            ''', self.ROOT_ID)
            return bool(result)
        except Exception:
            return False
    
    def show(self) -> bool:
        """
        Restaura visibilidad del widget.
        
        Returns:
            True si se restauró correctamente
        """
        try:
            result = self.driver.execute_script('''
                const el = document.getElementById(arguments[0]);
                if (el) {
                    el.style.display = el._savedDisplay || '';
                    return true;
                }
                return false;
            ''', self.ROOT_ID)
            return bool(result)
        except Exception:
            return False
    
    def exists(self) -> bool:
        """
        Verifica si el widget existe en el DOM.
        
        Returns:
            True si el widget existe
        """
        try:
            result = self.driver.execute_script(
                'return document.getElementById(arguments[0]) !== null;',
                self.ROOT_ID
            )
            return bool(result)
        except Exception:
            return False
    
    def wait_for_ready(self, timeout_seconds: int = 5) -> bool:
        """
        Esperar a que la UI inyectada esté completamente lista.
        
        Verifica que:
        1. El elemento host existe en el DOM
        2. Las funciones de sincronización (__autoforms_syncState) están disponibles
        
        Args:
            timeout_seconds: Tiempo máximo de espera
            
        Returns:
            True si la UI está lista, False si timeout
        """
        import time
        start = time.time()
        
        while time.time() - start < timeout_seconds:
            try:
                result = self.driver.execute_script('''
                    const el = document.getElementById(arguments[0]);
                    if (!el) return false;
                    
                    // Verificar que las funciones de sincronización existen
                    return typeof window.__autoforms_syncState === 'function';
                ''', self.ROOT_ID)
                
                if result:
                    return True
                    
            except Exception:
                pass
            
            time.sleep(0.2)
        
        return False
    
    @property
    def is_clicks_disabled(self) -> bool:
        """Retorna si los clicks están actualmente deshabilitados."""
        return self._is_clicks_disabled
