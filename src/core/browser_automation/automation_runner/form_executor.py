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
    NoSuchElementException,
    ElementClickInterceptedException
)

# Arquitectura modular
from .modules import (
    WidgetController,
    Timing,
    VisualFeedback,
    ViewportController,
    ElementFinder,
    Interaction,
    Validator,
    # PostSubmit modules
    PostSubmitExecutor,
    PostSubmitConfig,
    AutomationResultStorage,
    LoginDetector,
    LoginConfig
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
    # ═══ Sección 1: Tiempos Globales ═══
    # Override tiempos por pregunta
    override_delays: bool = False
    delay_min_ms: int = 500
    delay_max_ms: int = 1500
    # Delay entre filas (formularios)
    delay_between_rows_ms: int = 2000
    delay_between_rows_random: bool = True
    delay_between_rows_min_ms: int = 1000
    delay_between_rows_max_ms: int = 3000
    
    # ═══ Sección 2: Human Actions ═══
    human_actions_enabled: bool = True
    scroll_to_element: bool = True
    move_mouse_to_element: bool = True
    click_question_first: bool = True
    
    # ═══ Sección 3: Validación ═══
    validate_after_fill: bool = True
    validate_after_select: bool = True
    
    # ═══ Sección 4: Configuración de Llenado (FILL) ═══
    # Método para textos cortos (< long_text_threshold): 'keyByKey', 'sendKeys', 'ctrlV', 'jsValue'
    short_text_method: str = 'keyByKey'
    typing_delay_min_ms: int = 30
    typing_delay_max_ms: int = 120
    
    # Textos largos (>= long_text_threshold y < very_long_text_threshold)
    auto_detect_long_text: bool = True
    long_text_threshold: int = 30  # Caracteres
    long_text_method: str = 'sendKeys'  # 'keyByKey', 'sendKeys', 'ctrlV', 'jsValue'
    
    # Textos muy largos (>= very_long_text_threshold)
    very_long_text_threshold: int = 100  # Caracteres
    very_long_text_method: str = 'jsValue'  # 'sendKeys', 'ctrlV', 'jsValue'
    
    # ═══ Sección 5: Visual Feedback ═══
    highlight_elements: bool = True
    
    # ═══ Sección 6: Delays Especiales ═══
    page_change_delay_ms: int = 2000
    branch_delay_ms: int = 1500
    
    # ═══ Sección 7: Post Submit Actions ═══
    post_submit_enabled: bool = False
    post_submit_timeout_ms: int = 60000
    
    # ═══ Error Handling & Timeouts ═══
    stop_on_error: bool = True
    max_retries: int = 1
    element_wait_timeout: int = 10
    page_load_timeout: int = 30
    
    # Ejecución
    one_by_one_mode: bool = False
    
    @classmethod
    def from_dict(cls, data: dict) -> 'ExecutorConfig':
        """Crear config desde diccionario."""
        return cls(
            # Tiempos globales
            override_delays=data.get("overrideDelays", False),
            delay_min_ms=data.get("delayMinMs", 500),
            delay_max_ms=data.get("delayMaxMs", 1500),
            delay_between_rows_ms=data.get("delayBetweenRowsMs", 2000),
            delay_between_rows_random=data.get("delayBetweenRowsRandom", True),
            delay_between_rows_min_ms=data.get("delayBetweenRowsMinMs", 1000),
            delay_between_rows_max_ms=data.get("delayBetweenRowsMaxMs", 3000),
            # Human actions
            human_actions_enabled=data.get("humanActionsEnabled", True),
            scroll_to_element=data.get("scrollToElement", True),
            move_mouse_to_element=data.get("moveMouseToElement", True),
            click_question_first=data.get("clickQuestionFirst", True),
            # Validation
            validate_after_fill=data.get("validateAfterFill", True),
            validate_after_select=data.get("validateAfterSelect", True),
            # Fill config
            short_text_method=data.get("shortTextMethod", "keyByKey"),
            typing_delay_min_ms=data.get("typingDelayMinMs", 30),
            typing_delay_max_ms=data.get("typingDelayMaxMs", 120),
            auto_detect_long_text=data.get("autoDetectLongText", True),
            long_text_threshold=data.get("longTextThreshold", 30),
            long_text_method=data.get("longTextMethod", "sendKeys"),
            very_long_text_threshold=data.get("veryLongTextThreshold", 100),
            very_long_text_method=data.get("veryLongTextMethod", "jsValue"),
            # Visual
            highlight_elements=data.get("highlightElements", True),
            # Delays especiales
            page_change_delay_ms=data.get("pageChangeDelayMs", 2000),
            branch_delay_ms=data.get("branchDelayMs", 1500),
            # Post Submit
            post_submit_enabled=data.get("postSubmitEnabled", False),
            post_submit_timeout_ms=data.get("postSubmitTimeoutMs", 60000),
            # Error handling
            stop_on_error=data.get("stopOnError", True),
            max_retries=data.get("maxRetries", 1),
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
        self.on_ui_reinject: Callable[[], None] = None  # Called when UI needs re-injection
        
        # Estado
        self.is_running = False
        self.is_paused = False
        self.should_stop = False
        self.current_row_index = 0
        self.current_page_index = 0
        self.current_question_index = 0
        
        # ═══════════════════════════════════════════════════════════════════
        # MÓDULOS DE ARQUITECTURA LIMPIA
        # ═══════════════════════════════════════════════════════════════════
        # Cada módulo tiene una responsabilidad única
        self.widget = WidgetController(driver)
        self.timing = Timing()
        self.visual = VisualFeedback(driver)
        self.viewport = ViewportController(driver)
        self.finder = ElementFinder(driver, timeout=self.config.element_wait_timeout)
        self.interaction = Interaction(driver, self.widget)
        self.validator = Validator(driver)
        
        # ═══════════════════════════════════════════════════════════════════
        # POSTSUBMIT MODULES
        # ═══════════════════════════════════════════════════════════════════
        # PostSubmit se configura desde ExecutorConfig (viene de la UI inyectada)
        self.postsubmit_enabled = self.config.post_submit_enabled
        self.postsubmit_executor = None
        self.result_storage = None
        
        if self.postsubmit_enabled:
            # Leer selectores de postSubmit desde el paquete
            postsubmit_info = self.instructions.get("postSubmit", {})
            save_and_edit_info = postsubmit_info.get("saveAndEdit", {})
            save_selector = save_and_edit_info.get("selector", "[data-automation-id='saveAndEditButton']")
            
            # Construir lista de selectores (primero el del paquete, luego fallbacks)
            save_selectors = [save_selector] if save_selector else []
            save_selectors.extend([
                "[data-automation-id='saveAndEditButton']",
                "[data-automation-id='saveEditButton']",
                "button[aria-label*='Guardar mi respuesta']"
            ])
            
            # Configurar PostSubmit
            ps_config = PostSubmitConfig(
                enabled=True,
                url_capture_timeout_ms=self.config.post_submit_timeout_ms,
                relogin_timeout_ms=600000,  # 10 minutos por defecto
                save_button_selectors=save_selectors
            )
            self.postsubmit_executor = PostSubmitExecutor(driver, ps_config)
            
            # Inicializar almacenamiento de resultados
            package_name = package_data.get("filename", "unknown.afpkg")
            package_path = package_data.get("path", "")
            self.result_storage = AutomationResultStorage(
                package_name=package_name,
                package_path=package_path
            )
            print(f"[FormExecutor] PostSubmit habilitado con timeout {self.config.post_submit_timeout_ms}ms")
            print(f"[FormExecutor] PostSubmit selector: {save_selector}")
        
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
    # LOGGING & DEBUG
    # ═══════════════════════════════════════════════════════════════════════
    
    def _log(self, step: int, total: int, message: str, level: str = "info"):
        """Logging estructurado con pasos numerados para debug."""
        icons = {
            "info": "📍",
            "success": "✅",
            "warning": "⚠️",
            "error": "❌",
            "wait": "⏳",
            "action": "🔹"
        }
        icon = icons.get(level, "•")
        step_str = f"[{step}/{total}]" if total > 0 else ""
        print(f"[FormExecutor] {icon} {step_str} {message}", flush=True)
    
    def _get_question_index(self, key: str) -> int:
        """Obtener índice de pregunta en la lista ordenada."""
        for i, q in enumerate(self.questions_ordered):
            if q.get("key") == key:
                return i + 1
        return 0
    
    # ═══════════════════════════════════════════════════════════════════════
    # ELEMENT HELPERS
    # ═══════════════════════════════════════════════════════════════════════
    
    def _get_question_container(self, question: dict) -> Optional[WebElement]:
        """Obtener el contenedor padre de la pregunta (div[data-automation-id='questionItem']).
        
        Busca el contenedor que contiene el QuestionId específico.
        """
        try:
            selenium_info = question.get("selenium", {})
            full_selector = selenium_info.get("fullSelector", "")
            
            if not full_selector:
                self._log(0, 0, "DEBUG: No hay fullSelector en question", "warning")
                return None
            
            # Extraer QuestionId del selector
            import re
            match = re.search(r'QuestionId_r([a-f0-9]+)', full_selector)
            if not match:
                self._log(0, 0, f"DEBUG: No se encontró QuestionId en: {full_selector[:50]}...", "warning")
                return None
            
            q_id = f"QuestionId_r{match.group(1)}"
            self._log(0, 0, f"DEBUG: Buscando contenedor para {q_id}", "info")
            
            # Log en consola del navegador
            self.driver.execute_script(f"""
                console.log('[AutoForms DEBUG] Buscando contenedor para: {q_id}');
            """)
            
            # Buscar el elemento con ese ID y luego subir al questionItem padre
            try:
                q_element = self.driver.find_element(By.ID, q_id)
                # Subir hasta encontrar div[data-automation-id="questionItem"]
                container = self.driver.execute_script("""
                    let el = arguments[0];
                    let maxDepth = 10;
                    while (el && maxDepth > 0) {
                        if (el.getAttribute && el.getAttribute('data-automation-id') === 'questionItem') {
                            console.log('[AutoForms DEBUG] ✓ Contenedor encontrado:', el);
                            return el;
                        }
                        el = el.parentElement;
                        maxDepth--;
                    }
                    console.log('[AutoForms DEBUG] ✗ No se encontró questionItem container');
                    return null;
                """, q_element)
                
                if container:
                    self._log(0, 0, f"DEBUG: ✓ Contenedor questionItem encontrado", "success")
                    return container
                else:
                    self._log(0, 0, f"DEBUG: No se encontró questionItem padre", "warning")
                    return q_element  # Fallback al elemento directo
                    
            except NoSuchElementException:
                self._log(0, 0, f"DEBUG: Elemento {q_id} no existe en DOM", "error")
                return None
                
        except Exception as e:
            self._log(0, 0, f"DEBUG Error en _get_question_container: {e}", "error")
            import traceback
            traceback.print_exc()
        
        return None
    
    # ═══════════════════════════════════════════════════════════════════════
    # VALIDATION (con debug en navegador)
    # ═══════════════════════════════════════════════════════════════════════
    
    def _validate_fill_value(self, element: WebElement, expected: str) -> bool:
        """Validación INFALIBLE para FILL usando JS value property."""
        try:
            actual = self.driver.execute_script("""
                let val = arguments[0].value;
                console.log('[AutoForms DEBUG] FILL value:', val);
                return val;
            """, element)
            is_valid = (actual or "").strip() == expected.strip()
            if is_valid:
                self._log(0, 0, f"Validación OK: '{actual[:30]}...' = esperado", "success")
            else:
                self._log(0, 0, f"Validación FALLÓ: obtuve '{actual}', esperaba '{expected}'", "error")
            return is_valid
        except Exception as e:
            self._log(0, 0, f"Error en validación FILL: {e}", "error")
            return False
    
    def _validate_select_value(self, clicked_element: WebElement, expected_answer: str) -> bool:
        """Validación INFALIBLE para SELECT.
        
        Busca el INPUT con aria-checked='true' DENTRO o cerca del elemento clickeado.
        
        Estructura del DOM de MS Forms:
        <span data-automation-value="..." data-automation-id="radio">
            <input aria-checked="true" type="radio" value="...">
            ...
        </span>
        
        El input está DENTRO del span que clickeamos.
        """
        try:
            # Ejecutar validación en JavaScript usando el elemento clickeado
            result = self.driver.execute_script("""
                const clickedElement = arguments[0];
                const expectedAnswer = arguments[1];
                
                console.log('='.repeat(50));
                console.log('[AutoForms VALIDACIÓN] ★★★ VALIDANDO SELECT ★★★');
                console.log('[AutoForms VALIDACIÓN] Elemento clickeado:', clickedElement);
                console.log('[AutoForms VALIDACIÓN] Tag:', clickedElement.tagName);
                console.log('[AutoForms VALIDACIÓN] data-automation-value:', clickedElement.getAttribute('data-automation-value'));
                console.log('[AutoForms VALIDACIÓN] Respuesta esperada:', expectedAnswer);
                
                // ESTRATEGIA 1: Buscar input DENTRO del elemento clickeado
                let inputElement = clickedElement.querySelector('input[type="radio"], input[type="checkbox"]');
                
                if (inputElement) {
                    console.log('[AutoForms VALIDACIÓN] ✓ Input encontrado DENTRO del elemento');
                    console.log('[AutoForms VALIDACIÓN]   aria-checked:', inputElement.getAttribute('aria-checked'));
                    console.log('[AutoForms VALIDACIÓN]   value:', inputElement.value);
                    
                    const isChecked = inputElement.getAttribute('aria-checked') === 'true';
                    if (isChecked) {
                        console.log('[AutoForms VALIDACIÓN] ✓✓✓ VALIDACIÓN OK - aria-checked=true');
                        return { success: true, method: 'input-inside', value: inputElement.value };
                    }
                }
                
                // ESTRATEGIA 2: Si el elemento clickeado ES el input
                if (clickedElement.tagName === 'INPUT') {
                    console.log('[AutoForms VALIDACIÓN] El elemento clickeado ES un input');
                    const isChecked = clickedElement.getAttribute('aria-checked') === 'true';
                    console.log('[AutoForms VALIDACIÓN]   aria-checked:', clickedElement.getAttribute('aria-checked'));
                    if (isChecked) {
                        console.log('[AutoForms VALIDACIÓN] ✓✓✓ VALIDACIÓN OK');
                        return { success: true, method: 'direct-input', value: clickedElement.value };
                    }
                }
                
                // ESTRATEGIA 3: Buscar input como hermano
                const parent = clickedElement.parentElement;
                if (parent) {
                    const siblingInput = parent.querySelector('input[aria-checked="true"]');
                    if (siblingInput) {
                        console.log('[AutoForms VALIDACIÓN] ✓ Input encontrado como HERMANO');
                        console.log('[AutoForms VALIDACIÓN]   value:', siblingInput.value);
                        return { success: true, method: 'sibling', value: siblingInput.value };
                    }
                }
                
                // ESTRATEGIA 4: Subir hasta el label y buscar
                let searchElement = clickedElement;
                for (let i = 0; i < 5; i++) {
                    if (!searchElement) break;
                    
                    const foundInput = searchElement.querySelector('input[aria-checked="true"]');
                    if (foundInput) {
                        console.log('[AutoForms VALIDACIÓN] ✓ Input encontrado subiendo ' + i + ' niveles');
                        console.log('[AutoForms VALIDACIÓN]   value:', foundInput.value);
                        return { success: true, method: 'ancestor-' + i, value: foundInput.value };
                    }
                    searchElement = searchElement.parentElement;
                }
                
                // ESTRATEGIA 5: Buscar por data-automation-value
                const automationValue = clickedElement.getAttribute('data-automation-value');
                if (automationValue) {
                    console.log('[AutoForms VALIDACIÓN] Buscando por data-automation-value:', automationValue);
                    const matchingInput = document.querySelector(`input[value="${automationValue}"]`);
                    if (matchingInput) {
                        const isChecked = matchingInput.getAttribute('aria-checked') === 'true';
                        console.log('[AutoForms VALIDACIÓN]   aria-checked:', matchingInput.getAttribute('aria-checked'));
                        if (isChecked) {
                            console.log('[AutoForms VALIDACIÓN] ✓✓✓ VALIDACIÓN OK por data-automation-value');
                            return { success: true, method: 'data-automation-value', value: automationValue };
                        }
                    }
                }
                
                // DEBUG: Mostrar todos los inputs cercanos
                console.log('[AutoForms VALIDACIÓN] ✗ No se encontró input seleccionado');
                console.log('[AutoForms VALIDACIÓN] DEBUG - Inputs en el documento con aria-checked=true:');
                const allChecked = document.querySelectorAll('input[aria-checked="true"]');
                allChecked.forEach((inp, i) => {
                    console.log('[AutoForms VALIDACIÓN]   [' + i + '] value=' + inp.value);
                });
                
                return { success: false, error: 'No aria-checked=true found', checkedCount: allChecked.length };
                
            """, clicked_element, expected_answer)
            
            # Procesar resultado
            if result and result.get("success"):
                method = result.get("method", "unknown")
                value = result.get("value", "")
                self._log(0, 0, f"✓ Validación SELECT OK (método: {method}, valor: {value[:30]}...)", "success")
                return True
            else:
                error = result.get("error", "Unknown") if result else "No result"
                checked_count = result.get("checkedCount", 0) if result else 0
                self._log(0, 0, f"✗ Validación SELECT FALLÓ: {error} (inputs checked en doc: {checked_count})", "error")
                return False
                
        except Exception as e:
            self._log(0, 0, f"Error en validación SELECT: {e}", "error")
            import traceback
            traceback.print_exc()
            return False
    
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
    
    def _type_via_clipboard(self, element: WebElement, text: str):
        """Escribir texto via clipboard (Ctrl+V). Más rápido para textos largos."""
        try:
            from selenium.webdriver.common.keys import Keys
            import pyperclip
            
            # Copiar texto al clipboard
            pyperclip.copy(text)
            
            # Pegar con Ctrl+V
            element.send_keys(Keys.CONTROL, 'v')
            time.sleep(0.1)
            
            self._log(0, 0, f"Clipboard paste exitoso ({len(text)} chars)", "success")
        except ImportError:
            # Si pyperclip no está disponible, usar fallback
            self._log(0, 0, "pyperclip no disponible, usando sendKeys", "warning")
            element.send_keys(text)
        except Exception as e:
            self._log(0, 0, f"Clipboard paste falló: {e}, usando sendKeys", "warning")
            element.send_keys(text)
    
    def _type_via_js(self, element: WebElement, text: str):
        """Escribir texto via JavaScript (ULTRA RÁPIDO para textos largos de 1000+ chars)."""
        try:
            # Setear valor directamente via JS
            self.driver.execute_script("""
                const el = arguments[0];
                const text = arguments[1];
                
                // Log inicio
                console.log('[AutoForms] 🚀 JS VALUE INJECTION iniciando...');
                console.log('[AutoForms] 📝 Texto longitud: ' + text.length + ' chars');
                
                // Setear valor
                el.value = text;
                
                // Disparar eventos para que el formulario detecte el cambio
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                
                console.log('[AutoForms] ✅ JS VALUE INJECTION completado');
            """, element, text)
            
            self._browser_log(f"JS injection exitoso ({len(text)} chars)")
            
        except Exception as e:
            self._browser_log(f"JS injection falló: {e}, usando sendKeys", "error")
            element.send_keys(text)
    
    def _browser_log(self, msg: str, level: str = "info"):
        """Enviar log quirúrgico a consola del navegador."""
        import json
        icons = {"info": "📍", "success": "✅", "warning": "⚠️", "error": "❌", "action": "🔹", "wait": "⏳"}
        icon = icons.get(level, "•")
        try:
            # Usar json.dumps para escape correcto de caracteres especiales
            log_msg = f"[AutoForms] {icon} {msg}"
            # json.dumps escapa correctamente \n, \r, \t, comillas, etc.
            safe_js_string = json.dumps(log_msg)
            self.driver.execute_script(f"console.log({safe_js_string});")
        except Exception:
            pass
        # También imprimir en consola Python
        print(f"[AutoForms] {icon} {msg}", flush=True)
    
    def _check_pause_state(self) -> bool:
        """Chequear si está pausado. Retorna True si debe continuar, False si debe abortar."""
        if self.should_stop:
            self._browser_log("STOP detectado - abortando", "error")
            return False
        
        if self.is_paused:
            self._browser_log("PAUSE detectado - esperando resume...", "wait")
            while self.is_paused:
                time.sleep(0.3)
                if self.should_stop:
                    self._browser_log("STOP detectado durante pausa - abortando", "error")
                    return False
            self._browser_log("RESUME detectado - continuando", "success")
        
        return True
    
    def _execute_write_method(self, element: WebElement, text: str, method: str):
        """Ejecutar escritura según el método especificado."""
        if method == 'jsValue':
            self._type_via_js(element, text)
        elif method == 'ctrlV':
            self._type_via_clipboard(element, text)
        elif method == 'keyByKey' and self.config.human_actions_enabled:
            typing_info = f"(delay: {self.config.typing_delay_min_ms}-{self.config.typing_delay_max_ms}ms/tecla)"
            self._browser_log(f"Escribiendo tecla por tecla {typing_info}...", "info")
            self._human_type(element, text)
        else:  # sendKeys (default)
            element.send_keys(text)
    
    def _validate_input_value(self, element: WebElement, expected_value: str) -> bool:
        """Validar que el input contiene el valor esperado."""
        try:
            actual_value = element.get_attribute("value") or ""
            return actual_value.strip() == expected_value.strip()
        except Exception:
            return False
    
    # ═══════════════════════════════════════════════════════════════════════
    # ELEMENT HIGHLIGHTING
    # ═══════════════════════════════════════════════════════════════════════
    
    def _highlight_element(self, element: WebElement, color: str = "#667eea"):
        """Aplicar efecto glow al elemento activo."""
        if not self.config.highlight_elements:
            return
        try:
            # Remover highlight anterior
            self._remove_all_highlights()
            
            # Aplicar nuevo highlight
            self.driver.execute_script("""
                arguments[0].classList.add('__autoforms_highlight');
                
                // Inyectar CSS si no existe
                if (!document.getElementById('__autoforms_highlight_style')) {
                    const style = document.createElement('style');
                    style.id = '__autoforms_highlight_style';
                    style.textContent = `
                        .__autoforms_highlight {
                            outline: 3px solid """ + color + """ !important;
                            box-shadow: 0 0 15px 5px """ + color + """80, 
                                        0 0 30px 10px """ + color + """40 !important;
                            animation: __autoforms_pulse 1.5s ease-in-out infinite !important;
                            transition: all 0.3s ease !important;
                        }
                        @keyframes __autoforms_pulse {
                            0%, 100% { box-shadow: 0 0 15px 5px """ + color + """80, 0 0 30px 10px """ + color + """40; }
                            50% { box-shadow: 0 0 25px 8px """ + color + """99, 0 0 45px 15px """ + color + """60; }
                        }
                    `;
                    document.head.appendChild(style);
                }
            """, element)
        except Exception as e:
            print(f"[FormExecutor] Highlight error: {e}")
    
    def _remove_highlight(self, element: WebElement):
        """Remover highlight de un elemento específico."""
        try:
            self.driver.execute_script(
                "arguments[0].classList.remove('__autoforms_highlight');",
                element
            )
        except Exception:
            pass
    
    def _remove_all_highlights(self):
        """Remover todos los highlights de la página."""
        try:
            self.driver.execute_script("""
                document.querySelectorAll('.__autoforms_highlight').forEach(el => {
                    el.classList.remove('__autoforms_highlight');
                });
            """)
        except Exception:
            pass
    
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
        key = question.get("key", "unknown")
        
        # IMPORTANTE: fullSelector contiene el QuestionId único
        full_selector = selenium_info.get("fullSelector")
        
        print(f"[FormExecutor] === Buscando input para {key} ===")
        print(f"[FormExecutor] fullSelector: {full_selector}")
        
        if full_selector:
            try:
                print(f"[FormExecutor] Intentando con fullSelector...")
                element = WebDriverWait(self.driver, self.config.element_wait_timeout).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, full_selector))
                )
                print(f"[FormExecutor] ✓ Elemento encontrado via fullSelector!")
                return element
            except TimeoutException:
                print(f"[FormExecutor] ✗ Timeout con fullSelector")
            except Exception as e:
                print(f"[FormExecutor] ✗ Error con fullSelector: {e}")
        
        # Fallback: extraer el QuestionId del fullSelector y buscar diferente
        if full_selector and "QuestionId_" in full_selector:
            try:
                # Extraer solo el QuestionId
                import re
                match = re.search(r'QuestionId_([a-zA-Z0-9]+)', full_selector)
                if match:
                    question_id = match.group(1)
                    print(f"[FormExecutor] Intentando con QuestionId extraído: {question_id}")
                    
                    # Selector más flexible: buscar input dentro del contenedor de pregunta
                    alt_selector = f"#QuestionId_r{question_id} ~ div input[data-automation-id='textInput'], " \
                                   f"#QuestionId_r{question_id} ~ div textarea, " \
                                   f"[aria-labelledby*='QuestionId_r{question_id}'][data-automation-id='textInput']"
                    
                    element = WebDriverWait(self.driver, 3).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, alt_selector))
                    )
                    print(f"[FormExecutor] ✓ Elemento encontrado via QuestionId extraído!")
                    return element
            except Exception as e:
                print(f"[FormExecutor] ✗ Fallback QuestionId también falló: {e}")
        
        # Último recurso: buscar por índice (no recomendado pero añade logging)
        print(f"[FormExecutor] ✗ No se pudo encontrar input para {key}")
        print(f"[FormExecutor] ✗ DEBUG: Verifique que el QuestionId del archivo coincida con la página")
        
        return None
    
    def _find_option_element(self, question: dict, answer_value: str) -> Optional[WebElement]:
        """
        Encontrar opción DENTRO del contenedor de la pregunta.
        
        CRÍTICO: Busca SOLO dentro del contenedor de la pregunta específica,
        NO hace búsqueda global que podría encontrar elementos de otras preguntas.
        """
        key = question.get("key", "unknown")
        selenium_info = question.get("selenium", {})
        question_id = selenium_info.get("questionId")  # ej: "r18ff53ab00554484ae4cee5b04ab442d"
        
        # ══════════════════════════════════════════════════════════════════════
        # DEBUG QUIRÚRGICO: Log inicial
        # ══════════════════════════════════════════════════════════════════════
        self.driver.execute_script(f"""
            console.log('');
            console.log('╔══════════════════════════════════════════════════════════════╗');
            console.log('║ 🔍 _find_option_element - BÚSQUEDA QUIRÚRGICA                ║');
            console.log('╠══════════════════════════════════════════════════════════════╣');
            console.log('║ Pregunta: {key}');
            console.log('║ QuestionId: {question_id or "⚠️ NO DISPONIBLE"}');
            console.log('║ Respuesta buscada: "{answer_value}"');
            console.log('╚══════════════════════════════════════════════════════════════╝');
        """)
        
        # ══════════════════════════════════════════════════════════════════════
        # PASO 1: Verificar que tenemos questionId
        # ══════════════════════════════════════════════════════════════════════
        if not question_id:
            self._log(0, 0, f"❌ {key}: No tiene questionId, imposible buscar de forma segura", "error")
            self.driver.execute_script(f"""
                console.error('[AutoForms] ❌ FATAL: Pregunta {key} no tiene questionId');
                console.error('[AutoForms] Sin questionId no podemos limitar la búsqueda');
            """)
            return None
        
        # ══════════════════════════════════════════════════════════════════════
        # PASO 2: Encontrar contenedor de la pregunta
        # ══════════════════════════════════════════════════════════════════════
        self.driver.execute_script(f"console.log('[AutoForms] 📦 PASO 2: Buscando contenedor para questionId={question_id}...');")
        
        container = self._find_question_container_by_id(question_id)
        
        if not container:
            self._log(0, 0, f"❌ {key}: No se encontró contenedor para questionId={question_id}", "error")
            self.driver.execute_script(f"""
                console.error('[AutoForms] ❌ FATAL: No se encontró contenedor para {question_id}');
                console.error('[AutoForms] La pregunta podría no estar visible en la página actual');
            """)
            return None
        
        # Log del contenedor encontrado
        self.driver.execute_script("""
            console.log('[AutoForms] ✓ Contenedor encontrado:');
            console.log('[AutoForms]   Tag:', arguments[0].tagName);
            console.log('[AutoForms]   data-automation-id:', arguments[0].getAttribute('data-automation-id'));
            console.log('[AutoForms]   class:', arguments[0].className);
            console.log('[AutoForms]   Hijos directos:', arguments[0].children.length);
        """, container)
        
        # ══════════════════════════════════════════════════════════════════════
        # PASO 3: Buscar la opción en el AFPKG
        # ══════════════════════════════════════════════════════════════════════
        options = question.get("options", [])
        target_option = None
        
        self.driver.execute_script(f"console.log('[AutoForms] 📋 PASO 3: Buscando opción en AFPKG ({len(options)} opciones disponibles)');")
        
        for i, opt in enumerate(options):
            opt_value = opt.get("value", "")
            is_match = "✓ MATCH" if opt_value == answer_value else ""
            self.driver.execute_script(
                f"console.log('[AutoForms]   [{i}] \"{opt_value}\" {is_match}');"
            )
            if opt_value == answer_value:
                target_option = opt
                break
        
        if not target_option:
            self._log(0, 0, f"❌ {key}: Opción '{answer_value}' no encontrada en AFPKG", "error")
            self.driver.execute_script(f"""
                console.error('[AutoForms] ❌ Opción "{answer_value}" no existe en la lista de opciones del AFPKG');
            """)
            return None
        
        # ══════════════════════════════════════════════════════════════════════
        # PASO 4: Buscar elemento DENTRO del contenedor
        # ══════════════════════════════════════════════════════════════════════
        opt_selenium = target_option.get("selenium", {})
        is_branch = target_option.get("isBranch", False)
        
        self.driver.execute_script(f"""
            console.log('[AutoForms] 🎯 PASO 4: Buscando elemento DENTRO del contenedor');
            console.log('[AutoForms]   byValue: {opt_selenium.get("byValue", "N/A")}');
            console.log('[AutoForms]   byInputValue: {opt_selenium.get("byInputValue", "N/A")}');
            console.log('[AutoForms]   isBranch: {is_branch}');
        """)
        
        element = self._find_option_in_container(container, opt_selenium, answer_value, question_id)
        
        if not element:
            self.driver.execute_script(f"""
                console.error('[AutoForms] ❌ No se encontró el elemento dentro del contenedor');
            """)
            return None
        
        # ══════════════════════════════════════════════════════════════════════
        # PASO 5: Verificar que el elemento pertenece a esta pregunta
        # ══════════════════════════════════════════════════════════════════════
        self.driver.execute_script(f"console.log('[AutoForms] ✅ PASO 5: Verificando pertenencia del elemento...');")
        
        if self._verify_element_belongs_to_question(element, question_id):
            self.driver.execute_script(f"""
                console.log('[AutoForms] ✓✓✓ ELEMENTO VERIFICADO - Pertenece a la pregunta correcta');
                console.log('[AutoForms] ════════════════════════════════════════════════════════');
            """)
            return element
        else:
            self._log(0, 0, f"⚠️ {key}: Elemento encontrado pero NO pertenece a esta pregunta!", "error")
            self.driver.execute_script(f"""
                console.error('[AutoForms] ❌❌❌ ELEMENTO RECHAZADO - No pertenece a {question_id}');
                console.error('[AutoForms] Esto previene seleccionar opciones de otras preguntas');
            """)
            return None
    
    def _find_question_container_by_id(self, question_id: str) -> Optional[WebElement]:
        """
        Encontrar el contenedor de la pregunta usando su questionId.
        
        MS Forms estructura:
        <div data-automation-id="questionItem">           ← CONTENEDOR (lo que queremos)
            <span id="QuestionId_r{questionId}">...</span>  ← Título
            <div role="radiogroup">                        ← Opciones
                <span data-automation-value="...">
                    <input name="r{questionId}" value="...">
                </span>
            </div>
        </div>
        """
        try:
            # Normalizar: asegurar que tenga el prefijo "r"
            if not question_id.startswith("r"):
                q_id_full = f"r{question_id}"
            else:
                q_id_full = question_id
            
            container = self.driver.execute_script("""
                const questionId = arguments[0];
                
                console.log('[AutoForms CONTAINER] ══════════════════════════════════════');
                console.log('[AutoForms CONTAINER] Buscando contenedor para:', questionId);
                
                // ═══════════════════════════════════════════════════════════════
                // ESTRATEGIA 1: Buscar por input con name que contenga el questionId
                // ═══════════════════════════════════════════════════════════════
                console.log('[AutoForms CONTAINER] Estrategia 1: Buscando input[name*="' + questionId + '"]');
                const inputs = document.querySelectorAll(`input[name*="${questionId}"]`);
                console.log('[AutoForms CONTAINER]   Inputs encontrados:', inputs.length);
                
                if (inputs.length > 0) {
                    const input = inputs[0];
                    console.log('[AutoForms CONTAINER]   ✓ Input encontrado:');
                    console.log('[AutoForms CONTAINER]     tag:', input.tagName);
                    console.log('[AutoForms CONTAINER]     name:', input.name);
                    console.log('[AutoForms CONTAINER]     value:', input.value);
                    console.log('[AutoForms CONTAINER]     type:', input.type);
                    
                    // Subir hasta encontrar div[data-automation-id="questionItem"]
                    let parent = input.parentElement;
                    let depth = 0;
                    while (parent && depth < 15) {
                        const automationId = parent.getAttribute ? parent.getAttribute('data-automation-id') : null;
                        console.log('[AutoForms CONTAINER]     Nivel ' + depth + ': <' + parent.tagName + '> data-automation-id=' + automationId);
                        
                        if (automationId === 'questionItem') {
                            console.log('[AutoForms CONTAINER]   ✓✓ CONTENEDOR ENCONTRADO via input.name');
                            return parent;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // ESTRATEGIA 2: Buscar por id que contenga QuestionId
                // ═══════════════════════════════════════════════════════════════
                console.log('[AutoForms CONTAINER] Estrategia 2: Buscando [id*="QuestionId_' + questionId + '"]');
                const titleSpan = document.querySelector(`[id*="QuestionId_${questionId}"]`);
                
                if (titleSpan) {
                    console.log('[AutoForms CONTAINER]   ✓ Span de título encontrado:');
                    console.log('[AutoForms CONTAINER]     id:', titleSpan.id);
                    console.log('[AutoForms CONTAINER]     text:', titleSpan.textContent?.substring(0, 50) + '...');
                    
                    let parent = titleSpan.parentElement;
                    let depth = 0;
                    while (parent && depth < 15) {
                        const automationId = parent.getAttribute ? parent.getAttribute('data-automation-id') : null;
                        console.log('[AutoForms CONTAINER]     Nivel ' + depth + ': <' + parent.tagName + '> data-automation-id=' + automationId);
                        
                        if (automationId === 'questionItem') {
                            console.log('[AutoForms CONTAINER]   ✓✓ CONTENEDOR ENCONTRADO via QuestionId span');
                            return parent;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // ESTRATEGIA 3: Buscar radiogroup con input que tenga el name correcto
                // ═══════════════════════════════════════════════════════════════
                console.log('[AutoForms CONTAINER] Estrategia 3: Buscando radiogroup con input correcto');
                const radiogroups = document.querySelectorAll('[role="radiogroup"]');
                console.log('[AutoForms CONTAINER]   Radiogroups en página:', radiogroups.length);
                
                for (let i = 0; i < radiogroups.length; i++) {
                    const rg = radiogroups[i];
                    const rgInput = rg.querySelector(`input[name*="${questionId}"]`);
                    if (rgInput) {
                        console.log('[AutoForms CONTAINER]   ✓ Radiogroup [' + i + '] contiene input con name correcto');
                        
                        // Subir hasta questionItem
                        let parent = rg.parentElement;
                        let depth = 0;
                        while (parent && depth < 15) {
                            const automationId = parent.getAttribute ? parent.getAttribute('data-automation-id') : null;
                            if (automationId === 'questionItem') {
                                console.log('[AutoForms CONTAINER]   ✓✓ CONTENEDOR ENCONTRADO via radiogroup');
                                return parent;
                            }
                            parent = parent.parentElement;
                            depth++;
                        }
                    }
                }
                
                console.log('[AutoForms CONTAINER] ❌ NO SE ENCONTRÓ CONTENEDOR');
                return null;
            """, q_id_full)
            
            return container
            
        except Exception as e:
            self._log(0, 0, f"Error buscando contenedor: {e}", "error")
            import traceback
            traceback.print_exc()
            return None
    
    def _find_option_in_container(
        self, 
        container: WebElement, 
        opt_selenium: dict, 
        answer_value: str,
        question_id: str
    ) -> Optional[WebElement]:
        """
        Buscar opción SOLO DENTRO del contenedor de la pregunta.
        """
        try:
            by_value = opt_selenium.get("byValue")  # "[data-automation-value='SI']"
            by_input = opt_selenium.get("byInputValue")  # "input[value='SI']"
            
            # Escapar comillas para JavaScript
            safe_answer = answer_value.replace("'", "\\'").replace('"', '\\"')
            
            element = self.driver.execute_script("""
                const container = arguments[0];
                const byValue = arguments[1];
                const byInput = arguments[2];
                const answerValue = arguments[3];
                const questionId = arguments[4];
                
                console.log('[AutoForms OPTION] ══════════════════════════════════════');
                console.log('[AutoForms OPTION] Buscando opción DENTRO del contenedor');
                console.log('[AutoForms OPTION]   questionId:', questionId);
                console.log('[AutoForms OPTION]   byValue:', byValue);
                console.log('[AutoForms OPTION]   byInput:', byInput);
                console.log('[AutoForms OPTION]   answer:', answerValue);
                
                // Mostrar todas las opciones disponibles en el contenedor
                console.log('[AutoForms OPTION] Opciones disponibles en contenedor:');
                const allOptions = container.querySelectorAll('[data-automation-value]');
                allOptions.forEach((opt, i) => {
                    const val = opt.getAttribute('data-automation-value');
                    const isMatch = val === answerValue;
                    console.log('[AutoForms OPTION]   [' + i + '] "' + val + '"' + (isMatch ? ' ← MATCH!' : ''));
                });
                
                let element = null;
                
                // ═══════════════════════════════════════════════════════════════
                // PRIORIDAD 1: Buscar por data-automation-value exacto
                // ═══════════════════════════════════════════════════════════════
                console.log('[AutoForms OPTION] Prioridad 1: Buscando data-automation-value exacto...');
                try {
                    const selector1 = `[data-automation-value="${answerValue}"]`;
                    console.log('[AutoForms OPTION]   Selector:', selector1);
                    element = container.querySelector(selector1);
                    if (element) {
                        console.log('[AutoForms OPTION]   ✓✓ ENCONTRADO via data-automation-value');
                        console.log('[AutoForms OPTION]   Tag:', element.tagName);
                        console.log('[AutoForms OPTION]   class:', element.className);
                        console.log('[AutoForms OPTION]   HTML:', element.outerHTML.substring(0, 200));
                        return element;
                    }
                } catch(e) {
                    console.log('[AutoForms OPTION]   Error:', e.message);
                }
                
                // ═══════════════════════════════════════════════════════════════
                // PRIORIDAD 2: Buscar con selector byValue del AFPKG
                // ═══════════════════════════════════════════════════════════════
                if (byValue) {
                    console.log('[AutoForms OPTION] Prioridad 2: Usando byValue del AFPKG...');
                    try {
                        element = container.querySelector(byValue);
                        if (element) {
                            console.log('[AutoForms OPTION]   ✓✓ ENCONTRADO via byValue AFPKG');
                            console.log('[AutoForms OPTION]   Tag:', element.tagName);
                            console.log('[AutoForms OPTION]   HTML:', element.outerHTML.substring(0, 200));
                            return element;
                        }
                    } catch(e) {
                        console.log('[AutoForms OPTION]   Error:', e.message);
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // PRIORIDAD 3: Buscar input por value
                // ═══════════════════════════════════════════════════════════════
                if (byInput) {
                    console.log('[AutoForms OPTION] Prioridad 3: Usando byInputValue del AFPKG...');
                    try {
                        element = container.querySelector(byInput);
                        if (element) {
                            console.log('[AutoForms OPTION]   ✓✓ ENCONTRADO via byInputValue');
                            console.log('[AutoForms OPTION]   name:', element.name);
                            console.log('[AutoForms OPTION]   value:', element.value);
                            return element;
                        }
                    } catch(e) {
                        console.log('[AutoForms OPTION]   Error:', e.message);
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // PRIORIDAD 4: Buscar span por data-automation-id="radio"
                // ═══════════════════════════════════════════════════════════════
                console.log('[AutoForms OPTION] Prioridad 4: Buscando span[data-automation-id="radio"]...');
                const radioSpans = container.querySelectorAll('span[data-automation-id="radio"]');
                console.log('[AutoForms OPTION]   Spans radio encontrados:', radioSpans.length);
                
                for (let i = 0; i < radioSpans.length; i++) {
                    const span = radioSpans[i];
                    const val = span.getAttribute('data-automation-value');
                    console.log('[AutoForms OPTION]   [' + i + '] value="' + val + '"');
                    if (val === answerValue) {
                        console.log('[AutoForms OPTION]   ✓✓ ENCONTRADO via span radio');
                        return span;
                    }
                }
                
                console.log('[AutoForms OPTION] ❌ NO SE ENCONTRÓ LA OPCIÓN');
                return null;
                
            """, container, by_value, by_input, answer_value, question_id)
            
            return element
            
        except Exception as e:
            self._log(0, 0, f"Error buscando opción en contenedor: {e}", "error")
            import traceback
            traceback.print_exc()
            return None
    
    def _verify_element_belongs_to_question(self, element: WebElement, question_id: str) -> bool:
        """
        Verificar que el elemento encontrado pertenece a la pregunta correcta.
        
        TRIPLE VERIFICACIÓN para garantizar que no seleccionamos elementos de otras preguntas.
        """
        try:
            # Normalizar questionId
            if not question_id.startswith("r"):
                q_id_full = f"r{question_id}"
            else:
                q_id_full = question_id
            
            result = self.driver.execute_script("""
                const element = arguments[0];
                const expectedQId = arguments[1];
                
                console.log('[AutoForms VERIFY] ══════════════════════════════════════');
                console.log('[AutoForms VERIFY] Verificando pertenencia del elemento');
                console.log('[AutoForms VERIFY]   QuestionId esperado:', expectedQId);
                console.log('[AutoForms VERIFY]   Elemento:', element.tagName);
                console.log('[AutoForms VERIFY]   outerHTML:', element.outerHTML.substring(0, 150));
                
                // ═══════════════════════════════════════════════════════════════
                // VERIFICACIÓN 1: Si es input, revisar el atributo name
                // ═══════════════════════════════════════════════════════════════
                if (element.tagName === 'INPUT') {
                    const name = element.getAttribute('name') || '';
                    console.log('[AutoForms VERIFY] Check 1: element es INPUT, name=' + name);
                    if (name.includes(expectedQId)) {
                        console.log('[AutoForms VERIFY] ✓✓✓ VERIFICADO via INPUT.name');
                        return true;
                    } else {
                        console.log('[AutoForms VERIFY] ⚠️ INPUT.name NO contiene ' + expectedQId);
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // VERIFICACIÓN 2: Buscar input hijo y verificar su name
                // ═══════════════════════════════════════════════════════════════
                const childInput = element.querySelector('input[type="radio"], input[type="checkbox"]');
                if (childInput) {
                    const name = childInput.getAttribute('name') || '';
                    console.log('[AutoForms VERIFY] Check 2: Input hijo encontrado, name=' + name);
                    if (name.includes(expectedQId)) {
                        console.log('[AutoForms VERIFY] ✓✓✓ VERIFICADO via input hijo');
                        return true;
                    } else {
                        console.log('[AutoForms VERIFY] ⚠️ Input hijo name NO contiene ' + expectedQId);
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // VERIFICACIÓN 3: Buscar input hermano
                // ═══════════════════════════════════════════════════════════════
                const siblingInput = element.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]');
                if (siblingInput) {
                    const name = siblingInput.getAttribute('name') || '';
                    console.log('[AutoForms VERIFY] Check 3: Input hermano encontrado, name=' + name);
                    if (name.includes(expectedQId)) {
                        console.log('[AutoForms VERIFY] ✓✓✓ VERIFICADO via input hermano');
                        return true;
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════
                // VERIFICACIÓN 4: Buscar hacia arriba un elemento con QuestionId
                // ═══════════════════════════════════════════════════════════════
                console.log('[AutoForms VERIFY] Check 4: Subiendo en DOM buscando QuestionId...');
                let parent = element.parentElement;
                for (let i = 0; i < 15 && parent; i++) {
                    // Buscar input con name correcto
                    const inputInParent = parent.querySelector(`input[name*="${expectedQId}"]`);
                    if (inputInParent) {
                        console.log('[AutoForms VERIFY] ✓✓✓ VERIFICADO via input en ancestro nivel ' + i);
                        return true;
                    }
                    
                    // Buscar span con QuestionId
                    const qIdSpan = parent.querySelector(`[id*="QuestionId_${expectedQId}"]`);
                    if (qIdSpan) {
                        console.log('[AutoForms VERIFY] ✓✓✓ VERIFICADO via QuestionId span en ancestro nivel ' + i);
                        return true;
                    }
                    
                    parent = parent.parentElement;
                }
                
                console.log('[AutoForms VERIFY] ❌❌❌ VERIFICACIÓN FALLIDA - Elemento NO pertenece a ' + expectedQId);
                return false;
                
            """, element, q_id_full)
            
            return result
            
        except Exception as e:
            self._log(0, 0, f"Error verificando pertenencia: {e}", "error")
            return False
    
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
        """Ejecutar acción de rellenar texto con logging detallado y validación infalible."""
        key = question.get("key", "unknown")
        idx = self._get_question_index(key)
        total = len(self.questions_ordered)
        
        print(f"\n{'='*60}")
        self._log(1, 9, f"INICIANDO FILL {idx}/{total}: {key}", "action")
        
        try:
            # Paso 2: Buscar elemento
            self._log(2, 9, "Buscando input...", "info")
            element = self._find_text_input(question)
            if not element:
                self._log(2, 9, "Input NO encontrado", "error")
                return ActionResult(
                    success=False,
                    question_key=key,
                    action_type=ActionType.FILL,
                    error_message="Input element not found"
                )
            self._log(2, 9, "Input encontrado", "success")
            
            # Paso 3: Buscar contenedor padre para glow
            self._log(3, 9, "Buscando contenedor padre (questionItem)...", "info")
            selenium_info = question.get("selenium", {})
            question_id = selenium_info.get("questionId")
            container = self._find_question_container_by_id(question_id) if question_id else None
            
            if container:
                self._log(3, 9, "Contenedor encontrado", "success")
            else:
                self._log(3, 9, "Contenedor no encontrado (usando input como fallback)", "warning")
            
            # Paso 4: Scroll para centrar el CONTENEDOR (no el input)
            self._log(4, 9, "Scroll para centrar contenedor...", "info")
            if self.config.scroll_to_element:
                target_scroll = container if container else element
                self._scroll_to_element(target_scroll)
            
            # Paso 5: Highlight en CONTENEDOR
            self._log(5, 9, "Aplicando glow al contenedor", "info")
            if container:
                self._highlight_element(container)
            else:
                self._highlight_element(element)  # Fallback al input
            
            # Paso 6: Click en INPUT para dar focus + limpiar
            self._log(6, 9, "Click en input y limpiando campo...", "info")
            # Usar safe_click para evitar intercepción por el widget
            self.interaction.safe_click(element)
            time.sleep(0.05)
            self.interaction.clear_input(element)
            time.sleep(0.1)
            
            # Paso 7: Escribir usando el método configurado
            if not self._check_pause_state():
                return ActionResult(success=False, question_key=key, action_type=ActionType.FILL, error_message="Execution paused/stopped")
            
            text_length = len(answer)
            is_long_text = (self.config.auto_detect_long_text and 
                           text_length >= self.config.long_text_threshold)
            is_very_long_text = text_length >= self.config.very_long_text_threshold
            
            # Log detallado en navegador
            self._browser_log(f"PASO 7: Texto de {text_length} chars", "info")
            
            # Determinar método según tier
            if is_very_long_text:
                # Tier 3: Textos MUY largos
                method = self.config.very_long_text_method
                self._browser_log(f"Texto MUY largo ({text_length} chars >= {self.config.very_long_text_threshold}), método: {method}", "info")
                self._execute_write_method(element, answer, method)
            elif is_long_text:
                # Tier 2: Textos largos
                method = self.config.long_text_method
                self._browser_log(f"Texto largo ({text_length} chars >= {self.config.long_text_threshold}), método: {method}", "info")
                self._execute_write_method(element, answer, method)
            else:
                # Tier 1: Textos cortos
                method = self.config.short_text_method
                self._browser_log(f"Texto corto ({text_length} chars), método: {method}", "info")
                self._execute_write_method(element, answer, method)
            
            time.sleep(0.2)
            
            # Paso 8: Validación INFALIBLE
            self._log(8, 9, "Validando respuesta (JS value)...", "info")
            if self.config.validate_after_fill:
                if not self._validate_fill_value(element, answer):
                    # Reintento
                    self._log(8, 9, "Reintentando escritura...", "warning")
                    element.clear()
                    time.sleep(0.1)
                    element.send_keys(answer)
                    time.sleep(0.2)
                    
                    if not self._validate_fill_value(element, answer):
                        self._log(8, 9, "VALIDACIÓN FALLÓ después de reintento", "error")
                        if container:
                            self._remove_highlight(container)
                        else:
                            self._remove_highlight(element)
                        return ActionResult(
                            success=False,
                            question_key=key,
                            action_type=ActionType.FILL,
                            error_message="Validation failed: value not set correctly"
                        )
            
            # Paso 9: Éxito - cambiar glow a verde y quitar
            self._log(9, 9, "✅ PREGUNTA RESPONDIDA OK", "success")
            if container:
                self._highlight_element(container, "#10b981")  # Verde
                time.sleep(0.3)
                self._remove_highlight(container)
            else:
                self._highlight_element(element, "#10b981")
                time.sleep(0.3)
                self._remove_highlight(element)
            
            # Delay antes de siguiente pregunta
            delay_min, delay_max = self._get_question_delay(question)
            delay_ms = random.randint(delay_min, delay_max)
            self._log(0, 0, f"Esperando {delay_ms}ms antes de siguiente pregunta...", "wait")
            time.sleep(delay_ms / 1000.0)
            
            return ActionResult(
                success=True,
                question_key=key,
                action_type=ActionType.FILL,
                value_filled=answer
            )
            
        except Exception as e:
            self._log(0, 0, f"ERROR: {e}", "error")
            self._remove_all_highlights()
            return ActionResult(
                success=False,
                question_key=key,
                action_type=ActionType.FILL,
                error_message=str(e)
            )
    
    def _execute_select(self, question: dict, answer: str) -> ActionResult:
        """Ejecutar acción de seleccionar opción con DEBUG COMPLETO en navegador."""
        key = question.get("key", "unknown")
        idx = self._get_question_index(key)
        total = len(self.questions_ordered)
        is_branch = question.get("isBranch", False)
        
        print(f"\n{'='*60}", flush=True)
        branch_tag = " [BRANCH]" if is_branch else ""
        self._browser_log(f"═══ INICIANDO SELECT{branch_tag} {idx}/{total}: {key} ═══", "action")
        self._browser_log(f"Respuesta esperada: {answer}", "info")
        
        # Helper local para compatibilidad
        def browser_log(msg, level="info"):
            self._browser_log(msg, level)
        
        try:
            # CHECK PAUSA ANTES DE BUSCAR
            if not self._check_pause_state():
                return ActionResult(success=False, question_key=key, action_type=ActionType.SELECT, error_message="Execution paused/stopped")
            
            # ═══ PASO 1: Buscar elemento opción ═══
            browser_log(f"PASO 1: Buscando elemento para opción: '{answer[:40] if len(answer) > 40 else answer}'...", "info")
            
            element = self._find_option_element(question, answer)
            if not element:
                browser_log("PASO 1: ✗ Opción NO encontrada en DOM", "error")
                return ActionResult(
                    success=False,
                    question_key=key,
                    action_type=ActionType.SELECT,
                    error_message=f"Option element not found for value: {answer}"
                )
            browser_log("PASO 1: ✓ Opción encontrada", "success")
            
            # Log del elemento encontrado en navegador
            self.driver.execute_script("""
                console.log('[AutoForms] PASO 1: Elemento encontrado:', arguments[0]);
                console.log('[AutoForms] PASO 1: Tag:', arguments[0].tagName);
                console.log('[AutoForms] PASO 1: id:', arguments[0].id);
                console.log('[AutoForms] PASO 1: class:', arguments[0].className);
            """, element)
            
            # ═══ PASO 2: Buscar contenedor padre (questionItem) ═══
            browser_log("PASO 2: Buscando contenedor padre (questionItem)...", "info")
            
            # Usar el método que funciona (el mismo que usa _find_option_element)
            selenium_info = question.get("selenium", {})
            question_id = selenium_info.get("questionId")
            container = self._find_question_container_by_id(question_id) if question_id else None
            if container:
                browser_log("PASO 2: ✓ Contenedor encontrado", "success")
                self.driver.execute_script("""
                    console.log('[AutoForms] PASO 2: Contenedor:', arguments[0]);
                    console.log('[AutoForms] PASO 2: data-automation-id:', arguments[0].getAttribute('data-automation-id'));
                """, container)
            else:
                browser_log("PASO 2: ⚠ No se encontró contenedor, continuando sin él", "warning")
            
            # ═══ PASO 3: Scroll al contenedor (NO click - evita seleccionar opción accidentalmente) ═══
            browser_log("PASO 3: Scroll al contenedor...", "info")
            if container and self.config.scroll_to_element:
                try:
                    self._scroll_to_element(container)
                    browser_log("PASO 3: ✓ Scroll completado", "success")
                except Exception as e:
                    browser_log(f"PASO 3: ⚠ Error en scroll: {e}", "warning")
            
            # ═══ PASO 4: Aplicar glow al contenedor ═══
            browser_log("PASO 4: Aplicando glow al contenedor...", "info")
            if container:
                try:
                    self._highlight_element(container)
                    browser_log("PASO 4: ✓ Glow aplicado al contenedor", "success")
                except Exception as e:
                    browser_log(f"PASO 4: ⚠ Error aplicando glow: {e}", "warning")
            
            # CHECK PAUSA ANTES DE INTERACTUAR
            if not self._check_pause_state():
                if container:
                    self._remove_highlight(container)
                return ActionResult(success=False, question_key=key, action_type=ActionType.SELECT, error_message="Execution paused/stopped")
            
            # ═══ PASO 5: Mouse move a la opción (si human actions) ═══
            if self.config.human_actions_enabled and self.config.move_mouse_to_element:
                browser_log("PASO 5: Moviendo mouse a opción...", "info")
                self._move_mouse_to_element(element)
                browser_log("PASO 5: ✓ Mouse movido", "success")
            else:
                browser_log("PASO 5: Omitido (human_actions deshabilitado)", "info")
            
            # ═══ PASO 6: CLICK EN OPCIÓN (SAFE) ═══
            browser_log("PASO 6: ★★★ HACIENDO CLICK EN OPCIÓN (safe_click) ★★★", "action")
            self.driver.execute_script("""
                console.log('[AutoForms] PASO 6: === CLICK EN OPCIÓN ===');
                console.log('[AutoForms] PASO 6: Elemento a clickear:', arguments[0]);
            """, element)
            
            # Usar safe_click para evitar intercepción por el widget
            if not self.interaction.safe_click(element):
                browser_log("PASO 6: ⚠ safe_click falló, intentando JS click directo...", "warning")
                self.interaction.js_click(element)
            
            browser_log("PASO 6: Click ejecutado, esperando 500ms para DOM update...", "info")
            time.sleep(0.5)
            browser_log("PASO 6: ✓ Click completado", "success")
            
            # ═══ PASO 7: VALIDACIÓN ═══
            browser_log("PASO 7: ★★★ VALIDANDO SELECCIÓN ★★★", "action")
            
            if self.config.validate_after_select:
                validation_result = self._validate_select_value(element, answer)
                
                if not validation_result:
                    browser_log("PASO 7: ⚠ Primera validación falló, reintentando click...", "warning")
                    self.interaction.safe_click(element)
                    time.sleep(0.6)
                    
                    validation_result = self._validate_select_value(element, answer)
                    if not validation_result:
                        browser_log("PASO 7: ✗ VALIDACIÓN FALLÓ después de reintento", "error")
                        if container:
                            self._remove_highlight(container)
                        return ActionResult(
                            success=False,
                            question_key=key,
                            action_type=ActionType.SELECT,
                            error_message="Select validation failed: option not selected"
                        )
                
                browser_log("PASO 7: ✓ VALIDACIÓN OK", "success")
            else:
                browser_log("PASO 7: Validación deshabilitada, asumiendo OK", "info")
            
            # ═══ PASO 8: Éxito - cambiar glow a verde y luego quitar ═══
            browser_log("PASO 8: ✅ PREGUNTA RESPONDIDA OK", "success")
            if container:
                self._highlight_element(container, "#10b981")  # Verde
                time.sleep(0.3)
                self._remove_highlight(container)
            
            # Delay antes de siguiente pregunta
            delay_min, delay_max = self._get_question_delay(question)
            delay_ms = random.randint(delay_min, delay_max)
            
            if is_branch:
                delay_ms = max(delay_ms, self.config.branch_delay_ms)
                browser_log(f"BRANCH: Esperando {delay_ms}ms para carga de nuevas preguntas...", "wait")
            else:
                browser_log(f"Esperando {delay_ms}ms antes de siguiente pregunta...", "info")
            
            time.sleep(delay_ms / 1000.0)
            
            return ActionResult(
                success=True,
                question_key=key,
                action_type=ActionType.SELECT,
                value_filled=answer
            )
            
        except Exception as e:
            browser_log(f"ERROR CRÍTICO: {e}", "error")
            import traceback
            traceback.print_exc()
            self.driver.execute_script(f"console.error('[AutoForms] ERROR:', '{str(e)}');")
            self._remove_all_highlights()
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
    # PAGE NAVIGATION (CLICK_BUTTON actions)
    # ═══════════════════════════════════════════════════════════════════════
    
    def _execute_click_button(self, button_type: str, page: dict) -> ActionResult:
        """
        Ejecutar click en botón de navegación con patrón estándar.
        
        Sigue el mismo patrón robusto que FILL y SELECT:
        1. Buscar botón (con fallback)
        2. Scroll al botón
        3. Highlight naranja al botón
        4. Mouse move (si human_actions)
        5. Preparar validación (event listener)
        6. safe_click()
        7. Validar click ejecutado
        8. Highlight verde → remover
        9. Delay configurado
        
        Args:
            button_type: Tipo de botón ('next', 'submit', 'back')
            page: Diccionario con datos de la página actual
            
        Returns:
            ActionResult con el resultado de la operación
        """
        LABELS = {
            'next': 'Siguiente',
            'submit': 'Enviar',
            'back': 'Atrás'
        }
        label = LABELS.get(button_type, button_type)
        
        print(f"\n{'='*60}")
        self._browser_log(f"═══ CLICK_BUTTON: {label.upper()} ═══", "action")
        
        try:
            # === Notificar inicio de acción (PARA WIDGET UI) ===
            action_info = {
                "num": "NAV",
                "type": "click",
                "question": "Navegación",
                "answer": f"Click en {label.upper()}",
                "key": f"nav_{button_type}"
            }
            self._emit_action_start(action_info)

            # ═══ PASO 1: Buscar botón ═══
            self._browser_log(f"PASO 1: Buscando botón '{label}'...", "info")
            
            button = self.finder.find_navigation_button(page, button_type)
            if not button:
                self._browser_log(f"PASO 1: ✗ Botón '{label}' NO encontrado", "error")
                return ActionResult(
                    success=False,
                    question_key=f"nav_{button_type}",
                    action_type=ActionType.CLICK,
                    error_message=f"Botón {label} no encontrado"
                )
            self._browser_log(f"PASO 1: ✓ Botón '{label}' encontrado", "success")
            
            # ═══ PASO 2: Scroll al botón ═══
            self._browser_log("PASO 2: Scroll al botón...", "info")
            if self.config.scroll_to_element:
                self._scroll_to_element(button)
                self._browser_log("PASO 2: ✓ Scroll completado", "success")
            
            # ═══ PASO 3: Highlight naranja al botón ═══
            self._browser_log("PASO 3: Aplicando glow naranja...", "info")
            self.visual.apply_glow(button, action_type='click')
            
            # ═══ PASO 4: Mouse move (si human_actions) ═══
            if self.config.human_actions_enabled and self.config.move_mouse_to_element:
                self._browser_log("PASO 4: Moviendo mouse al botón...", "info")
                self.interaction.move_mouse_to(button)
            
            # ═══ PASO 5: Preparar validación (inyectar listener) ═══
            self._browser_log("PASO 5: Inyectando listener de validación...", "info")
            self.validator.prepare_click_validation(button)
            
            # CHECK PAUSA antes de click
            if not self._check_pause_state():
                self.visual.remove_glow(button)
                return ActionResult(
                    success=False,
                    question_key=f"nav_{button_type}",
                    action_type=ActionType.CLICK,
                    error_message="Ejecución pausada/detenida"
                )
            
            # ═══ PASO 6: Safe click ═══
            self._browser_log(f"PASO 6: ★★★ CLICK en '{label}' (safe_click) ★★★", "action")
            
            # IMPORTANTE: Remover glow ANTES del click para evitar que quede pegado
            # si la página navega inmediatamente
            self.visual.remove_glow(button)
            
            click_ok = self.interaction.safe_click(button)
            
            if not click_ok:
                self._browser_log("PASO 6: ⚠ safe_click falló, intentando JS click...", "warning")
                self.interaction.js_click(button)
            
            # Pequeña espera para que el evento se procese
            time.sleep(0.15)
            self._browser_log("PASO 6: ✓ Click ejecutado", "success")
            
            # ═══ PASO 7: Validar click ejecutado ═══
            self._browser_log("PASO 7: ★★★ VALIDANDO CLICK ★★★", "action")
            click_validated = self.validator.validate_click_executed(button, button_type)
            
            if not click_validated:
                # Intentar validación con fallback
                self._browser_log("PASO 7: ⚠ Listener no confirmó, probando fallbacks...", "warning")
                click_validated = self.validator.validate_click_with_fallback(button, button_type)
            
            if click_validated:
                self._browser_log("PASO 7: ✓ Click VALIDADO", "success")
            else:
                # Aun sin confirmación, continuamos (el click pudo haberse ejecutado)
                self._browser_log("PASO 7: ⚠ Click no confirmado, continuando...", "warning")
            
            # ═══ PASO 8: Glow verde de éxito (protegido de stale elements) ═══
            self._browser_log("PASO 8: ✅ BOTÓN CLICKEADO OK", "success")
            try:
                self.visual.apply_glow(button, color='#22c55e')  # Verde
                time.sleep(0.25)
                self.visual.remove_glow(button)
            except Exception:
                # Elemento stale (página ya navegó), limpiar cualquier glow restante
                self.visual.remove_all_glows()
            
            # ═══ PASO 9: Delay post-navegación ═══
            delay_ms = self.config.page_change_delay_ms
            self._browser_log(f"PASO 9: Esperando {delay_ms}ms para carga de página...", "wait")
            time.sleep(delay_ms / 1000.0)
            
            self._browser_log(f"✅ {label.upper()} completado", "success")
            
            result = ActionResult(
                success=True,
                question_key=f"nav_{button_type}",
                action_type=ActionType.CLICK,
                value_filled=button_type
            )
            # Notificar acción completada
            self._emit_action_complete(result)
            return result
            
        except Exception as e:
            self._browser_log(f"ERROR CRÍTICO en click_button: {e}", "error")
            import traceback
            traceback.print_exc()
            result = ActionResult(
                success=False,
                question_key=f"nav_{button_type}",
                action_type=ActionType.CLICK,
                error_message=str(e)
            )
            self._emit_action_complete(result)
            return result
    
    def _navigate_to_next_page(self, current_page: dict) -> bool:
        """Navegar a la siguiente página usando el patrón estándar de click."""
        result = self._execute_click_button("next", current_page)
        return result.success
    
    def _submit_form(self, current_page: dict) -> bool:
        """Enviar el formulario usando el patrón estándar de click."""
        result = self._execute_click_button("submit", current_page)
        return result.success
    
    def _navigate_back(self, current_page: dict) -> bool:
        """Navegar a la página anterior usando el patrón estándar de click."""
        result = self._execute_click_button("back", current_page)
        return result.success

    
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
                    
                    # DETENERSE en error (configurable)
                    if self.config.stop_on_error:
                        print(f"[FormExecutor] Detenido por error en {key}")
                        self.is_paused = True  # Pausar, no detener completamente
                        return False
                
                # Delay antes de siguiente pregunta
                delay_min, delay_max = self._get_question_delay(question)
                self._random_delay(delay_min, delay_max)
            
            # Navegación al final de la página
            navigation = page.get("navigation", {})
            
            print(f"[FormExecutor] DEBUG: Página {page.get('pageNumber', '?')}, navigation: submit={bool(navigation.get('submit'))}, next={bool(navigation.get('next'))}")
            
            if navigation.get("submit"):
                # Última página - enviar
                print(f"[FormExecutor] DEBUG: Ejecutando SUBMIT...")
                submit_success = self._submit_form(page)
                print(f"[FormExecutor] DEBUG: Submit result = {submit_success}")
                
                if not submit_success:
                    self._emit_status("warning", "Submit button not found")
                else:
                    # ═══════════════════════════════════════════════════════
                    # POSTSUBMIT: Capturar URL después del envío exitoso
                    # ═══════════════════════════════════════════════════════
                    print(f"[FormExecutor] DEBUG: Submit exitoso. PostSubmit enabled={self.postsubmit_enabled}, executor={self.postsubmit_executor is not None}")
                    
                    if self.postsubmit_enabled and self.postsubmit_executor:
                        print(f"[FormExecutor] DEBUG: Iniciando PostSubmit...")
                        self._emit_status("running", f"Fila {row_index + 1}: Capturando URL...")
                        
                        try:
                            # Ejecutar PostSubmit
                            ps_result = self.postsubmit_executor.execute_after_submit(
                                form_url=self.form_url
                            )
                            
                            if ps_result.success and self.result_storage:
                                # Guardar resultado exitoso
                                self.result_storage.record_post_submit_success(
                                    row_index=row_index,
                                    url=ps_result.url,
                                    strategy=ps_result.strategy,
                                    confidence=ps_result.confidence,
                                    capture_time_ms=int(ps_result.capture_time_ms)
                                )
                                self._emit_status("success", 
                                    f"Fila {row_index + 1}: URL capturada ({ps_result.strategy})"
                                )
                                print(f"[FormExecutor] PostSubmit URL: {ps_result.url}")
                            else:
                                # Guardar fallo
                                if self.result_storage:
                                    self.result_storage.record_post_submit_failure(
                                        row_index=row_index,
                                        error=ps_result.error or "capture_failed",
                                        capture_time_ms=int(ps_result.capture_time_ms)
                                    )
                                self._emit_status("warning", 
                                    f"Fila {row_index + 1}: No se pudo capturar URL"
                                )
                        except Exception as e:
                            print(f"[FormExecutor] PostSubmit error: {e}")
                            if self.result_storage:
                                self.result_storage.record_post_submit_failure(
                                    row_index=row_index,
                                    error=str(e)
                                )
                        
                        # ═══════════════════════════════════════════════════════
                        # Re-inyectar UI después del PostSubmit (página recargada)
                        # ═══════════════════════════════════════════════════════
                        if self.on_ui_reinject:
                            print("[FormExecutor] Re-inyectando UI después del PostSubmit...")
                            try:
                                self.on_ui_reinject()
                                print("[FormExecutor] ✓ UI re-inyectada")
                            except Exception as e:
                                print(f"[FormExecutor] ⚠️ Error re-inyectando UI: {e}")
                            
            elif navigation.get("next"):
                # Página intermedia - siguiente
                if not self._navigate_to_next_page(page):
                    self._emit_status("warning", "Next button not found")
        
        # Marcar fila como completada en storage
        if self.result_storage:
            self.result_storage.complete_row(row_index, success=True)
            
            # =================================================================
            # LOG: Imprimir resumen del storage después de cada fila (CRÍTICO)
            # =================================================================
            summary = self.result_storage.get_summary()
            print(f"\n{'='*60}")
            print(f"[FormExecutor] ═══ RESULT STORAGE SUMMARY ═══")
            print(f"[FormExecutor] Session ID: {summary.get('sessionId', 'N/A')}")
            print(f"[FormExecutor] Rows: {summary.get('successCount', 0)}/{summary.get('totalRows', 0)} completed")
            print(f"[FormExecutor] URLs Captured: {summary.get('urlsCaptured', 0)}")
            print(f"[FormExecutor] File Path: {summary.get('filePath', 'N/A')}")
            
            # Log the row-specific data
            if row_index < len(self.result_storage.rows):
                row_data = self.result_storage.rows[row_index]
                ps_data = row_data.post_submit.to_dict()
                print(f"[FormExecutor] Row {row_index + 1} PostSubmit: {ps_data}")
            
            print(f"{'='*60}\n")
        
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
        
        # Inicializar sesión en result_storage si PostSubmit está habilitado
        if self.result_storage:
            # Extraer info del navegador de los datos del paquete o usar defaults
            total_questions = len(self.questions_ordered) if hasattr(self, 'questions_ordered') else 0
            self.result_storage.initialize_session(
                form_url=self.form_url,
                browser="chromium",  # Default, podría venir de config
                profile_name="Default",  # Default, podría venir de config
                total_rows=len(self.resolved_rows),
                total_questions=total_questions,
                login_enabled=True
            )
        
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
