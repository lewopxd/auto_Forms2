#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Form Executor - Motor de Ejecución Selenium
============================================
Ejecuta las acciones de automatización sobre formularios MS Forms.
Soporta:
- Campos de texto (fill) con typing humano
- Selección de opciones (choice) con fallback de selectores
- Navegación entre páginas (next/submit)
- Human actions: scroll, mouse move, validación
"""
import time
import random
from typing import Optional, Callable, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from enum import Enum

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    StaleElementReferenceException,
    ElementNotInteractableException,
    NoSuchElementException
)


class ActionType(Enum):
    FILL = "fill"
    SELECT = "select"
    CLICK = "click"
    NAVIGATE = "navigate"


class ActionState(Enum):
    LOADING = "loading"
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class ExecutorConfig:
    """Configuración del executor."""
    # Delays globales (sobreescriben tiempos por pregunta si están activos)
    override_delays: bool = False
    delay_min_ms: int = 500
    delay_max_ms: int = 1500
    delay_between_rows_ms: int = 2000
    delay_between_rows_random: bool = True
    delay_between_rows_min_ms: int = 1000
    delay_between_rows_max_ms: int = 3000
    
    # Human actions
    human_actions_enabled: bool = False
    scroll_to_element: bool = True
    move_mouse_to_element: bool = True
    click_question_first: bool = True
    typing_delay_min_ms: int = 30
    typing_delay_max_ms: int = 120
    validate_after_fill: bool = True
    
    # Timeouts
    element_wait_timeout: int = 10
    page_load_timeout: int = 30
    
    # Ejecución
    one_by_one_mode: bool = False
    
    @classmethod
    def from_dict(cls, data: dict) -> 'ExecutorConfig':
        """Crear config desde diccionario."""
        return cls(
            override_delays=data.get("overrideDelays", False),
            delay_min_ms=data.get("delayMinMs", 500),
            delay_max_ms=data.get("delayMaxMs", 1500),
            delay_between_rows_ms=data.get("delayBetweenRowsMs", 2000),
            delay_between_rows_random=data.get("delayBetweenRowsRandom", True),
            delay_between_rows_min_ms=data.get("delayBetweenRowsMinMs", 1000),
            delay_between_rows_max_ms=data.get("delayBetweenRowsMaxMs", 3000),
            human_actions_enabled=data.get("humanActionsEnabled", False),
            scroll_to_element=data.get("scrollToElement", True),
            move_mouse_to_element=data.get("moveMouseToElement", True),
            click_question_first=data.get("clickQuestionFirst", True),
            typing_delay_min_ms=data.get("typingDelayMinMs", 30),
            typing_delay_max_ms=data.get("typingDelayMaxMs", 120),
            validate_after_fill=data.get("validateAfterFill", True),
            element_wait_timeout=data.get("elementWaitTimeout", 10),
            one_by_one_mode=data.get("oneByOne", False),
        )


@dataclass
class ActionResult:
    """Resultado de una acción."""
    success: bool
    question_key: str
    action_type: ActionType
    error_message: str = ""
    value_filled: str = ""


class FormExecutor:
    """Motor de ejecución de formularios MS Forms."""
    
    def __init__(
        self,
        driver: WebDriver,
        package_data: dict,
        config: ExecutorConfig = None,
        on_action_start: Callable[[dict], None] = None,
        on_action_complete: Callable[[ActionResult], None] = None,
        on_action_error: Callable[[str, str], None] = None,
        on_row_complete: Callable[[int], None] = None,
        on_status_change: Callable[[str, str], None] = None,
    ):
        """
        Inicializar executor.
        
        Args:
            driver: WebDriver de Selenium
            package_data: Datos del paquete .afpkg parseados
            config: Configuración del executor
            on_action_start: Callback al iniciar acción (recibe dict con info de la acción)
            on_action_complete: Callback al completar acción
            on_action_error: Callback en error (key, mensaje)
            on_row_complete: Callback al completar fila (índice)
            on_status_change: Callback cambio de estado (estado, mensaje)
        """
        self.driver = driver
        self.config = config or ExecutorConfig()
        
        # Extraer datos del paquete
        full_data = package_data.get("data", package_data)
        self.instructions = full_data.get("instructions", {})
        self.resolved_rows = full_data.get("resolvedRows", [])
        self.pages = self.instructions.get("pages", [])
        self.form_url = self.instructions.get("url", "")
        
        # Callbacks
        self.on_action_start = on_action_start
        self.on_action_complete = on_action_complete
        self.on_action_error = on_action_error
        self.on_row_complete = on_row_complete
        self.on_status_change = on_status_change
        
        # Estado
        self.is_running = False
        self.is_paused = False
        self.should_stop = False
        self.current_row_index = 0
        self.current_page_index = 0
        self.current_question_index = 0
        
        # Índice de preguntas para acceso rápido
        self._build_question_index()
    
    def _build_question_index(self):
        """Construir índice de preguntas para acceso rápido."""
        self.question_index: Dict[str, dict] = {}
        self.questions_ordered: List[dict] = []
        
        for page in self.pages:
            for question in page.get("questions", []):
                key = question.get("key", "")
                if key:
                    self.question_index[key] = question
                    self.questions_ordered.append(question)
    
    def _emit_status(self, status: str, message: str):
        """Emitir cambio de estado."""
        print(f"[FormExecutor] {message}")
        if self.on_status_change:
            try:
                self.on_status_change(status, message)
            except Exception as e:
                print(f"[FormExecutor] Callback error: {e}")
    
    def _emit_action_start(self, action_info: dict):
        """Notificar inicio de acción."""
        if self.on_action_start:
            try:
                self.on_action_start(action_info)
            except Exception as e:
                print(f"[FormExecutor] Action start callback error: {e}")
    
    def _emit_action_complete(self, result: ActionResult):
        """Notificar acción completada."""
        if self.on_action_complete:
            try:
                self.on_action_complete(result)
            except Exception as e:
                print(f"[FormExecutor] Action complete callback error: {e}")
    
    def _random_delay(self, min_ms: int, max_ms: int):
        """Esperar un tiempo aleatorio."""
        delay_ms = random.randint(min_ms, max_ms)
        time.sleep(delay_ms / 1000.0)
    
    def _get_question_delay(self, question: dict) -> Tuple[int, int]:
        """Obtener delay para una pregunta (de la config o del question timing)."""
        if self.config.override_delays:
            return (self.config.delay_min_ms, self.config.delay_max_ms)
        
        timing = question.get("timing")
        if timing:
            return (timing.get("minMs", 500), timing.get("maxMs", 1500))
        
        return (500, 1500)  # Default
    
    # ═══════════════════════════════════════════════════════════════════════
    # HUMAN ACTIONS
    # ═══════════════════════════════════════════════════════════════════════
    
    def _scroll_to_element(self, element: WebElement):
        """Hacer scroll suave hasta el elemento."""
        try:
            self.driver.execute_script(
                "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});",
                element
            )
            time.sleep(0.3)  # Esperar animación de scroll
        except Exception as e:
            print(f"[FormExecutor] Scroll error: {e}")
    
    def _move_mouse_to_element(self, element: WebElement):
        """Mover el mouse hacia el elemento con movimiento natural."""
        try:
            actions = ActionChains(self.driver)
            # Movimiento con pequeña variación aleatoria
            offset_x = random.randint(-5, 5)
            offset_y = random.randint(-5, 5)
            actions.move_to_element_with_offset(element, offset_x, offset_y)
            actions.perform()
            time.sleep(random.uniform(0.1, 0.3))
        except Exception as e:
            print(f"[FormExecutor] Mouse move error: {e}")
    
    def _human_type(self, element: WebElement, text: str):
        """Escribir texto con velocidad humana (delay entre caracteres)."""
        for char in text:
            element.send_keys(char)
            delay_ms = random.randint(
                self.config.typing_delay_min_ms,
                self.config.typing_delay_max_ms
            )
            time.sleep(delay_ms / 1000.0)
    
    def _validate_input_value(self, element: WebElement, expected_value: str) -> bool:
        """Validar que el input contiene el valor esperado."""
        try:
            actual_value = element.get_attribute("value") or ""
            return actual_value.strip() == expected_value.strip()
        except Exception:
            return False
    
    # ═══════════════════════════════════════════════════════════════════════
    # ELEMENT FINDING WITH FALLBACK
    # ═══════════════════════════════════════════════════════════════════════
    
    def _find_element_robust(
        self,
        selectors: List[Tuple[str, str]],
        timeout: int = None
    ) -> Optional[WebElement]:
        """
        Buscar elemento con múltiples selectores (fallback).
        
        Args:
            selectors: Lista de (nombre, selector_css)
            timeout: Timeout en segundos
        
        Returns:
            WebElement encontrado o None
        """
        timeout = timeout or self.config.element_wait_timeout
        
        for name, selector in selectors:
            if not selector:
                continue
            try:
                element = WebDriverWait(self.driver, timeout / len(selectors)).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                print(f"[FormExecutor] Element found via {name}: {selector[:50]}...")
                return element
            except TimeoutException:
                continue
            except Exception as e:
                print(f"[FormExecutor] Selector '{name}' failed: {e}")
                continue
        
        return None
    
    def _find_text_input(self, question: dict) -> Optional[WebElement]:
        """Encontrar campo de texto para una pregunta."""
        selenium_info = question.get("selenium", {})
        
        selectors = [
            ("fullSelector", selenium_info.get("fullSelector")),
            ("selector", selenium_info.get("selector")),
        ]
        
        return self._find_element_robust(selectors)
    
    def _find_option_element(self, question: dict, answer_value: str) -> Optional[WebElement]:
        """Encontrar opción para seleccionar."""
        options = question.get("options", [])
        
        # Buscar la opción que coincide con el valor de respuesta
        target_option = None
        for opt in options:
            if opt.get("value") == answer_value:
                target_option = opt
                break
        
        if not target_option:
            # Intentar match parcial
            for opt in options:
                if answer_value in opt.get("value", "") or opt.get("value", "") in answer_value:
                    target_option = opt
                    break
        
        if not target_option:
            print(f"[FormExecutor] Option not found for value: {answer_value}")
            return None
        
        opt_selenium = target_option.get("selenium", {})
        
        selectors = [
            ("byValue", opt_selenium.get("byValue")),
            ("byInputValue", opt_selenium.get("byInputValue")),
            ("byPosition", opt_selenium.get("byPosition")),
        ]
        
        return self._find_element_robust(selectors)
    
    def _find_navigation_button(self, nav_type: str, page: dict) -> Optional[WebElement]:
        """Encontrar botón de navegación (next/submit/back)."""
        navigation = page.get("navigation", {})
        nav_info = navigation.get(nav_type)
        
        if not nav_info:
            return None
        
        selector = nav_info.get("selector")
        if not selector:
            return None
        
        return self._find_element_robust([("navigation", selector)])
    
    # ═══════════════════════════════════════════════════════════════════════
    # QUESTION EXECUTION
    # ═══════════════════════════════════════════════════════════════════════
    
    def _execute_fill(self, question: dict, answer: str) -> ActionResult:
        """Ejecutar acción de rellenar texto."""
        key = question.get("key", "unknown")
        
        try:
            # 1. Buscar elemento
            element = self._find_text_input(question)
            if not element:
                return ActionResult(
                    success=False,
                    question_key=key,
                    action_type=ActionType.FILL,
                    error_message="Input element not found"
                )
            
            # 2. Human actions (si están habilitadas)
            if self.config.human_actions_enabled:
                if self.config.scroll_to_element:
                    self._scroll_to_element(element)
                
                if self.config.move_mouse_to_element:
                    self._move_mouse_to_element(element)
                
                if self.config.click_question_first:
                    element.click()
                    time.sleep(0.1)
            
            # 3. Limpiar campo existente
            element.clear()
            time.sleep(0.1)
            
            # 4. Escribir valor
            if self.config.human_actions_enabled:
                self._human_type(element, answer)
            else:
                element.send_keys(answer)
            
            # 5. Validar (si está habilitado)
            if self.config.human_actions_enabled and self.config.validate_after_fill:
                if not self._validate_input_value(element, answer):
                    # Reintentar
                    element.clear()
                    time.sleep(0.1)
                    element.send_keys(answer)
            
            return ActionResult(
                success=True,
                question_key=key,
                action_type=ActionType.FILL,
                value_filled=answer
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                question_key=key,
                action_type=ActionType.FILL,
                error_message=str(e)
            )
    
    def _execute_select(self, question: dict, answer: str) -> ActionResult:
        """Ejecutar acción de seleccionar opción."""
        key = question.get("key", "unknown")
        
        try:
            # 1. Buscar elemento de opción
            element = self._find_option_element(question, answer)
            if not element:
                return ActionResult(
                    success=False,
                    question_key=key,
                    action_type=ActionType.SELECT,
                    error_message=f"Option element not found for value: {answer}"
                )
            
            # 2. Human actions
            if self.config.human_actions_enabled:
                if self.config.scroll_to_element:
                    self._scroll_to_element(element)
                
                if self.config.move_mouse_to_element:
                    self._move_mouse_to_element(element)
            
            # 3. Click en la opción
            element.click()
            
            return ActionResult(
                success=True,
                question_key=key,
                action_type=ActionType.SELECT,
                value_filled=answer
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                question_key=key,
                action_type=ActionType.SELECT,
                error_message=str(e)
            )
    
    def _execute_question(self, question: dict, answer: str, question_num: int) -> ActionResult:
        """Ejecutar una pregunta según su tipo."""
        key = question.get("key", "unknown")
        q_type = question.get("type", "text")
        selenium_info = question.get("selenium", {})
        action = selenium_info.get("action", "fill")
        
        # Notificar inicio de acción
        action_info = {
            "num": question_num,
            "type": action,
            "question": question.get("text", key),
            "answer": answer,
            "key": key,
        }
        
        # Agregar opciones si es select
        if action == "select":
            options = question.get("options", [])
            action_info["options"] = [opt.get("value", "") for opt in options]
        
        self._emit_action_start(action_info)
        
        # Ejecutar según tipo
        if action == "fill":
            result = self._execute_fill(question, answer)
        elif action == "select":
            result = self._execute_select(question, answer)
        else:
            result = ActionResult(
                success=False,
                question_key=key,
                action_type=ActionType.FILL,
                error_message=f"Unknown action type: {action}"
            )
        
        # Notificar resultado
        self._emit_action_complete(result)
        
        return result
    
    # ═══════════════════════════════════════════════════════════════════════
    # PAGE NAVIGATION
    # ═══════════════════════════════════════════════════════════════════════
    
    def _navigate_to_next_page(self, current_page: dict) -> bool:
        """Navegar a la siguiente página."""
        nav_button = self._find_navigation_button("next", current_page)
        if nav_button:
            if self.config.human_actions_enabled:
                self._scroll_to_element(nav_button)
                self._move_mouse_to_element(nav_button)
            nav_button.click()
            time.sleep(1.0)  # Esperar carga de página
            return True
        return False
    
    def _submit_form(self, current_page: dict) -> bool:
        """Enviar el formulario."""
        submit_button = self._find_navigation_button("submit", current_page)
        if submit_button:
            if self.config.human_actions_enabled:
                self._scroll_to_element(submit_button)
                self._move_mouse_to_element(submit_button)
            submit_button.click()
            time.sleep(2.0)  # Esperar confirmación
            return True
        return False
    
    # ═══════════════════════════════════════════════════════════════════════
    # ROW EXECUTION
    # ═══════════════════════════════════════════════════════════════════════
    
    def execute_row(self, row_index: int) -> bool:
        """
        Ejecutar todas las acciones para una fila.
        
        Args:
            row_index: Índice de la fila en resolvedRows
        
        Returns:
            True si se completó exitosamente
        """
        if row_index >= len(self.resolved_rows):
            self._emit_status("error", f"Row index {row_index} out of range")
            return False
        
        row = self.resolved_rows[row_index]
        answers = row.get("answers", {})
        
        self._emit_status("running", f"Ejecutando fila {row_index + 1}/{len(self.resolved_rows)}")
        
        question_num = 0
        
        for page_idx, page in enumerate(self.pages):
            if self.should_stop:
                return False
            
            while self.is_paused:
                time.sleep(0.5)
                if self.should_stop:
                    return False
            
            questions = page.get("questions", [])
            
            for question in questions:
                if self.should_stop:
                    return False
                
                while self.is_paused:
                    time.sleep(0.5)
                    if self.should_stop:
                        return False
                
                question_num += 1
                key = question.get("key", "")
                answer = answers.get(key, "")
                
                if not answer:
                    print(f"[FormExecutor] No answer for {key}, skipping")
                    continue
                
                # Ejecutar pregunta
                result = self._execute_question(question, answer, question_num)
                
                if not result.success:
                    self._emit_status("error", f"Error en {key}: {result.error_message}")
                    if self.on_action_error:
                        self.on_action_error(key, result.error_message)
                    # Continuar con siguiente pregunta (no abortar)
                
                # Delay antes de siguiente pregunta
                delay_min, delay_max = self._get_question_delay(question)
                self._random_delay(delay_min, delay_max)
            
            # Navegación al final de la página
            navigation = page.get("navigation", {})
            
            if navigation.get("submit"):
                # Última página - enviar
                if not self._submit_form(page):
                    self._emit_status("warning", "Submit button not found")
            elif navigation.get("next"):
                # Página intermedia - siguiente
                if not self._navigate_to_next_page(page):
                    self._emit_status("warning", "Next button not found")
        
        self._emit_status("success", f"Fila {row_index + 1} completada")
        
        if self.on_row_complete:
            self.on_row_complete(row_index)
        
        return True
    
    # ═══════════════════════════════════════════════════════════════════════
    # MAIN EXECUTION LOOP
    # ═══════════════════════════════════════════════════════════════════════
    
    def start(self, start_row: int = 0):
        """Iniciar ejecución desde una fila específica."""
        self.is_running = True
        self.is_paused = False
        self.should_stop = False
        self.current_row_index = start_row
        
        self._emit_status("running", "Iniciando automatización...")
        
        while self.current_row_index < len(self.resolved_rows):
            if self.should_stop:
                break
            
            while self.is_paused:
                time.sleep(0.5)
                if self.should_stop:
                    break
            
            if self.should_stop:
                break
            
            # Ejecutar fila actual
            success = self.execute_row(self.current_row_index)
            
            if not success:
                self._emit_status("error", f"Error en fila {self.current_row_index + 1}")
            
            self.current_row_index += 1
            
            # Si es modo uno por uno, pausar después de cada fila
            if self.config.one_by_one_mode:
                self.is_paused = True
                self._emit_status("paused", f"Fila completada. Esperando 'next'...")
                continue
            
            # Si hay más filas, esperar y recargar formulario
            if self.current_row_index < len(self.resolved_rows):
                # Delay entre filas
                if self.config.delay_between_rows_random:
                    self._random_delay(
                        self.config.delay_between_rows_min_ms,
                        self.config.delay_between_rows_max_ms
                    )
                else:
                    time.sleep(self.config.delay_between_rows_ms / 1000.0)
                
                # Recargar formulario
                self._emit_status("loading", "Recargando formulario...")
                self.driver.get(self.form_url)
                time.sleep(2.0)  # Esperar carga
        
        self.is_running = False
        self._emit_status("completed", "Automatización completada")
    
    def pause(self):
        """Pausar ejecución."""
        self.is_paused = True
        self._emit_status("paused", "Automatización pausada")
    
    def resume(self):
        """Reanudar ejecución."""
        self.is_paused = False
        self._emit_status("running", "Automatización reanudada")
    
    def stop(self):
        """Detener ejecución."""
        self.should_stop = True
        self.is_running = False
        self._emit_status("stopped", "Automatización detenida")
    
    def next_row(self):
        """Avanzar a la siguiente fila (modo uno por uno)."""
        if self.config.one_by_one_mode and self.is_paused:
            self.is_paused = False
    
    def jump_to_row(self, row_index: int):
        """Saltar a una fila específica."""
        if 0 <= row_index < len(self.resolved_rows):
            self.current_row_index = row_index
            self._emit_status("info", f"Saltando a fila {row_index + 1}")
    
    def update_config(self, new_config: dict):
        """Actualizar configuración en tiempo real."""
        self.config = ExecutorConfig.from_dict(new_config)
        self._emit_status("info", "Configuración actualizada")
