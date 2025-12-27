# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
ElementFinder - Búsqueda de Elementos en el DOM
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Encontrar elementos en el DOM de MS Forms.
"""

import re
from typing import Optional, List, Tuple
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    StaleElementReferenceException
)


class ElementFinder:
    """
    Búsqueda de elementos en el DOM de MS Forms.
    
    Proporciona métodos especializados para encontrar:
    - Contenedores de preguntas (questionItem)
    - Inputs de texto
    - Opciones de selección
    - Botones de navegación
    """
    
    def __init__(self, driver: WebDriver, timeout: int = 10):
        """
        Inicializar buscador de elementos.
        
        Args:
            driver: WebDriver de Selenium
            timeout: Timeout por defecto para esperas
        """
        self.driver = driver
        self.timeout = timeout
    
    def find_question_container(self, question: dict) -> Optional[WebElement]:
        """
        Encontrar el contenedor padre de una pregunta.
        
        Args:
            question: Diccionario con datos de la pregunta
            
        Returns:
            WebElement del contenedor o None
        """
        try:
            selenium_info = question.get("selenium", {})
            question_id = selenium_info.get("questionId")
            
            if question_id:
                return self.find_container_by_id(question_id)
            
            # Fallback: extraer del fullSelector
            full_selector = selenium_info.get("fullSelector", "")
            match = re.search(r'QuestionId_r([a-f0-9]+)', full_selector)
            if match:
                q_id = f"QuestionId_r{match.group(1)}"
                return self.find_container_by_id(q_id)
            
            return None
        except Exception:
            return None
    
    def find_container_by_id(self, question_id: str) -> Optional[WebElement]:
        """
        Encontrar contenedor de pregunta por QuestionId.
        
        Args:
            question_id: ID de la pregunta (ej: "QuestionId_r123abc")
            
        Returns:
            WebElement del contenedor questionItem o None
        """
        try:
            # Primero encontrar el elemento con ese ID
            q_element = self.driver.find_element(By.ID, question_id)
            
            # Subir en el DOM hasta encontrar questionItem
            container = self.driver.execute_script('''
                let el = arguments[0];
                let maxDepth = 10;
                while (el && maxDepth > 0) {
                    if (el.getAttribute && el.getAttribute('data-automation-id') === 'questionItem') {
                        return el;
                    }
                    el = el.parentElement;
                    maxDepth--;
                }
                return null;
            ''', q_element)
            
            return container if container else q_element
            
        except NoSuchElementException:
            return None
        except Exception:
            return None
    
    def find_text_input(self, question: dict) -> Optional[WebElement]:
        """
        Encontrar input de texto para una pregunta FILL.
        
        Args:
            question: Diccionario con datos de la pregunta
            
        Returns:
            WebElement del input o None
        """
        try:
            selenium_info = question.get("selenium", {})
            
            # Estrategia 1: Usar fullSelector
            full_selector = selenium_info.get("fullSelector", "")
            if full_selector:
                try:
                    return self.driver.find_element(By.CSS_SELECTOR, full_selector)
                except NoSuchElementException:
                    pass
            
            # Estrategia 2: Buscar dentro del contenedor
            question_id = selenium_info.get("questionId")
            if question_id:
                container = self.find_container_by_id(question_id)
                if container:
                    return self._find_input_in_container(container)
            
            return None
        except Exception:
            return None
    
    def _find_input_in_container(self, container: WebElement) -> Optional[WebElement]:
        """
        Buscar input de texto dentro de un contenedor.
        
        Args:
            container: Contenedor de la pregunta
            
        Returns:
            WebElement del input o None
        """
        try:
            # Prioridad 1: input[type="text"]
            inputs = container.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
            if inputs:
                return inputs[0]
            
            # Prioridad 2: textarea
            textareas = container.find_elements(By.TAG_NAME, 'textarea')
            if textareas:
                return textareas[0]
            
            # Prioridad 3: cualquier input
            all_inputs = container.find_elements(By.TAG_NAME, 'input')
            for inp in all_inputs:
                input_type = inp.get_attribute('type') or 'text'
                if input_type in ['text', 'email', 'number', 'tel', 'url']:
                    return inp
            
            return None
        except Exception:
            return None
    
    def find_option_element(
        self, 
        question: dict, 
        answer: str,
        options: List[dict] = None
    ) -> Optional[WebElement]:
        """
        Encontrar elemento de opción para una pregunta SELECT.
        
        Args:
            question: Diccionario con datos de la pregunta
            answer: Valor de la respuesta a seleccionar
            options: Lista de opciones con información de selenium
            
        Returns:
            WebElement de la opción o None
        """
        try:
            selenium_info = question.get("selenium", {})
            question_id = selenium_info.get("questionId")
            
            # Obtener contenedor
            container = None
            if question_id:
                container = self.find_container_by_id(question_id)
            
            if not container:
                # Fallback: buscar en todo el documento
                container = self.driver.find_element(By.TAG_NAME, 'body')
            
            # Buscar la opción específica
            return self._find_option_in_container(container, answer, options)
            
        except Exception:
            return None
    
    def _find_option_in_container(
        self, 
        container: WebElement, 
        answer: str,
        options: List[dict] = None
    ) -> Optional[WebElement]:
        """
        Buscar opción dentro de un contenedor.
        
        Args:
            container: Contenedor de la pregunta
            answer: Valor a buscar
            options: Info adicional de las opciones
            
        Returns:
            WebElement de la opción o None
        """
        # Escapar caracteres especiales para selector CSS
        safe_answer = answer.replace('"', '\\"').replace("'", "\\'")
        
        try:
            # Prioridad 1: data-automation-value exacto
            element = self.driver.execute_script('''
                const container = arguments[0];
                const answer = arguments[1];
                
                // Buscar por data-automation-value exacto
                const selector = `[data-automation-value="${answer}"]`;
                let el = container.querySelector(selector);
                if (el) return el;
                
                // Buscar por texto del label
                const labels = container.querySelectorAll('[data-automation-id="choiceText"]');
                for (const label of labels) {
                    if (label.textContent.trim() === answer) {
                        // Subir al span clickeable
                        let parent = label.parentElement;
                        while (parent && parent !== container) {
                            if (parent.hasAttribute('data-automation-value')) {
                                return parent;
                            }
                            parent = parent.parentElement;
                        }
                        return label;
                    }
                }
                
                // Buscar por input con value
                const inputs = container.querySelectorAll(`input[value="${answer}"]`);
                if (inputs.length > 0) {
                    let parent = inputs[0].parentElement;
                    while (parent && parent !== container) {
                        if (parent.hasAttribute('data-automation-value')) {
                            return parent;
                        }
                        parent = parent.parentElement;
                    }
                    return inputs[0];
                }
                
                return null;
            ''', container, answer)
            
            return element
            
        except Exception:
            return None
    
    def find_navigation_button(self, page: dict, nav_type: str) -> Optional[WebElement]:
        """
        Encontrar botón de navegación (next/submit/back).
        
        Args:
            page: Diccionario con datos de la página
            nav_type: Tipo de navegación ('next', 'submit', 'back')
            
        Returns:
            WebElement del botón o None
        """
        try:
            navigation = page.get("navigation", {})
            nav_info = navigation.get(nav_type)
            
            if not nav_info:
                return None
            
            selector = nav_info.get("selector")
            if not selector:
                return None
            
            return self.driver.find_element(By.CSS_SELECTOR, selector)
            
        except NoSuchElementException:
            return None
        except Exception:
            return None
    
    def wait_for_element(
        self, 
        locator: Tuple[str, str], 
        timeout: int = None
    ) -> Optional[WebElement]:
        """
        Esperar a que un elemento esté presente.
        
        Args:
            locator: Tupla (By.XXX, "selector")
            timeout: Tiempo máximo de espera
            
        Returns:
            WebElement o None si timeout
        """
        if timeout is None:
            timeout = self.timeout
        
        try:
            wait = WebDriverWait(self.driver, timeout)
            return wait.until(EC.presence_of_element_located(locator))
        except TimeoutException:
            return None
    
    def wait_for_clickable(
        self, 
        locator: Tuple[str, str], 
        timeout: int = None
    ) -> Optional[WebElement]:
        """
        Esperar a que un elemento sea clickeable.
        
        Args:
            locator: Tupla (By.XXX, "selector")
            timeout: Tiempo máximo de espera
            
        Returns:
            WebElement o None si timeout
        """
        if timeout is None:
            timeout = self.timeout
        
        try:
            wait = WebDriverWait(self.driver, timeout)
            return wait.until(EC.element_to_be_clickable(locator))
        except TimeoutException:
            return None
