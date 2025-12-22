"""
Browser State Management Module

Provides a state machine for tracking browser lifecycle phases
and emitting progress updates to the UI.
"""
from enum import Enum
from typing import Callable, Optional
import threading
import time


class BrowserState(Enum):
    """All possible states of the browser during recording session."""
    IDLE = "idle"
    
    # Launch phases (granular)
    STARTING_PROCESS = "starting_process"  # Selenium command sent
    PROCESS_DETECTED = "process_detected"  # OS process detected by psutil
    BROWSER_OPENED = "browser_opened"      # Window visible/rendered
    
    # Connection phases
    NAVIGATING = "navigating"
    PAGE_LOADED = "page_loaded"
    INJECTING = "injecting"
    CONNECTED = "connected"  # Script injected and responding
    
    # Active phases
    READY = "ready"
    RECORDING = "recording"
    STOPPING = "stopping"
    
    # Terminal
    CLOSED = "closed"
    ERROR = "error"


# Human-readable messages for each state
STATE_MESSAGES = {
    BrowserState.IDLE: "Esperando...",
    BrowserState.STARTING_PROCESS: "Iniciando proceso de navegador...",
    BrowserState.PROCESS_DETECTED: "Abriendo navegador...",
    BrowserState.BROWSER_OPENED: "Navegador abierto",
    BrowserState.NAVIGATING: "Cargando URL...",
    BrowserState.PAGE_LOADED: "Página cargada",
    BrowserState.INJECTING: "Inyectando script...",
    BrowserState.CONNECTED: "Conectado",
    BrowserState.READY: "¡Listo para grabar!",
    BrowserState.RECORDING: "Grabando...",
    BrowserState.STOPPING: "Deteniendo grabación...",
    BrowserState.CLOSED: "Navegador cerrado",
    BrowserState.ERROR: "Error"
}


