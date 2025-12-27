# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
ViewportController - Control de Scroll y Posicionamiento
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Gestionar el scroll de la página y posicionamiento
de elementos en el viewport.
"""

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement


class ViewportController:
    """
    Control de scroll y posicionamiento de elementos.
    
    Proporciona métodos para scrollear elementos al centro del viewport
    y verificar su visibilidad.
    """
    
    # Offset para evitar que el elemento quede debajo de la barra
    BAR_HEIGHT = 36
    
    def __init__(self, driver: WebDriver):
        """
        Inicializar controlador de viewport.
        
        Args:
            driver: WebDriver de Selenium
        """
        self.driver = driver
    
    def scroll_to_center(self, element: WebElement, offset_top: int = None) -> bool:
        """
        Scroll suave para centrar un elemento en el viewport.
        
        Args:
            element: Elemento a centrar
            offset_top: Offset adicional desde arriba (para evitar barra)
            
        Returns:
            True si el scroll se ejecutó correctamente
        """
        if offset_top is None:
            offset_top = self.BAR_HEIGHT + 20  # Margen extra
        
        try:
            self.driver.execute_script('''
                const el = arguments[0];
                const offsetTop = arguments[1];
                
                const rect = el.getBoundingClientRect();
                const viewHeight = window.innerHeight;
                
                // Calcular posición para centrar
                const targetY = rect.top + window.scrollY - (viewHeight / 2) + (rect.height / 2);
                
                // Ajustar por offset de la barra
                const finalY = Math.max(0, targetY - offsetTop);
                
                window.scrollTo({
                    top: finalY,
                    behavior: 'smooth'
                });
            ''', element, offset_top)
            return True
        except Exception as e:
            print(f"[ViewportController] Error en scroll: {e}")
            return False
    
    def scroll_to_top(self, element: WebElement, offset_top: int = None) -> bool:
        """
        Scroll para posicionar elemento en la parte superior del viewport.
        
        Args:
            element: Elemento a posicionar
            offset_top: Offset desde arriba
            
        Returns:
            True si el scroll se ejecutó correctamente
        """
        if offset_top is None:
            offset_top = self.BAR_HEIGHT + 20
        
        try:
            self.driver.execute_script('''
                const el = arguments[0];
                const offsetTop = arguments[1];
                
                const rect = el.getBoundingClientRect();
                const targetY = rect.top + window.scrollY - offsetTop;
                
                window.scrollTo({
                    top: Math.max(0, targetY),
                    behavior: 'smooth'
                });
            ''', element, offset_top)
            return True
        except Exception:
            return False
    
    def is_in_viewport(self, element: WebElement) -> bool:
        """
        Verificar si un elemento está visible en el viewport.
        
        Args:
            element: Elemento a verificar
            
        Returns:
            True si el elemento está visible
        """
        try:
            result = self.driver.execute_script('''
                const el = arguments[0];
                const rect = el.getBoundingClientRect();
                
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            ''', element)
            return bool(result)
        except Exception:
            return False
    
    def is_partially_visible(self, element: WebElement) -> bool:
        """
        Verificar si un elemento está parcialmente visible en el viewport.
        
        Args:
            element: Elemento a verificar
            
        Returns:
            True si al menos parte del elemento está visible
        """
        try:
            result = self.driver.execute_script('''
                const el = arguments[0];
                const rect = el.getBoundingClientRect();
                
                const viewHeight = window.innerHeight || document.documentElement.clientHeight;
                const viewWidth = window.innerWidth || document.documentElement.clientWidth;
                
                return !(
                    rect.bottom < 0 ||
                    rect.top > viewHeight ||
                    rect.right < 0 ||
                    rect.left > viewWidth
                );
            ''', element)
            return bool(result)
        except Exception:
            return False
    
    def get_element_position(self, element: WebElement) -> dict:
        """
        Obtener posición y dimensiones de un elemento.
        
        Args:
            element: Elemento a medir
            
        Returns:
            Dict con top, left, width, height, bottom, right
        """
        try:
            result = self.driver.execute_script('''
                const el = arguments[0];
                const rect = el.getBoundingClientRect();
                
                return {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    bottom: rect.bottom,
                    right: rect.right,
                    scrollY: window.scrollY,
                    scrollX: window.scrollX
                };
            ''', element)
            return result or {}
        except Exception:
            return {}
    
    def ensure_not_behind_bar(self, element: WebElement) -> bool:
        """
        Asegurar que el elemento no esté oculto detrás de la barra.
        
        Args:
            element: Elemento a verificar y ajustar
            
        Returns:
            True si se hizo ajuste, False si no era necesario
        """
        try:
            result = self.driver.execute_script('''
                const el = arguments[0];
                const barHeight = arguments[1];
                
                const rect = el.getBoundingClientRect();
                
                // Si el elemento está detrás de la barra
                if (rect.top < barHeight) {
                    const scrollAmount = barHeight - rect.top + 20;
                    window.scrollBy({
                        top: -scrollAmount,
                        behavior: 'smooth'
                    });
                    return true;
                }
                
                return false;
            ''', element, self.BAR_HEIGHT)
            return bool(result)
        except Exception:
            return False
