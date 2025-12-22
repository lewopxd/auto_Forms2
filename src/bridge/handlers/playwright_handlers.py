"""
Playwright Handlers - Bridge handlers for Playwright automation.
Phase 1: Only browser detection.
"""
from typing import Dict, Any


class PlaywrightHandler:
    """Handles Playwright-related bridge messages."""
    
    def __init__(self, bridge):
        self.bridge = bridge
        self.detector = None
        
        try:
            from core.browser_automation.PlayW.browser_detector_pw import BrowserDetectorPW
            self.detector = BrowserDetectorPW()
            print("[PlaywrightHandler] Initialized with Playwright detector")
        except Exception as e:
            print(f"[PlaywrightHandler] ERROR initializing detector: {e}")
    
    def handle_detect_browsers(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Detect installed browsers compatible with Playwright."""
        print("[PlaywrightHandler] handle_detect_browsers called")
        
        if not self.detector:
            return {
                "success": False,
                "error": "Playwright detector not available",
                "browsers": []
            }
        
        try:
            browsers = self.detector.get_dropdown_choices()
            print(f"[PlaywrightHandler] Detected {len(browsers)} compatible browsers")
            return {
                "success": True,
                "browsers": browsers
            }
        except Exception as e:
            print(f"[PlaywrightHandler] Error detecting browsers: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "browsers": []
            }


def register_playwright_handlers(bridge):
    """Register Playwright handlers with the bridge."""
    handler = PlaywrightHandler(bridge)
    return handler
