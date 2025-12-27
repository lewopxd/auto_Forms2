# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
Interaction - Interacciones con Elementos
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Ejecutar interacciones con elementos del DOM
(clicks, typing, mouse movements) de forma segura.
"""

import time
import random
from typing import Optional
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    ElementNotInteractableException,
    StaleElementReferenceException
)

from .widget_controller import WidgetController


class Interaction:
    """
    Gestión de interacciones con elementos del DOM.
    
    Todas las interacciones que requieren click usan el WidgetController
    para desactivar la intercepción del widget antes del click.
    """
    
    def __init__(self, driver: WebDriver, widget: WidgetController):
        """
        Inicializar módulo de interacción.
        
        Args:
            driver: WebDriver de Selenium
            widget: Controlador del widget para evitar interceptación
        """
        self.driver = driver
        self.widget = widget
    
    def safe_click(self, element: WebElement, use_js_fallback: bool = True) -> bool:
        """
        Click seguro que evita intercepción por el widget.
        
        1. Desactiva pointer-events del widget
        2. Ejecuta click nativo de Selenium
        3. Si falla, intenta JS click (opcional)
        4. Restaura pointer-events del widget
        
        Args:
            element: Elemento a clickear
            use_js_fallback: Si usar JS click como fallback
            
        Returns:
            True si el click fue exitoso
        """
        self.widget.disable_clicks()
        
        try:
            element.click()
            return True
        except ElementClickInterceptedException:
            if use_js_fallback:
                try:
                    self.driver.execute_script("arguments[0].click();", element)
                    return True
                except Exception:
                    return False
            return False
        except (ElementNotInteractableException, StaleElementReferenceException):
            return False
        except Exception:
            return False
        finally:
            self.widget.enable_clicks()
    
    def js_click(self, element: WebElement) -> bool:
        """
        Click usando JavaScript (ignora visibilidad).
        
        Args:
            element: Elemento a clickear
            
        Returns:
            True si el click fue exitoso
        """
        try:
            self.driver.execute_script("arguments[0].click();", element)
            return True
        except Exception:
            return False
    
    def focus_element(self, element: WebElement) -> bool:
        """
        Dar foco a un elemento.
        
        Args:
            element: Elemento a enfocar
            
        Returns:
            True si se enfocó correctamente
        """
        try:
            self.driver.execute_script("arguments[0].focus();", element)
            return True
        except Exception:
            return False
    
    def clear_input(self, element: WebElement) -> bool:
        """
        Limpiar contenido de un input.
        
        Args:
            element: Input a limpiar
            
        Returns:
            True si se limpió correctamente
        """
        try:
            element.clear()
            return True
        except Exception:
            try:
                # Fallback: seleccionar todo y borrar
                element.send_keys(Keys.CONTROL + "a")
                element.send_keys(Keys.DELETE)
                return True
            except Exception:
                return False
    
    def type_text(
        self, 
        element: WebElement, 
        text: str, 
        method: str = "keyByKey",
        min_delay_ms: int = 30,
        max_delay_ms: int = 120
    ) -> bool:
        """
        Escribir texto en un elemento.
        
        Args:
            element: Elemento donde escribir
            text: Texto a escribir
            method: Método de escritura:
                - 'keyByKey': Tecla por tecla (humano)
                - 'sendKeys': send_keys directo
                - 'ctrlV': Clipboard + Ctrl+V
                - 'jsValue': Inyección JS directa
            min_delay_ms: Delay mínimo entre teclas (para keyByKey)
            max_delay_ms: Delay máximo entre teclas (para keyByKey)
            
        Returns:
            True si se escribió correctamente
        """
        try:
            if method == 'keyByKey':
                return self._type_human(element, text, min_delay_ms, max_delay_ms)
            elif method == 'sendKeys':
                return self._type_send_keys(element, text)
            elif method == 'ctrlV':
                return self._type_clipboard(element, text)
            elif method == 'jsValue':
                return self._type_js_injection(element, text)
            else:
                # Default: sendKeys
                return self._type_send_keys(element, text)
        except Exception:
            return False
    
    def _type_human(
        self, 
        element: WebElement, 
        text: str, 
        min_delay_ms: int,
        max_delay_ms: int
    ) -> bool:
        """Escribir tecla por tecla con delays aleatorios."""
        try:
            for char in text:
                element.send_keys(char)
                delay = random.randint(min_delay_ms, max_delay_ms) / 1000.0
                time.sleep(delay)
            return True
        except Exception:
            return False
    
    def _type_send_keys(self, element: WebElement, text: str) -> bool:
        """Escribir usando send_keys directo."""
        try:
            element.send_keys(text)
            return True
        except Exception:
            return False
    
    def _type_clipboard(self, element: WebElement, text: str) -> bool:
        """Escribir usando clipboard + Ctrl+V."""
        try:
            import pyperclip
            pyperclip.copy(text)
            element.send_keys(Keys.CONTROL + 'v')
            return True
        except ImportError:
            # pyperclip no disponible, fallback a sendKeys
            return self._type_send_keys(element, text)
        except Exception:
            return False
    
    def _type_js_injection(self, element: WebElement, text: str) -> bool:
        """Escribir mediante inyección JS directa (instantáneo)."""
        try:
            self.driver.execute_script('''
                const el = arguments[0];
                const text = arguments[1];
                
                // Establecer valor
                el.value = text;
                
                // Disparar eventos para que el formulario detecte el cambio
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
            ''', element, text)
            return True
        except Exception:
            return False
    
    def move_mouse_to(self, element: WebElement) -> bool:
        """
        Mover el mouse hacia un elemento.
        
        Args:
            element: Elemento destino
            
        Returns:
            True si el movimiento fue exitoso
        """
        try:
            actions = ActionChains(self.driver)
            actions.move_to_element(element)
            actions.perform()
            return True
        except Exception:
            return False
    
    def hover(self, element: WebElement, duration_ms: int = 200) -> bool:
        """
        Hacer hover sobre un elemento.
        
        Args:
            element: Elemento sobre el que hacer hover
            duration_ms: Duración del hover en ms
            
        Returns:
            True si el hover fue exitoso
        """
        try:
            actions = ActionChains(self.driver)
            actions.move_to_element(element)
            actions.pause(duration_ms / 1000.0)
            actions.perform()
            return True
        except Exception:
            return False
    
    def double_click(self, element: WebElement) -> bool:
        """
        Doble click en un elemento.
        
        Args:
            element: Elemento a clickear
            
        Returns:
            True si el click fue exitoso
        """
        self.widget.disable_clicks()
        
        try:
            actions = ActionChains(self.driver)
            actions.double_click(element)
            actions.perform()
            return True
        except Exception:
            return False
        finally:
            self.widget.enable_clicks()
    
    def right_click(self, element: WebElement) -> bool:
        """
        Click derecho en un elemento.
        
        Args:
            element: Elemento a clickear
            
        Returns:
            True si el click fue exitoso
        """
        self.widget.disable_clicks()
        
        try:
            actions = ActionChains(self.driver)
            actions.context_click(element)
            actions.perform()
            return True
        except Exception:
            return False
        finally:
            self.widget.enable_clicks()
