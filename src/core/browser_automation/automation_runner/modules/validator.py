# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
Validator - Validación de Respuestas
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Validar que las respuestas se ingresaron correctamente
en el formulario.
"""

from typing import Optional
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement


class Validator:
    """
    Validación de respuestas en formularios MS Forms.
    
    Proporciona métodos para verificar que:
    - Textos se escribieron correctamente (FILL)
    - Opciones se seleccionaron correctamente (SELECT)
    """
    
    def __init__(self, driver: WebDriver):
        """
        Inicializar validador.
        
        Args:
            driver: WebDriver de Selenium
        """
        self.driver = driver
    
    def validate_fill(self, element: WebElement, expected: str) -> bool:
        """
        Validar que un input contiene el texto esperado.
        
        Usa JavaScript para leer el valor real del input,
        evitando problemas con getAttribute('value').
        
        Args:
            element: Input a validar
            expected: Texto esperado
            
        Returns:
            True si el valor coincide
        """
        try:
            actual = self.driver.execute_script('''
                const el = arguments[0];
                return el.value || el.textContent || el.innerText || '';
            ''', element)
            
            # Normalizar para comparación
            actual_normalized = (actual or '').strip()
            expected_normalized = expected.strip()
            
            return actual_normalized == expected_normalized
        except Exception:
            return False
    
    def validate_fill_contains(self, element: WebElement, expected: str) -> bool:
        """
        Validar que un input contiene el texto esperado (parcial).
        
        Args:
            element: Input a validar
            expected: Texto que debe contener
            
        Returns:
            True si el valor contiene el texto
        """
        try:
            actual = self.driver.execute_script('''
                const el = arguments[0];
                return el.value || el.textContent || el.innerText || '';
            ''', element)
            
            return expected.strip() in (actual or '')
        except Exception:
            return False
    
    def validate_select(self, element: WebElement, expected: str) -> bool:
        """
        Validar que una opción está seleccionada.
        
        Busca el input[aria-checked='true'] dentro o cerca del elemento
        para verificar la selección.
        
        Args:
            element: Elemento de la opción clickeada
            expected: Valor esperado
            
        Returns:
            True si la opción está seleccionada
        """
        try:
            # Verificar si hay un input checked dentro o como hermano
            is_selected = self.driver.execute_script('''
                const el = arguments[0];
                const expectedValue = arguments[1];
                
                // Buscar input checked dentro del elemento
                let input = el.querySelector('input[aria-checked="true"]');
                if (input) return true;
                
                // Buscar input checked como hermano
                if (el.parentElement) {
                    input = el.parentElement.querySelector('input[aria-checked="true"]');
                    if (input) return true;
                }
                
                // Verificar si el elemento tiene class que indica selección
                if (el.classList.contains('selected') || 
                    el.classList.contains('checked') ||
                    el.getAttribute('aria-checked') === 'true') {
                    return true;
                }
                
                // Verificar data-automation-value
                const value = el.getAttribute('data-automation-value');
                if (value === expectedValue) {
                    // Buscar cualquier indicador de selección en el árbol
                    const checkedInputs = el.querySelectorAll('input[type="radio"]:checked, input[aria-checked="true"]');
                    if (checkedInputs.length > 0) return true;
                    
                    // Como último recurso, verificar si el input tiene value y está checked
                    const radioInputs = el.querySelectorAll('input[type="radio"]');
                    for (const radio of radioInputs) {
                        if (radio.checked) return true;
                    }
                }
                
                return false;
            ''', element, expected)
            
            return bool(is_selected)
        except Exception:
            return False
    
    def validate_select_by_container(
        self, 
        container: WebElement, 
        expected: str
    ) -> bool:
        """
        Validar selección buscando en todo el contenedor de la pregunta.
        
        Args:
            container: Contenedor de la pregunta
            expected: Valor esperado de la opción seleccionada
            
        Returns:
            True si se encontró la opción seleccionada con el valor esperado
        """
        try:
            is_correct = self.driver.execute_script('''
                const container = arguments[0];
                const expectedValue = arguments[1];
                
                // Buscar input checked con el valor esperado
                const selector = `[data-automation-value="${expectedValue}"] input[aria-checked="true"]`;
                let found = container.querySelector(selector);
                if (found) return true;
                
                // Buscar input radio checked
                const checkedRadios = container.querySelectorAll('input[type="radio"]:checked');
                for (const radio of checkedRadios) {
                    // Subir para encontrar el data-automation-value
                    let parent = radio.parentElement;
                    while (parent && parent !== container) {
                        const value = parent.getAttribute('data-automation-value');
                        if (value === expectedValue) return true;
                        parent = parent.parentElement;
                    }
                }
                
                // Buscar aria-checked="true"
                const ariaChecked = container.querySelectorAll('[aria-checked="true"]');
                for (const el of ariaChecked) {
                    let parent = el;
                    while (parent && parent !== container) {
                        const value = parent.getAttribute('data-automation-value');
                        if (value === expectedValue) return true;
                        parent = parent.parentElement;
                    }
                }
                
                return false;
            ''', container, expected)
            
            return bool(is_correct)
        except Exception:
            return False
    
    def get_current_fill_value(self, element: WebElement) -> Optional[str]:
        """
        Obtener el valor actual de un input.
        
        Args:
            element: Input del que obtener el valor
            
        Returns:
            Valor actual o None si error
        """
        try:
            return self.driver.execute_script('''
                const el = arguments[0];
                return el.value || el.textContent || el.innerText || '';
            ''', element)
        except Exception:
            return None
    
    def get_selected_option(self, container: WebElement) -> Optional[str]:
        """
        Obtener el valor de la opción actualmente seleccionada.
        
        Args:
            container: Contenedor de la pregunta
            
        Returns:
            Valor de la opción seleccionada o None
        """
        try:
            return self.driver.execute_script('''
                const container = arguments[0];
                
                // Buscar input checked
                const checkedInputs = container.querySelectorAll(
                    'input[type="radio"]:checked, input[aria-checked="true"]'
                );
                
                for (const input of checkedInputs) {
                    // Subir para encontrar data-automation-value
                    let parent = input.parentElement;
                    while (parent && parent !== container) {
                        const value = parent.getAttribute('data-automation-value');
                        if (value) return value;
                        parent = parent.parentElement;
                    }
                }
                
                return null;
            ''', container)
        except Exception:
            return None
