"""
Data Handlers - Handle messages on the data channel
"""
import sys
import os
from typing import Optional

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from server.protocol.message import Message, MessageType
from server.protocol.queue import MessageQueue
from server.logger import hybrid_logger


class DataHandlers:
    """
    Handles incoming messages on the data channel.
    
    Each handler receives a Message and returns an optional response Message.
    """
    
    def __init__(self, queue: MessageQueue):
        """
        Initialize handlers.
        
        Args:
            queue: MessageQueue for sending responses
        """
        self.queue = queue
    
    async def handle(self, msg: Message) -> Optional[Message]:
        """
        Route message to appropriate handler.
        
        Args:
            msg: Incoming message
            
        Returns:
            Response message or None
        """
        handlers = {
            MessageType.PING.value: self._handle_ping,
            MessageType.GET_FORMS.value: self._handle_get_forms,
            MessageType.GET_FORM_DATA.value: self._handle_get_form_data,
        }
        
        handler = handlers.get(msg.type)
        if handler:
            try:
                return await handler(msg)
            except Exception as e:
                await hybrid_logger.error(
                    "handlers",
                    f"Handler error for {msg.type}: {e}"
                )
                return Message.error_msg(
                    "HANDLER_ERROR",
                    str(e),
                    reply_to=msg.id
                )
        
        # Unknown message type
        await hybrid_logger.warning(
            "handlers",
            f"Unknown message type: {msg.type}"
        )
        return Message.error_msg(
            "UNKNOWN_TYPE",
            f"Unknown message type: {msg.type}",
            reply_to=msg.id
        )
    
    async def _handle_ping(self, msg: Message) -> Message:
        """Handle ping - respond with pong."""
        await hybrid_logger.debug("handlers", "Ping received")
        return Message.pong(msg.id)
    
    async def _handle_get_forms(self, msg: Message) -> Message:
        """Handle get_forms - return list of recorded forms."""
        try:
            from core.form_storage import get_all_forms
            forms = get_all_forms()
            
            await hybrid_logger.info(
                "handlers",
                f"Returning {len(forms)} forms"
            )
            
            return Message(
                type=MessageType.FORMS_LIST.value,
                reply_to=msg.id,
                data={"forms": forms, "count": len(forms)}
            )
        except ImportError:
            return Message(
                type=MessageType.FORMS_LIST.value,
                reply_to=msg.id,
                data={"forms": [], "count": 0, "note": "form_storage not available"}
            )
    
    async def _handle_get_form_data(self, msg: Message) -> Message:
        """Handle get_form_data - return specific form data."""
        url = msg.data.get("url", "") if msg.data else ""
        
        if not url:
            return Message.error_msg(
                "MISSING_URL",
                "URL is required",
                reply_to=msg.id
            )
        
        try:
            from core.form_storage import load_form_data
            form_data = load_form_data(url)
            
            await hybrid_logger.info(
                "handlers",
                f"Loaded form data for URL"
            )
            
            return Message(
                type=MessageType.FORM_DATA.value,
                reply_to=msg.id,
                data=form_data
            )
        except ImportError:
            return Message.error_msg(
                "MODULE_ERROR",
                "form_storage not available",
                reply_to=msg.id
            )
        except Exception as e:
            return Message.error_msg(
                "LOAD_ERROR",
                str(e),
                reply_to=msg.id
            )