class BrowserStateManager:
    """
    Manages browser state transitions and emits callbacks.
    
    Provides:
    - State tracking with transitions
    - Elapsed time monitoring for slow launch detection
    - Warning emissions for slow operations
    """
    
    # Thresholds for warnings (in seconds)
    THRESHOLD_SLOW = 30        # "Esto está tardando..."
    THRESHOLD_VERY_SLOW = 90   # "Tardando mucho más de lo normal..."
    THRESHOLD_EXTREME = 180    # "El navegador parece estar muy lento..."
    
    def __init__(
        self,
        on_state_change: Callable[[str, str], None] = None,
        on_warning: Callable[[str, str], None] = None
    ):
        """
        Initialize the state manager.
        
        Args:
            on_state_change: Callback(state_value, message) when state changes
            on_warning: Callback(warning_type, message) for slow operations
        """
        self._state = BrowserState.IDLE
        self._state_lock = threading.Lock()
        self.on_state_change = on_state_change
        self.on_warning = on_warning
        
        # Timing
        self._phase_start_time: float = 0
        self._last_warning_level: str = ""
        
        # Error tracking
        self.last_error: Optional[str] = None
    
    @property
    def state(self) -> BrowserState:
        """Get current state (thread-safe)."""
        with self._state_lock:
            return self._state
    
    @property
    def state_value(self) -> str:
        """Get current state as string."""
        return self.state.value
    
    def set_state(self, new_state: BrowserState, message: str = None):
        """
        Transition to a new state.
        
        Args:
            new_state: The new BrowserState
            message: Optional custom message (uses default if not provided)
        """
        with self._state_lock:
            old_state = self._state
            self._state = new_state
        
        # Reset timing on state change
        self._phase_start_time = time.time()
        self._last_warning_level = ""
        
        # Get message
        if message is None:
            message = STATE_MESSAGES.get(new_state, str(new_state.value))
        
        print(f"[BrowserState] {old_state.value} → {new_state.value}: {message}")
        
        # Emit callback
        if self.on_state_change:
            try:
                self.on_state_change(new_state.value, message)
            except Exception as e:
                print(f"[BrowserState] Callback error: {e}")
    
    def set_error(self, error_message: str):
        """Set error state with message."""
        self.last_error = error_message
        self.set_state(BrowserState.ERROR, f"Error: {error_message}")
    
    def get_elapsed(self) -> float:
        """Get seconds elapsed since last state change."""
        if self._phase_start_time == 0:
            return 0
        return time.time() - self._phase_start_time
    
    def check_and_emit_warnings(self):
        """
        Check elapsed time and emit warnings if operation is slow.
        Should be called periodically from a monitoring thread.
        """
        elapsed = self.get_elapsed()
        
        # Determine warning level
        if elapsed > self.THRESHOLD_EXTREME and self._last_warning_level != "extreme":
            self._last_warning_level = "extreme"
            self._emit_warning("extreme", f"El navegador parece estar muy lento ({int(elapsed)}s). Puedes seguir esperando o cancelar.")
        elif elapsed > self.THRESHOLD_VERY_SLOW and self._last_warning_level not in ("extreme", "very_slow"):
            self._last_warning_level = "very_slow"
            self._emit_warning("very_slow", f"Tardando mucho más de lo normal ({int(elapsed)}s)...")
        elif elapsed > self.THRESHOLD_SLOW and self._last_warning_level not in ("extreme", "very_slow", "slow"):
            self._last_warning_level = "slow"
            self._emit_warning("slow", f"Esto está tardando más de lo esperado ({int(elapsed)}s)...")
    
    def emit_warning(self, warning_type: str, message: str):
        """Public method to emit a warning."""
        self._emit_warning(warning_type, message)
    
    def _emit_warning(self, warning_type: str, message: str):
        """Emit a warning callback."""
        print(f"[BrowserState] WARNING ({warning_type}): {message}")
        if self.on_warning:
            try:
                self.on_warning(warning_type, message)
            except Exception as e:
                print(f"[BrowserState] Warning callback error: {e}")
    
    def is_terminal_state(self) -> bool:
        """Check if current state is a terminal state."""
        return self.state in (BrowserState.CLOSED, BrowserState.ERROR)
    
    def is_active(self) -> bool:
        """Check if browser is in an active (non-terminal) state."""
        return self.state not in (BrowserState.IDLE, BrowserState.CLOSED, BrowserState.ERROR)


class LaunchMonitor:
    """
    Monitors browser launch process and emits warnings for slow operations.
    
    Runs in a separate thread and periodically checks elapsed time.
    """
    
    def __init__(self, state_manager: BrowserStateManager, check_interval: float = 5.0):
        """
        Initialize launch monitor.
        
        Args:
            state_manager: BrowserStateManager instance to monitor
            check_interval: How often to check (seconds)
        """
        self.state_manager = state_manager
        self.check_interval = check_interval
        self._should_run = False
        self._thread: Optional[threading.Thread] = None
    
    def start(self):
        """Start the monitoring thread."""
        if self._thread and self._thread.is_alive():
            return  # Already running
        
        self._should_run = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        print("[LaunchMonitor] Started")
    
    def stop(self):
        """Stop the monitoring thread."""
        self._should_run = False
        print("[LaunchMonitor] Stopped")
    
    def _monitor_loop(self):
        """Main monitoring loop."""
        while self._should_run:
            # Only emit warnings during launch/navigation phases
            current_state = self.state_manager.state
            if current_state in (
                BrowserState.STARTING_PROCESS,
                BrowserState.PROCESS_DETECTED,
                BrowserState.NAVIGATING,
                BrowserState.INJECTING
            ):
                self.state_manager.check_and_emit_warnings()
            
            # Stop monitoring if we reached a stable or terminal state
            if current_state in (
                BrowserState.CONNECTED,
                BrowserState.READY,
                BrowserState.RECORDING,
                BrowserState.CLOSED,
                BrowserState.ERROR
            ):
                print(f"[LaunchMonitor] Reached state {current_state.value}, stopping monitor")
                break
            
            time.sleep(self.check_interval)
