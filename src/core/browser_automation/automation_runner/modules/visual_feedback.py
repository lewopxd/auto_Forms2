# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
VisualFeedback - Efectos Visuales (Glow)
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Aplicar y remover efectos visuales de resaltado
en los elementos de la página durante la automatización.
"""

from typing import Optional, Set
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement


class VisualFeedback:
    """
    Control de efectos visuales para la automatización.
    
    Aplica efectos de glow/highlight a elementos para
    mostrar visualmente qué elemento está siendo procesado.
    """
    
    # Colores por tipo de acción
    COLORS = {
        'default': '#667eea',    # Azul-violeta
        'fill': '#3b82f6',       # Azul
        'select': '#8b5cf6',     # Violeta
        'click': '#f97316',      # Naranja
        'success': '#22c55e',    # Verde
        'error': '#ef4444',      # Rojo
        'warning': '#eab308',    # Amarillo
    }
    
    def __init__(self, driver: WebDriver):
        """
        Inicializar controlador de efectos visuales.
        
        Args:
            driver: WebDriver de Selenium
        """
        self.driver = driver
        self._highlighted_elements: Set[str] = set()
    
    def apply_glow(
        self, 
        element: WebElement, 
        color: Optional[str] = None,
        action_type: Optional[str] = None
    ) -> bool:
        """
        Aplicar efecto glow a un elemento.
        
        Args:
            element: Elemento al que aplicar el glow
            color: Color del glow (hex). Si no se especifica, usa action_type o default
            action_type: Tipo de acción ('fill', 'select', 'click') para seleccionar color
            
        Returns:
            True si se aplicó correctamente
        """
        # Determinar color
        if not color:
            if action_type and action_type in self.COLORS:
                color = self.COLORS[action_type]
            else:
                color = self.COLORS['default']
        
        try:
            element_id = self.driver.execute_script('''
                const el = arguments[0];
                const color = arguments[1];
                
                // Guardar estilos originales
                el._originalOutline = el.style.outline || '';
                el._originalBoxShadow = el.style.boxShadow || '';
                el._originalTransition = el.style.transition || '';
                
                // Aplicar glow
                el.style.transition = 'all 0.2s ease';
                el.style.outline = `2px solid ${color}`;
                el.style.boxShadow = `0 0 10px ${color}, 0 0 20px ${color}40`;
                
                // Generar ID único si no tiene
                if (!el._glowId) {
                    el._glowId = 'glow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                }
                
                return el._glowId;
            ''', element, color)
            
            if element_id:
                self._highlighted_elements.add(element_id)
            
            return True
        except Exception as e:
            print(f"[VisualFeedback] Error aplicando glow: {e}")
            return False
    
    def remove_glow(self, element: WebElement) -> bool:
        """
        Remover efecto glow de un elemento.
        
        Args:
            element: Elemento del que remover el glow
            
        Returns:
            True si se removió correctamente
        """
        try:
            element_id = self.driver.execute_script('''
                const el = arguments[0];
                
                // Restaurar estilos originales
                el.style.outline = el._originalOutline || '';
                el.style.boxShadow = el._originalBoxShadow || '';
                el.style.transition = el._originalTransition || '';
                
                const glowId = el._glowId;
                el._glowId = null;
                
                return glowId;
            ''', element)
            
            if element_id and element_id in self._highlighted_elements:
                self._highlighted_elements.discard(element_id)
            
            return True
        except Exception as e:
            print(f"[VisualFeedback] Error removiendo glow: {e}")
            return False
    
    def remove_all_glows(self) -> int:
        """
        Remover todos los efectos glow aplicados.
        
        Returns:
            Número de elementos procesados
        """
        try:
            count = self.driver.execute_script('''
                let count = 0;
                document.querySelectorAll('*').forEach(el => {
                    if (el._glowId) {
                        el.style.outline = el._originalOutline || '';
                        el.style.boxShadow = el._originalBoxShadow || '';
                        el.style.transition = el._originalTransition || '';
                        el._glowId = null;
                        count++;
                    }
                });
                return count;
            ''')
            
            self._highlighted_elements.clear()
            return count or 0
        except Exception:
            return 0
    
    def pulse_glow(self, element: WebElement, color: Optional[str] = None) -> bool:
        """
        Aplicar efecto de pulso temporal (glow que desaparece).
        
        Args:
            element: Elemento al que aplicar el pulso
            color: Color del pulso
            
        Returns:
            True si se aplicó correctamente
        """
        if not color:
            color = self.COLORS['success']
        
        try:
            self.driver.execute_script('''
                const el = arguments[0];
                const color = arguments[1];
                
                const originalOutline = el.style.outline || '';
                const originalBoxShadow = el.style.boxShadow || '';
                const originalTransition = el.style.transition || '';
                
                el.style.transition = 'all 0.3s ease';
                el.style.outline = `2px solid ${color}`;
                el.style.boxShadow = `0 0 15px ${color}, 0 0 30px ${color}60`;
                
                setTimeout(() => {
                    el.style.outline = originalOutline;
                    el.style.boxShadow = originalBoxShadow;
                    setTimeout(() => {
                        el.style.transition = originalTransition;
                    }, 300);
                }, 500);
            ''', element, color)
            return True
        except Exception:
            return False
