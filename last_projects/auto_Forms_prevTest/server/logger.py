"""
Custom Logger - Routes logs to console and/or UI via WebSocket
"""
import logging
import asyncio
from datetime import datetime
from typing import Optional, Set, List
from dataclasses import dataclass

from .protocol.message import Message, MessageType


@dataclass
class LogEntry:
    """A log entry to be sent to UI."""
    level: str
    module: str
    message: str
    timestamp: str
    details: Optional[dict] = None


class HybridLogger:
    """
    Logger that sends to both console and UI via WebSocket.
    
    Features:
    - Configurable log levels for console vs UI
    - Queue logs for UI until subscriber connects
    - Thread-safe logging
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self._ui_subscribers: Set = set()
        self._log_queue: List[LogEntry] = []
        self._max_queue = 100
        self._console_level = logging.INFO
        self._ui_level = logging.INFO
        self._queue_for_ui = True
        
        # Configure Python logging
        logging.basicConfig(
            level=self._console_level,
            format="%(asctime)s │ %(levelname)-8s │ %(name)-12s │ %(message)s",
            datefmt="%H:%M:%S"
        )
    
    def configure(
        self,
        console_level: str = "INFO",
        ui_level: str = "INFO",
        queue_for_ui: bool = True,
        max_queue: int = 100
    ):
        """
        Configure logger settings.
        
        Args:
            console_level: Minimum level for console output
            ui_level: Minimum level for UI output
            queue_for_ui: Whether to queue logs before UI connects
            max_queue: Maximum queued log entries
        """
        self._console_level = getattr(logging, console_level.upper(), logging.INFO)
        self._ui_level = getattr(logging, ui_level.upper(), logging.INFO)
        self._queue_for_ui = queue_for_ui
        self._max_queue = max_queue
        
        # Update root logger
        logging.getLogger().setLevel(min(self._console_level, self._ui_level))
    
    def _should_log_console(self, level: str) -> bool:
        """Check if should log to console."""
        return getattr(logging, level.upper(), 0) >= self._console_level
    
    def _should_log_ui(self, level: str) -> bool:
        """Check if should log to UI."""
        return getattr(logging, level.upper(), 0) >= self._ui_level
    
    def _create_entry(
        self,
        level: str,
        module: str,
        message: str,
        details: dict = None
    ) -> LogEntry:
        """Create a log entry."""
        return LogEntry(
            level=level.upper(),
            module=module,
            message=message,
            timestamp=datetime.utcnow().isoformat() + "Z",
            details=details
        )
    
    async def log(
        self,
        level: str,
        module: str,
        message: str,
        details: dict = None
    ):
        """
        Log a message to console and/or UI.
        
        Args:
            level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
            module: Module name for categorization
            message: Log message
            details: Optional additional data
        """
        entry = self._create_entry(level, module, message, details)
        
        # Console logging
        if self._should_log_console(level):
            logger = logging.getLogger(module)
            log_func = getattr(logger, level.lower(), logger.info)
            log_func(message)
        
        # UI logging
        if self._should_log_ui(level):
            await self._send_to_ui(entry)
    
    async def _send_to_ui(self, entry: LogEntry):
        """Send log entry to all UI subscribers."""
        if not self._ui_subscribers:
            # Queue for later if configured
            if self._queue_for_ui:
                self._log_queue.append(entry)
                if len(self._log_queue) > self._max_queue:
                    self._log_queue.pop(0)
            return
        
        msg = Message(
            type=MessageType.LOG.value,
            data={
                "level": entry.level,
                "module": entry.module,
                "message": entry.message,
                "timestamp": entry.timestamp,
                "details": entry.details
            }
        )
        
        disconnected = []
        for subscriber in self._ui_subscribers:
            try:
                await subscriber.send_json(msg.to_dict())
            except Exception:
                disconnected.append(subscriber)
        
        # Clean up disconnected subscribers
        for sub in disconnected:
            self._ui_subscribers.discard(sub)
    
    def subscribe(self, websocket):
        """
        Add a UI subscriber.
        
        Queued logs will be flushed to this subscriber.
        """
        self._ui_subscribers.add(websocket)
        # Flush queued logs asynchronously
        asyncio.create_task(self._flush_queue(websocket))
    
    async def _flush_queue(self, websocket):
        """Send queued logs to new subscriber."""
        for entry in self._log_queue:
            msg = Message(
                type=MessageType.LOG.value,
                data={
                    "level": entry.level,
                    "module": entry.module,
                    "message": entry.message,
                    "timestamp": entry.timestamp,
                    "details": entry.details
                }
            )
            try:
                await websocket.send_json(msg.to_dict())
            except Exception:
                break
        self._log_queue.clear()
    
    def unsubscribe(self, websocket):
        """Remove a UI subscriber."""
        self._ui_subscribers.discard(websocket)
    
    @property
    def subscriber_count(self) -> int:
        """Number of UI subscribers."""
        return len(self._ui_subscribers)
    
    # ========== Convenience methods ==========
    
    async def debug(self, module: str, message: str, **details):
        """Log debug message."""
        await self.log("DEBUG", module, message, details or None)
    
    async def info(self, module: str, message: str, **details):
        """Log info message."""
        await self.log("INFO", module, message, details or None)
    
    async def warning(self, module: str, message: str, **details):
        """Log warning message."""
        await self.log("WARNING", module, message, details or None)
    
    async def error(self, module: str, message: str, **details):
        """Log error message."""
        await self.log("ERROR", module, message, details or None)
    
    async def critical(self, module: str, message: str, **details):
        """Log critical message."""
        await self.log("CRITICAL", module, message, details or None)


# Singleton instance
hybrid_logger = HybridLogger()
