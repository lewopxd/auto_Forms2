#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
URL Capturer v2 - MS Forms Specific
============================================
Captures edit URLs from MS Forms by navigating the
forms list and clicking on the most recently submitted form.

Flow:
1. Wait for forms list page to load
2. Find the first (most recent) response card
3. Click to open edit page in new tab
4. Capture the URL
5. Return result
"""

import time
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    StaleElementReferenceException,
    ElementClickInterceptedException
)

from .tab_manager import TabManager, TabConfig
from .login_detector import LoginDetector, LoginConfig, LoginResult


logger = logging.getLogger(__name__)


@dataclass
class URLCaptureConfig:
    """Configuration for URL capture."""
    # Timeouts
    page_load_timeout_ms: int = 60000
    card_wait_timeout_ms: int = 60000
    new_tab_timeout_ms: int = 60000
    
    # Selectors for response cards
    card_selectors: List[str] = field(default_factory=lambda: [
        "[data-automation-id='itemContainer']",        # Primary selector
        ".item__container",                             # Class-based
        ".item-element[role='button']",                # Role-based
        "[data-is-focusable='true'][role='button']",   # Focusable buttons
    ])
    
    # Logging
    verbose_logging: bool = True


@dataclass
class CaptureResult:
    """Result of URL capture operation."""
    success: bool
    url: Optional[str] = None
    strategy_name: str = ''
    confidence: float = 0.0
    capture_time_ms: float = 0
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class URLCapturer:
    """
    Captures edit URLs from MS Forms response list.
    
    This capturer is specifically designed for MS Forms workflow:
    1. After submitting a form and clicking "Save my response"
    2. User is taken to forms list (DesignPagev2.aspx or similar)
    3. The most recent response is the first card
    4. Clicking on it opens the edit URL in a new tab
    
    Usage:
        capturer = URLCapturer(driver, tab_manager, config)
        result = capturer.capture()
        if result.success:
            print(f"Edit URL: {result.url}")
    """
    
    def __init__(
        self,
        driver: WebDriver,
        tab_manager: TabManager,
        config: URLCaptureConfig = None,
        login_detector: LoginDetector = None
    ):
        self.driver = driver
        self.tab_manager = tab_manager
        self.config = config or URLCaptureConfig()
        self.login_detector = login_detector
    
    def _log(self, message: str, level: str = 'info'):
        """Log with prefix."""
        if not self.config.verbose_logging:
            return
        
        prefix = "[URLCapture]"
        full_message = f"{prefix} {message}"
        
        if level == 'debug':
            logger.debug(full_message)
        elif level == 'warning':
            logger.warning(full_message)
        elif level == 'error':
            logger.error(full_message)
        else:
            logger.info(full_message)
        
        print(full_message)
    
    def _detect_page_type(self) -> str:
        """
        Detect what type of page we're on.
        
        Returns:
            'login' | 'forms_list' | 'form' | 'unknown'
        """
        try:
            current_url = self.driver.current_url.lower()
            
            # Login page
            if any(x in current_url for x in ['login.microsoftonline', 'login.live', 'login.microsoft']):
                return 'login'
            
            # Forms list (responses page)
            if any(x in current_url for x in ['designpagev2', 'forms.office.com/pages', 'forms.microsoft.com']):
                # Check if it's the list or a specific form
                if 'designpagev2' in current_url or '/pages/' in current_url:
                    return 'forms_list'
            
            # Forms main page (might be list)
            if 'forms.office.com' in current_url and 'r/' not in current_url:
                return 'forms_list'
            
            # Specific form
            if 'r/' in current_url or 'formid=' in current_url:
                return 'form'
            
            return 'unknown'
        except:
            return 'unknown'
    
    def _handle_login_if_needed(self) -> bool:
        """
        Handle login if we're on a login page.
        
        Returns:
            True if logged in (or was already), False if login failed
        """
        if not self.login_detector:
            # Create a temporary one
            self.login_detector = LoginDetector(
                self.driver, 
                LoginConfig(verbose_logging=self.config.verbose_logging)
            )
        
        page_type = self._detect_page_type()
        
        if page_type != 'login':
            return True  # Not on login page, assume OK
        
        self._log("Detected login page, attempting auto-login...")
        
        # Try auto-login first
        result = self.login_detector.try_auto_login(timeout_ms=15000)
        
        if result.success and result.logged_in:
            self._log("✓ Auto-login successful")
            return True
        
        # Auto-login failed, wait for manual login
        self._log("Auto-login failed, waiting for manual login...")
        result = self.login_detector.wait_for_manual_login(timeout_ms=self.config.page_load_timeout_ms * 4)
        
        return result.success and result.logged_in
    
    def _wait_for_cards(self) -> bool:
        """
        Wait for response cards to appear on the page.
        
        Returns:
            True if cards found, False otherwise
        """
        self._log("Waiting for response cards to load...")
        
        timeout = self.config.card_wait_timeout_ms / 1000
        
        for selector in self.config.card_selectors:
            try:
                wait = WebDriverWait(self.driver, timeout)
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
                self._log(f"✓ Cards found with selector: {selector}")
                return True
            except TimeoutException:
                continue
            except Exception as e:
                self._log(f"Error waiting for {selector}: {e}", 'debug')
                continue
        
        return False
    
    def _find_first_response_card(self):
        """
        Find the first (most recent) response card.
        
        Returns:
            WebElement or None
        """
        self._log("Looking for first response card (most recent)...")
        
        for selector in self.config.card_selectors:
            try:
                # Find first matching element
                elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                
                for elem in elements:
                    try:
                        if elem.is_displayed():
                            # Get some metadata
                            title = ""
                            try:
                                title_elem = elem.find_element(By.CSS_SELECTOR, "[data-automation-id='detailTitle']")
                                title = title_elem.text
                            except:
                                try:
                                    title = elem.get_attribute("aria-label") or ""
                                except:
                                    pass
                            
                            self._log(f"✓ Found response card: '{title[:50]}...' (selector: {selector})")
                            return elem
                    except StaleElementReferenceException:
                        continue
            except Exception as e:
                self._log(f"Error with selector {selector}: {e}", 'debug')
                continue
        
        self._log("✗ No response cards found", 'error')
        return None
    
    def _click_card_and_capture_url(self, card, form_url: str = None) -> CaptureResult:
        """
        Click on a response card and capture the URL from the new tab.
        
        Args:
            card: WebElement of the card to click
            form_url: Original form URL for validation/redirection
        
        Returns:
            CaptureResult with captured URL
        """
        self._log("Clicking on response card to open edit page...")
        
        start_time = time.time() * 1000
        
        try:
            # Store current handles BEFORE any action
            original_handles = set(self.driver.window_handles)
            current_handle = self.driver.current_window_handle
            
            self._log(f"Current tabs: {len(original_handles)}, current handle: {current_handle[:20]}...")
            
            # Apply visual feedback (optional)
            try:
                self.driver.execute_script("""
                    arguments[0].style.boxShadow = '0 0 20px 5px orange';
                    arguments[0].style.transition = 'box-shadow 0.3s';
                """, card)
            except:
                pass
            
            # Click on the card
            try:
                card.click()
                self._log("✓ Clicked on card (native)")
            except ElementClickInterceptedException:
                self.driver.execute_script("arguments[0].click();", card)
                self._log("✓ Clicked on card (JS)")
            except Exception as e:
                self.driver.execute_script("arguments[0].click();", card)
                self._log(f"✓ Clicked on card (JS fallback after: {e})")
            
            # Wait for new tab
            self._log(f"Waiting for new tab (timeout: {self.config.new_tab_timeout_ms}ms)...")
            
            new_tab = None
            wait_start = time.time() * 1000
            
            while time.time() * 1000 - wait_start < self.config.new_tab_timeout_ms:
                try:
                    current_handles = set(self.driver.window_handles)
                    new_handles = current_handles - original_handles
                    
                    if new_handles:
                        new_tab = list(new_handles)[0]
                        self._log(f"✓ New tab detected!")
                        break
                except Exception as e:
                    self._log(f"Error checking handles: {e}", 'debug')
                
                time.sleep(0.3)
            
            if not new_tab:
                self._log("✗ No new tab opened after clicking card", 'error')
                return CaptureResult(
                    success=False,
                    error='no_new_tab_after_card_click',
                    capture_time_ms=time.time() * 1000 - start_time
                )
            
            # Switch to new tab
            self.driver.switch_to.window(new_tab)
            
            # Wait a moment for URL to stabilize
            time.sleep(1.5)
            
            # Capture URL
            edit_url = self.driver.current_url
            self._log(f"✓ Captured URL: {edit_url[:80]}...")
            
            # Validate URL
            confidence = 0.0
            if edit_url and len(edit_url) > 20:
                confidence = 0.95
                
                # Additional validation
                if 'id=' in edit_url or 'response' in edit_url.lower() or 'edit' in edit_url.lower():
                    confidence = 1.0
                elif 'forms' in edit_url.lower():
                    confidence = 0.85
            
            # ═══════════════════════════════════════════════════════════════
            # ROBUST TAB CLOSING - Never close last tab, validate destination
            # ═══════════════════════════════════════════════════════════════
            
            # Get current handle count BEFORE closing
            try:
                handles_before_close = self.driver.window_handles
                handle_count = len(handles_before_close)
                self._log(f"Tabs before close: {handle_count}")
            except Exception as e:
                self._log(f"⚠️ Error getting handles: {e}", 'warning')
                handle_count = 1  # Assume 1 to prevent close
            
            # Only close if we have more than 1 tab
            if handle_count > 1:
                self._log("Closing edit tab (safe - not last)...")
                try:
                    self.driver.close()
                    self._log("✓ Edit tab closed")
                except Exception as e:
                    self._log(f"⚠️ Error closing tab: {e}", 'warning')
            else:
                self._log("⚠️ NOT closing tab - it's the only one!", 'warning')
            
            # ═══════════════════════════════════════════════════════════════
            # SWITCH BACK - Validate destination handle exists
            # ═══════════════════════════════════════════════════════════════
            
            try:
                remaining_handles = self.driver.window_handles
                self._log(f"Remaining tabs: {len(remaining_handles)}")
                
                if not remaining_handles:
                    self._log("✗ CRITICAL: No tabs remaining!", 'error')
                    return CaptureResult(
                        success=True,  # URL was captured successfully
                        url=edit_url,
                        strategy_name='forms_card_click',
                        confidence=confidence,
                        capture_time_ms=time.time() * 1000 - start_time,
                        error='no_tabs_remaining_after_close',
                        metadata={'method': 'first_card_click', 'warning': 'browser_may_be_closed'}
                    )
                
                # Check if original handle still exists
                if current_handle in remaining_handles:
                    self._log(f"Switching to original handle...")
                    self.driver.switch_to.window(current_handle)
                else:
                    # Original handle is gone, switch to first available
                    self._log(f"⚠️ Original handle gone, switching to first available...")
                    self.driver.switch_to.window(remaining_handles[0])
                
                self._log("✓ Switched back to list tab")
                
            except Exception as e:
                self._log(f"⚠️ Error switching back: {e}", 'warning')
                # Try to recover
                try:
                    remaining = self.driver.window_handles
                    if remaining:
                        self.driver.switch_to.window(remaining[0])
                except:
                    pass
            
            return CaptureResult(
                success=True,
                url=edit_url,
                strategy_name='forms_card_click',
                confidence=confidence,
                capture_time_ms=time.time() * 1000 - start_time,
                metadata={
                    'method': 'first_card_click',
                    'card_selector': self.config.card_selectors[0]
                }
            )
        
        except Exception as e:
            self._log(f"✗ Error during card click and capture: {e}", 'error')
            return CaptureResult(
                success=False,
                error=str(e),
                capture_time_ms=time.time() * 1000 - start_time
            )
    
    def capture(self) -> CaptureResult:
        """
        Main entry point: capture the edit URL from forms list.
        
        This method:
        1. Detects page type and handles login if needed
        2. Waits for response cards to load
        3. Clicks the first card (most recent response)
        4. Captures the URL from the new tab
        
        Returns:
            CaptureResult with captured URL or error
        """
        self._log("========== STARTING URL CAPTURE ==========")
        start_time = time.time() * 1000
        
        try:
            # Step 1: Detect page type
            page_type = self._detect_page_type()
            self._log(f"Page type detected: {page_type}")
            
            # Step 2: Handle login if needed
            if page_type == 'login':
                self._log("On login page, handling login...")
                if not self._handle_login_if_needed():
                    return CaptureResult(
                        success=False,
                        error='login_required',
                        capture_time_ms=time.time() * 1000 - start_time
                    )
                # Re-detect page type after login
                page_type = self._detect_page_type()
                self._log(f"Page type after login: {page_type}")
            
            # Step 3: Wait for cards
            if not self._wait_for_cards():
                self._log("✗ No response cards found on page", 'error')
                return CaptureResult(
                    success=False,
                    error='no_cards_found',
                    capture_time_ms=time.time() * 1000 - start_time
                )
            
            # Step 4: Find first (most recent) card
            card = self._find_first_response_card()
            if not card:
                return CaptureResult(
                    success=False,
                    error='first_card_not_found',
                    capture_time_ms=time.time() * 1000 - start_time
                )
            
            # Step 5: Click card and capture URL
            result = self._click_card_and_capture_url(card)
            
            if result.success:
                self._log("========== URL CAPTURE SUCCESSFUL ==========")
                self._log(f"URL: {result.url}")
                self._log(f"Confidence: {result.confidence:.0%}")
            else:
                self._log(f"========== URL CAPTURE FAILED: {result.error} ==========")
            
            return result
        
        except Exception as e:
            self._log(f"✗ Unexpected error during capture: {e}", 'error')
            import traceback
            traceback.print_exc()
            
            return CaptureResult(
                success=False,
                error=str(e),
                capture_time_ms=time.time() * 1000 - start_time
            )
