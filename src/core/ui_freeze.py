"""
UI Freeze Manager Module

Manages UI freeze state during Selenium recordings to free up system resources.
Tracks frozen state and provides methods to freeze/unfreeze the pywebview window.
"""
import threading
from typing import Optional, Any

# Configuration will be imported dynamically to avoid circular imports
_config_cache = None


def _get_config():
    """Get config module (lazy load to avoid circular imports)."""
    global _config_cache
    if _config_cache is None:
        from . import config
        _config_cache = config
    return _config_cache


class UIFreezeManager:
    """
    Singleton manager for UI freeze state.
    
    Usage:
        UIFreezeManager.freeze(window, "recording")
        UIFreezeManager.unfreeze()
        UIFreezeManager.is_frozen()  # -> True/False
    """
    
    _is_frozen: bool = False
    _freeze_reason: Optional[str] = None
    _window_ref: Optional[Any] = None
    _was_visible: bool = True
    _was_minimized: bool = False
    _lock = threading.Lock()
    
    # Callbacks to notify when state changes
    _on_freeze_callbacks: list = []
    _on_unfreeze_callbacks: list = []
    
    @classmethod
    def freeze(cls, window: Any, reason: str = "recording") -> bool:
        """
        Freeze the UI to save resources.
        
        Args:
            window: pywebview window object
            reason: Why we're freezing (for logging/debugging)
            
        Returns:
            True if freeze was successful
        """
        config = _get_config()
        
        if not config.FREEZE_UI_ENABLED:
            print("[UIFreeze] Freeze disabled in config, skipping")
            return False
        
        with cls._lock:
            if cls._is_frozen:
                print(f"[UIFreeze] Already frozen (reason: {cls._freeze_reason})")
                return True
            
            cls._window_ref = window
            cls._freeze_reason = reason
            
            try:
                # Save current state
                cls._was_visible = True  # Assume visible
                cls._was_minimized = False
                
                # Apply freeze actions based on config
                if config.FREEZE_UI_HIDE:
                    # Most aggressive - hide window completely
                    print("[UIFreeze] Hiding window...")
                    if hasattr(window, 'hide'):
                        window.hide()
                elif config.FREEZE_UI_MINIMIZE:
                    # Less aggressive - just minimize
                    print("[UIFreeze] Minimizing window...")
                    if hasattr(window, 'minimize'):
                        window.minimize()
                
                cls._is_frozen = True
                print(f"[UIFreeze] UI frozen successfully (reason: {reason})")
                
                # Notify callbacks
                for callback in cls._on_freeze_callbacks:
                    try:
                        callback(reason)
                    except Exception as e:
                        print(f"[UIFreeze] Callback error: {e}")
                
                return True
                
            except Exception as e:
                print(f"[UIFreeze] Error during freeze: {e}")
                return False
    
    @classmethod
    def unfreeze(cls) -> bool:
        """
        Unfreeze the UI and restore it.
        
        Returns:
            True if unfreeze was successful
        """
        with cls._lock:
            if not cls._is_frozen:
                print("[UIFreeze] Not frozen, nothing to unfreeze")
                return True
            
            reason = cls._freeze_reason
            window = cls._window_ref
            
            try:
                if window:
                    config = _get_config()
                    
                    # Restore window visibility
                    if config.FREEZE_UI_HIDE:
                        print("[UIFreeze] Showing window...")
                        if hasattr(window, 'show'):
                            window.show()
                    elif config.FREEZE_UI_MINIMIZE:
                        print("[UIFreeze] Restoring window...")
                        if hasattr(window, 'restore'):
                            window.restore()
                
                cls._is_frozen = False
                cls._freeze_reason = None
                print(f"[UIFreeze] UI unfrozen (was frozen for: {reason})")
                
                # Notify callbacks
                for callback in cls._on_unfreeze_callbacks:
                    try:
                        callback(reason)
                    except Exception as e:
                        print(f"[UIFreeze] Callback error: {e}")
                
                return True
                
            except Exception as e:
                print(f"[UIFreeze] Error during unfreeze: {e}")
                # Force state reset even on error
                cls._is_frozen = False
                cls._freeze_reason = None
                return False
    
    @classmethod
    def is_frozen(cls) -> bool:
        """Check if UI is currently frozen."""
        return cls._is_frozen
    
    @classmethod
    def get_reason(cls) -> Optional[str]:
        """Get the reason for current freeze, or None if not frozen."""
        return cls._freeze_reason if cls._is_frozen else None
    
    @classmethod
    def get_status(cls) -> dict:
        """Get full freeze status as dict (for API responses)."""
        return {
            "frozen": cls._is_frozen,
            "reason": cls._freeze_reason
        }
    
    @classmethod
    def on_freeze(cls, callback):
        """Register callback to be called when UI freezes."""
        cls._on_freeze_callbacks.append(callback)
    
    @classmethod
    def on_unfreeze(cls, callback):
        """Register callback to be called when UI unfreezes."""
        cls._on_unfreeze_callbacks.append(callback)
    
    @classmethod
    def reset(cls):
        """Reset all state (for testing/cleanup)."""
        with cls._lock:
            cls._is_frozen = False
            cls._freeze_reason = None
            cls._window_ref = None
            cls._was_visible = True
            cls._was_minimized = False
