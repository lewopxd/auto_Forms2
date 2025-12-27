# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
Timing - Control de Tiempos y Pausas
═══════════════════════════════════════════════════════════════════════════════

Responsabilidad única: Gestionar delays, pausas y verificar estado de ejecución.
"""

import time
import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..form_executor import FormExecutor


class Timing:
    """
    Control de tiempos y pausas para la automatización.
    
    Proporciona métodos para delays fijos y aleatorios,
    así como verificación del estado de pausa/stop.
    """
    
    def delay(self, ms: int) -> None:
        """
        Esperar un tiempo fijo.
        
        Args:
            ms: Milisegundos a esperar
        """
        if ms > 0:
            time.sleep(ms / 1000.0)
    
    def random_delay(self, min_ms: int, max_ms: int) -> int:
        """
        Esperar un tiempo aleatorio dentro del rango.
        
        Args:
            min_ms: Mínimo en milisegundos
            max_ms: Máximo en milisegundos
            
        Returns:
            El tiempo que se esperó en ms
        """
        if min_ms >= max_ms:
            actual_ms = min_ms
        else:
            actual_ms = random.randint(min_ms, max_ms)
        
        if actual_ms > 0:
            time.sleep(actual_ms / 1000.0)
        
        return actual_ms
    
    def check_pause_state(self, executor: 'FormExecutor') -> bool:
        """
        Verificar si la ejecución debe continuar.
        
        Si está pausado, espera hasta que se reanude.
        Si debe detenerse, retorna False.
        
        Args:
            executor: Instancia del FormExecutor
            
        Returns:
            True si debe continuar, False si debe abortar
        """
        # Verificar stop
        if executor.should_stop:
            return False
        
        # Verificar pausa
        if executor.is_paused:
            while executor.is_paused:
                if executor.should_stop:
                    return False
                time.sleep(0.3)
        
        return True
    
    def wait_for_condition(
        self, 
        condition_fn, 
        timeout_ms: int = 5000, 
        poll_ms: int = 100
    ) -> bool:
        """
        Esperar hasta que una condición sea verdadera.
        
        Args:
            condition_fn: Función que retorna True cuando la condición se cumple
            timeout_ms: Tiempo máximo de espera en ms
            poll_ms: Intervalo de polling en ms
            
        Returns:
            True si la condición se cumplió, False si timeout
        """
        start = time.time()
        timeout_sec = timeout_ms / 1000.0
        poll_sec = poll_ms / 1000.0
        
        while (time.time() - start) < timeout_sec:
            try:
                if condition_fn():
                    return True
            except Exception:
                pass
            time.sleep(poll_sec)
        
        return False
