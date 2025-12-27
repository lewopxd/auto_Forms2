#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Tab Manager - Selenium Tab Control
============================================
Manages browser tab operations (open, switch, close) with robust
error handling, adaptive polling, and automatic cleanup.

Context manager support for guaranteed cleanup.
"""

import time
import logging
from typing import Optional, List, Dict, Any, Set
from dataclasses import dataclass, field
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.common.exceptions import (
    NoSuchWindowException,
    WebDriverException
)


logger = logging.getLogger(__name__)


@dataclass
class TabConfig:
    """Configuration for tab management."""
    # Timeouts
    new_tab_timeout_ms: int = 60000        # Wait for new tab: 60s
    new_tab_check_interval_ms: int = 500   # Check every 500ms
    switch_delay_ms: int = 1000            # Wait after switch: 1s
    close_delay_ms: int = 500              # Wait after close: 500ms
    
    # Retries
    max_retries: int = 3
    retry_delay_ms: int = 2000
    
    # Logging
    verbose_logging: bool = True


@dataclass
class TabResult:
    """Result of a tab operation."""
    success: bool
    handle: Optional[str] = None
    elapsed_ms: float = 0
    error: Optional[str] = None
    warning: Optional[str] = None
    checks: int = 0


class TabManager:
    """
    Manages browser tab operations with robust error handling.
    
    Features:
    - Adaptive polling for new tab detection
    - Automatic cleanup of opened tabs
    - Context manager support for guaranteed cleanup
    - Recovery mode for error situations
    
    Usage:
        with TabManager(driver) as tab_mgr:
            result = tab_mgr.wait_for_new_tab(original_handles)
            if result.success:
                tab_mgr.switch_to_tab(result.handle)
                # Do work...
            # Tabs automatically closed on exit
    """
    
    def __init__(self, driver: WebDriver, config: TabConfig = None):
        self.driver = driver
        self.config = config or TabConfig()
        self.opened_tabs: List[str] = []
        self._original_handle: Optional[str] = None
    
    def __enter__(self):
        """Context manager entry - save original tab."""
        try:
            self._original_handle = self.driver.current_window_handle
        except:
            self._original_handle = None
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup opened tabs."""
        self._cleanup_tabs()
        return False  # Don't suppress exceptions
    
    def _log(self, message: str, level: str = 'info'):
        """Log with prefix."""
        if not self.config.verbose_logging:
            return
        
        prefix = "[TabManager]"
        full_message = f"{prefix} {message}"
        
        if level == 'debug':
            logger.debug(full_message)
        elif level == 'warning':
            logger.warning(full_message)
        elif level == 'error':
            logger.error(full_message)
        else:
            logger.info(full_message)
        
        # Also print for visibility during automation
        print(full_message)
    
    def get_current_handles(self) -> Set[str]:
        """Get current window handles as a set."""
        try:
            return set(self.driver.window_handles)
        except WebDriverException as e:
            self._log(f"Error getting handles: {e}", 'error')
            return set()
    
    def wait_for_new_tab(
        self,
        original_handles: Set[str],
        timeout_ms: int = None,
        check_interval_ms: int = None
    ) -> TabResult:
        """
        Wait for a new tab to open using adaptive polling.
        
        Args:
            original_handles: Set of window handles before action
            timeout_ms: Optional override for timeout
            check_interval_ms: Optional override for check interval
        
        Returns:
            TabResult with success status and new tab handle
        """
        timeout = timeout_ms or self.config.new_tab_timeout_ms
        
        self._log(f"Waiting for new tab (timeout: {timeout}ms)...")
        self._log(f"Current tabs: {len(original_handles)}")
        
        start_time = time.time() * 1000
        checks = 0
        
        # Adaptive polling phases
        # Phase 1: Fast checks (0-5s, every 500ms)
        # Phase 2: Medium checks (5-20s, every 1000ms)
        # Phase 3: Slow checks (20-60s, every 2000ms)
        
        while (time.time() * 1000 - start_time) < timeout:
            checks += 1
            elapsed = time.time() * 1000 - start_time
            
            # Determine check interval based on elapsed time
            if elapsed < 5000:
                interval = 500
            elif elapsed < 20000:
                interval = 1000
            else:
                interval = 2000
            
            # Get current handles
            current_handles = self.get_current_handles()
            
            self._log(f"Check #{checks}: {len(current_handles)} tabs", 'debug')
            
            if len(current_handles) > len(original_handles):
                # New tab(s) detected
                new_handles = current_handles - original_handles
                
                if len(new_handles) == 1:
                    new_handle = next(iter(new_handles))
                    self._log(f"✓ New tab detected: {new_handle[:20]}...")
                    self.opened_tabs.append(new_handle)
                    
                    return TabResult(
                        success=True,
                        handle=new_handle,
                        elapsed_ms=elapsed,
                        checks=checks
                    )
                else:
                    # Multiple new tabs - use the last one
                    new_handle = list(new_handles)[-1]
                    self._log(f"⚠️ Multiple new tabs detected, using last one")
                    self.opened_tabs.extend(list(new_handles))
                    
                    return TabResult(
                        success=True,
                        handle=new_handle,
                        elapsed_ms=elapsed,
                        checks=checks,
                        warning='multiple_tabs'
                    )
            
            # Wait before next check
            time.sleep(interval / 1000)
        
        # Timeout reached
        self._log(f"✗ TIMEOUT: No new tab detected in {timeout}ms", 'error')
        
        return TabResult(
            success=False,
            elapsed_ms=timeout,
            error='timeout',
            checks=checks
        )
    
    def switch_to_tab(
        self,
        target_handle: str,
        delay_after_ms: int = None
    ) -> TabResult:
        """
        Switch to a specific tab by handle.
        
        Args:
            target_handle: Window handle to switch to
            delay_after_ms: Optional delay after switching
        
        Returns:
            TabResult with success status
        """
        delay = delay_after_ms or self.config.switch_delay_ms
        
        self._log(f"Switching to tab: {target_handle[:20]}...")
        
        try:
            # Verify handle exists
            current_handles = self.get_current_handles()
            
            if target_handle not in current_handles:
                self._log("✗ Handle not found", 'error')
                return TabResult(
                    success=False,
                    error='handle_not_found'
                )
            
            # Perform switch
            self.driver.switch_to.window(target_handle)
            time.sleep(delay / 1000)
            
            # Verify switch was successful
            actual_handle = self.driver.current_window_handle
            
            if actual_handle == target_handle:
                self._log("✓ Switch successful")
                return TabResult(
                    success=True,
                    handle=target_handle
                )
            else:
                self._log("✗ Switch verification failed", 'error')
                return TabResult(
                    success=False,
                    error='switch_verification_failed'
                )
        
        except NoSuchWindowException:
            self._log("✗ Window no longer exists", 'error')
            return TabResult(
                success=False,
                error='window_closed'
            )
        except Exception as e:
            self._log(f"✗ Error in switch: {e}", 'error')
            return TabResult(
                success=False,
                error=str(e)
            )
    
    def close_tab_and_return(
        self,
        tab_to_close: str,
        return_to_handle: str,
        delay_ms: int = None
    ) -> TabResult:
        """
        Close a tab and return to another.
        
        Args:
            tab_to_close: Handle of tab to close
            return_to_handle: Handle to return to after closing
            delay_ms: Optional delay between operations
        
        Returns:
            TabResult with success status
        """
        delay = delay_ms or self.config.close_delay_ms
        
        self._log(f"Closing tab and returning...")
        
        try:
            # Switch to tab to close
            self.driver.switch_to.window(tab_to_close)
            time.sleep(0.2)
            
            # Close it
            self.driver.close()
            time.sleep(delay / 1000)
            
            # Remove from tracked tabs
            if tab_to_close in self.opened_tabs:
                self.opened_tabs.remove(tab_to_close)
            
            # Return to original
            self.driver.switch_to.window(return_to_handle)
            time.sleep(delay / 1000)
            
            # Verify
            actual = self.driver.current_window_handle
            
            if actual == return_to_handle:
                self._log("✓ Close and return successful")
                return TabResult(
                    success=True,
                    handle=return_to_handle
                )
            else:
                self._log("⚠️ Returned but to unexpected handle", 'warning')
                return TabResult(
                    success=True,
                    handle=actual,
                    warning='unexpected_handle'
                )
        
        except Exception as e:
            self._log(f"Error closing tab: {e}", 'error')
            
            # Recovery: try to switch to any available tab
            try:
                remaining = self.driver.window_handles
                if remaining:
                    self.driver.switch_to.window(remaining[0])
                    self._log("⚠️ Recovery: switched to first available tab", 'warning')
                    return TabResult(
                        success=True,
                        handle=remaining[0],
                        warning='recovery_mode'
                    )
            except:
                pass
            
            return TabResult(
                success=False,
                error='critical_recovery_failed'
            )
    
    def _cleanup_tabs(self):
        """Close all tabs we opened and return to original."""
        if not self.opened_tabs:
            return
        
        self._log(f"Cleanup: closing {len(self.opened_tabs)} tab(s)...")
        
        for handle in self.opened_tabs[:]:  # Copy list for iteration
            try:
                if handle in self.driver.window_handles:
                    self.driver.switch_to.window(handle)
                    self.driver.close()
                    self.opened_tabs.remove(handle)
            except:
                pass
        
        # Return to original tab if possible
        if self._original_handle:
            try:
                if self._original_handle in self.driver.window_handles:
                    self.driver.switch_to.window(self._original_handle)
            except:
                # Try first available
                try:
                    handles = self.driver.window_handles
                    if handles:
                        self.driver.switch_to.window(handles[0])
                except:
                    pass
        
        self._log("Cleanup complete")
    
    def get_page_url(self) -> str:
        """Get current page URL."""
        try:
            return self.driver.current_url
        except:
            return ''
    
    def wait_for_page_load(self, timeout_seconds: int = 10) -> bool:
        """Wait for page to finish loading."""
        try:
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            
            WebDriverWait(self.driver, timeout_seconds).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            return True
        except:
            return False
