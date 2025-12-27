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
    
    # ═══════════════════════════════════════════════════════════════════════════
    # CLICK VALIDATION (para botones de navegación)
    # ═══════════════════════════════════════════════════════════════════════════
    
    def prepare_click_validation(self, element: WebElement) -> bool:
        """
        Preparar validación de click inyectando un event listener temporal.
        
        DEBE llamarse ANTES de ejecutar el click.
        El listener marcará __clickConfirmed = true cuando el click se dispare.
        
        Args:
            element: Botón que será clickeado
            
        Returns:
            True si se inyectó correctamente el listener
        """
        try:
            self.driver.execute_script('''
                const el = arguments[0];
                
                // Resetear estado
                el.__clickConfirmed = false;
                el.__clickTimestamp = null;
                
                // Inyectar listener de un solo uso
                el.addEventListener('click', function __clickValidator(e) {
                    el.__clickConfirmed = true;
                    el.__clickTimestamp = Date.now();
                    // Remover listener después de capturar
                    el.removeEventListener('click', __clickValidator);
                }, { once: true, capture: true });
                
                console.log('[AutoForms] ✓ Click validation listener inyectado');
            ''', element)
            return True
        except Exception as e:
            print(f"[Validator] Error preparando validación de click: {e}")
            return False
    
    def validate_click_executed(
        self, 
        element: WebElement, 
        button_type: str = "button"
    ) -> bool:
        """
        Validar que el click en un botón se ejecutó correctamente.
        
        Verifica que el event listener inyectado por prepare_click_validation()
        haya capturado el evento click.
        
        Args:
            element: Botón que fue clickeado
            button_type: Tipo de botón para logging ('next', 'submit', 'back')
            
        Returns:
            True si el click fue confirmado por el listener
        """
        try:
            result = self.driver.execute_script('''
                const el = arguments[0];
                const buttonType = arguments[1];
                
                const confirmed = el.__clickConfirmed === true;
                const timestamp = el.__clickTimestamp;
                
                if (confirmed) {
                    console.log('[AutoForms] ✓✓✓ CLICK CONFIRMADO en botón ' + buttonType);
                    console.log('[AutoForms]   Timestamp:', timestamp);
                } else {
                    console.error('[AutoForms] ❌ CLICK NO CONFIRMADO en botón ' + buttonType);
                    console.error('[AutoForms]   __clickConfirmed:', el.__clickConfirmed);
                }
                
                // Limpiar propiedades temporales
                delete el.__clickConfirmed;
                delete el.__clickTimestamp;
                
                return confirmed;
            ''', element, button_type)
            
            return bool(result)
        except Exception as e:
            print(f"[Validator] Error validando click: {e}")
            return False
    
    def validate_click_with_fallback(
        self, 
        element: WebElement,
        button_type: str = "button"
    ) -> bool:
        """
        Validación de click con estrategias de fallback.
        
        Si el listener no capturó el click, intenta validar por otros medios.
        
        Args:
            element: Botón que fue clickeado
            button_type: Tipo de botón
            
        Returns:
            True si alguna estrategia confirma el click
        """
        try:
            result = self.driver.execute_script('''
                const el = arguments[0];
                const buttonType = arguments[1];
                
                console.log('[AutoForms] 🔍 Validando click con fallbacks...');
                
                // ESTRATEGIA 1: Click listener
                if (el.__clickConfirmed === true) {
                    console.log('[AutoForms] ✓ Estrategia 1: Click listener confirmó');
                    delete el.__clickConfirmed;
                    delete el.__clickTimestamp;
                    return { success: true, method: 'listener' };
                }
                
                // ESTRATEGIA 2: Botón deshabilitado
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
                    console.log('[AutoForms] ✓ Estrategia 2: Botón deshabilitado');
                    return { success: true, method: 'disabled' };
                }
                
                // ESTRATEGIA 3: Clase de loading añadida
                if (el.classList.contains('loading') || 
                    el.classList.contains('submitting') ||
                    el.classList.contains('disabled')) {
                    console.log('[AutoForms] ✓ Estrategia 3: Clase de loading');
                    return { success: true, method: 'loading-class' };
                }
                
                // ESTRATEGIA 4: Spinner visible
                const parent = el.parentElement;
                if (parent) {
                    const spinner = parent.querySelector('[class*="spinner"], [class*="loading"]');
                    if (spinner && spinner.offsetParent !== null) {
                        console.log('[AutoForms] ✓ Estrategia 4: Spinner visible');
                        return { success: true, method: 'spinner' };
                    }
                }
                
                console.log('[AutoForms] ⚠️ Ninguna estrategia confirmó el click');
                return { success: false, method: 'none' };
                
            ''', element, button_type)
            
            if result and result.get('success'):
                print(f"[Validator] Click confirmado via: {result.get('method')}")
                return True
            return False
            
        except Exception as e:
            print(f"[Validator] Error en validate_click_with_fallback: {e}")
            return False
