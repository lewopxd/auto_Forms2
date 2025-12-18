"""
Message Protocol - Professional message handling with validation
"""
import uuid
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, Any, Dict
from enum import Enum
import json


class MessageType(str, Enum):
    """All supported message types."""
    # Control
    PING = "ping"
    PONG = "pong"
    ACK = "ack"
    NACK = "nack"
    CONNECTED = "connected"
    
    # Data
    GET_FORMS = "get_forms"
    FORMS_LIST = "forms_list"
    GET_FORM_DATA = "get_form_data"
    FORM_DATA = "form_data"
    START_EXECUTION = "start_execution"
    EXECUTION_PROGRESS = "execution_progress"
    EXECUTION_COMPLETE = "execution_complete"
    
    # Logs
    LOG = "log"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    
    # Errors
    ERROR = "error"


# Message types that do NOT require ACK
NO_ACK_TYPES = {
    MessageType.ACK,
    MessageType.NACK,
    MessageType.PONG,
    MessageType.LOG,
    MessageType.EXECUTION_PROGRESS,
    MessageType.CONNECTED,
}


@dataclass
class Message:
    """
    Immutable message with automatic ID and timestamp.
    
    All messages follow this envelope structure for reliability.
    """
    
    type: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    reply_to: Optional[str] = None
    data: Optional[Any] = None
    error: Optional[Dict[str, str]] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary, excluding None values."""
        result = {
            "id": self.id,
            "type": self.type,
            "timestamp": self.timestamp,
        }
        if self.reply_to:
            result["replyTo"] = self.reply_to
        if self.data is not None:
            result["data"] = self.data
        if self.error:
            result["error"] = self.error
        return result
    
    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict())
    
    @classmethod
    def from_dict(cls, data: dict) -> "Message":
        """Parse message from dictionary."""
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            type=data.get("type", "unknown"),
            timestamp=data.get("timestamp", datetime.utcnow().isoformat() + "Z"),
            reply_to=data.get("replyTo"),
            data=data.get("data"),
            error=data.get("error"),
        )
    
    @classmethod
    def from_json(cls, json_str: str) -> "Message":
        """Parse message from JSON string."""
        return cls.from_dict(json.loads(json_str))
    
    @classmethod
    def ack(cls, original_id: str) -> "Message":
        """Create ACK for a message."""
        return cls(type=MessageType.ACK.value, reply_to=original_id)
    
    @classmethod
    def nack(cls, original_id: str, code: str, message: str) -> "Message":
        """Create NACK (negative acknowledgment) for a message."""
        return cls(
            type=MessageType.NACK.value,
            reply_to=original_id,
            error={"code": code, "message": message}
        )
    
    @classmethod
    def error_msg(cls, code: str, message: str, reply_to: str = None) -> "Message":
        """Create error message."""
        return cls(
            type=MessageType.ERROR.value,
            reply_to=reply_to,
            error={"code": code, "message": message}
        )
    
    @classmethod
    def pong(cls, ping_id: str) -> "Message":
        """Create PONG response to PING."""
        return cls(type=MessageType.PONG.value, reply_to=ping_id)

    def requires_ack(self) -> bool:
        """Check if this message type requires acknowledgment."""
        try:
            msg_type = MessageType(self.type)
            return msg_type not in NO_ACK_TYPES
        except ValueError:
            # Unknown type, require ACK to be safe
            return True
    
    def __str__(self) -> str:
        return f"Message({self.type}, id={self.id[:8]}...)"
