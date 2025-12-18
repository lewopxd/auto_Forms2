"""
Message Queue - Reliable delivery with retries and ACK tracking
"""
import asyncio
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, Callable, Awaitable, Optional
import logging

from .message import Message

logger = logging.getLogger(__name__)

# Default config (can be overridden)
DEFAULT_ACK_TIMEOUT = 5  # seconds
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1  # seconds


@dataclass
class PendingMessage:
    """Message waiting for ACK."""
    message: Message
    sent_at: datetime
    retries: int = 0
    callback: Optional[Callable[[bool, Optional[Message]], Awaitable[None]]] = None


class MessageQueue:
    """
    Manages outgoing messages with ACK tracking and retries.
    
    Features:
    - Tracks pending messages waiting for ACK
    - Automatic retry on timeout
    - Callback notification on success/failure
    - Clean shutdown
    """
    
    def __init__(
        self,
        send_func: Callable[[str], Awaitable[None]],
        ack_timeout: float = DEFAULT_ACK_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_delay: float = DEFAULT_RETRY_DELAY
    ):
        """
        Initialize the message queue.
        
        Args:
            send_func: Async function to send raw message string
            ack_timeout: Seconds to wait for ACK before retry
            max_retries: Maximum retry attempts
            retry_delay: Seconds between retries
        """
        self.send_func = send_func
        self.ack_timeout = ack_timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        self.pending: Dict[str, PendingMessage] = {}
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the queue processor."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._process_loop())
        logger.debug("MessageQueue started")
    
    async def stop(self):
        """Stop the queue processor."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        
        # Notify all pending messages of failure
        for msg_id, pending in list(self.pending.items()):
            if pending.callback:
                try:
                    await pending.callback(False, None)
                except Exception:
                    pass
        self.pending.clear()
        logger.debug("MessageQueue stopped")
    
    async def send(
        self,
        message: Message,
        callback: Optional[Callable[[bool, Optional[Message]], Awaitable[None]]] = None
    ) -> bool:
        """
        Send a message. If it requires ACK, track it for retry.
        
        Args:
            message: Message to send
            callback: Optional async callback(success: bool, response: Message or None)
        
        Returns:
            True if sent successfully, False on immediate failure
        """
        try:
            await self.send_func(message.to_json())
            
            if message.requires_ack():
                self.pending[message.id] = PendingMessage(
                    message=message,
                    sent_at=datetime.utcnow(),
                    callback=callback
                )
                logger.debug(f"Message {message.id[:8]} sent, waiting for ACK")
            else:
                logger.debug(f"Message {message.id[:8]} sent (no ACK required)")
            
            return True
        except Exception as e:
            logger.error(f"Failed to send message {message.id[:8]}: {e}")
            return False
    
    async def acknowledge(
        self,
        message_id: str,
        success: bool = True,
        response: Optional[Message] = None
    ):
        """
        Mark a message as acknowledged.
        
        Args:
            message_id: ID of the original message
            success: True for ACK, False for NACK
            response: Optional response message
        """
        if message_id not in self.pending:
            logger.debug(f"ACK for unknown message {message_id[:8]}")
            return
        
        pending = self.pending.pop(message_id)
        
        if pending.callback:
            try:
                await pending.callback(success, response)
            except Exception as e:
                logger.error(f"Callback error for {message_id[:8]}: {e}")
        
        status = "ACK" if success else "NACK"
        logger.debug(f"Message {message_id[:8]} received {status}")
    
    async def _process_loop(self):
        """Background loop to check for timeouts and retry."""
        while self._running:
            await asyncio.sleep(1)  # Check every second
            
            now = datetime.utcnow()
            timeout = timedelta(seconds=self.ack_timeout)
            
            timed_out = []
            
            for msg_id, pending in list(self.pending.items()):
                if now - pending.sent_at > timeout:
                    if pending.retries < self.max_retries:
                        # Retry
                        pending.retries += 1
                        pending.sent_at = now
                        logger.warning(
                            f"Retrying message {msg_id[:8]} "
                            f"(attempt {pending.retries}/{self.max_retries})"
                        )
                        try:
                            await self.send_func(pending.message.to_json())
                        except Exception as e:
                            logger.error(f"Retry failed for {msg_id[:8]}: {e}")
                    else:
                        # Give up
                        timed_out.append(msg_id)
            
            # Handle messages that exceeded max retries
            for msg_id in timed_out:
                pending = self.pending.pop(msg_id)
                logger.error(
                    f"Message {msg_id[:8]} timed out after "
                    f"{self.max_retries} retries"
                )
                if pending.callback:
                    try:
                        await pending.callback(False, None)
                    except Exception as e:
                        logger.error(f"Timeout callback error: {e}")
    
    @property
    def pending_count(self) -> int:
        """Number of messages waiting for ACK."""
        return len(self.pending)
