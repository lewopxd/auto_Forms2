#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
PostSubmit Executor - Main Orchestrator
============================================
Orchestrates the post-submit flow: clicking save, navigating to
the forms list, finding the latest response, and capturing its edit URL.

Integrates TabManager, URLCapturer, and AutomationResultStorage.
"""

import time
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException
)

from .tab_manager import TabManager, TabConfig
from .url_capturer import URLCapturer, URLCaptureConfig, CaptureResult
from .login_detector import LoginDetector, LoginConfig


logger = logging.getLogger(__name__)


@dataclass
class PostSubmitConfig:
    """Configuration for post-submit operations."""
    # Enable/disable
    enabled: bool = False
    
    # Timeouts (in milliseconds)
    save_button_timeout_ms: int = 10000
    navigation_timeout_ms: int = 15000
    forms_list_load_timeout_ms: int = 10000
    url_capture_timeout_ms: int = 60000
    
    # Re-login timeout (configurable as requested)
    relogin_timeout_ms: int = 600000  # 10 minutes
    
    # Selectors for Save Response button (after form submit)
    save_button_selectors: list = field(default_factory=lambda: [
        "[data-automation-id='saveAndEditButton']",  # MS Forms 'Guardar mi respuesta'
        "[data-automation-id='saveEditButton']",
        "button[aria-label*='Guardar mi respuesta']",
        "button[aria-label*='Save my response']",
        "[aria-label*='editar']",
        "[aria-label*='edit']"
    ])
    
    # Forms list navigation
    forms_list_url: str = "https://forms.office.com/"
    
    # Logging
    verbose_logging: bool = True


@dataclass
class PostSubmitResult:
    """Result of a post-submit operation."""
    success: bool
    url: Optional[str] = None
    strategy: str = ''
    confidence: float = 0.0
    capture_time_ms: float = 0
    state: str = 'pending'  # pending, running, success, failed, timeout
    error: Optional[str] = None
    login_required: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


class PostSubmitExecutor:
    """
    Executes the complete post-submit flow for capturing edit URLs.
    
    Flow:
    1. Click "Save and edit" or equivalent button
    2. Navigate to Forms list page (if needed)
    3. Find the most recently submitted form
    4. Click to open edit page
    5. Capture and validate the URL
    6. Return to original form
    
    Features:
    - Multiple fallback strategies for URL capture
    - Automatic tab management and cleanup
    - Login detection and handling
    - Configurable timeouts
    - Detailed logging
    
    Usage:
        executor = PostSubmitExecutor(driver, config)
        result = executor.execute(row_data)
        if result.success:
            print(f"Edit URL: {result.url}")
    """
    
    def __init__(
        self,
        driver: WebDriver,
        config: PostSubmitConfig = None
    ):
        self.driver = driver
        self.config = config or PostSubmitConfig()
        
        # Initialize sub-components with matching configs
        self._tab_config = TabConfig(
            new_tab_timeout_ms=self.config.url_capture_timeout_ms,
            verbose_logging=self.config.verbose_logging
        )
        
        self._url_config = URLCaptureConfig(
            verbose_logging=self.config.verbose_logging
        )
        
        self._login_config = LoginConfig(
            relogin_timeout_ms=self.config.relogin_timeout_ms,
            verbose_logging=self.config.verbose_logging
        )
        
        self._login_detector = LoginDetector(driver, self._login_config)
    
    def _log(self, message: str, level: str = 'info'):
        """Log with prefix."""
        if not self.config.verbose_logging:
            return
        
        prefix = "[PostSubmit]"
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
    
    def _find_save_button(self) -> Optional[Any]:
        """Find the save/submit response button."""
        for selector in self.config.save_button_selectors:
            try:
                elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elements:
                    if elem.is_displayed() and elem.is_enabled():
                        self._log(f"Save button found: {selector}", 'debug')
                        return elem
            except:
                continue
        return None
    
    def _click_save_response(self) -> bool:
        """
        Click the save response button.
        
        Returns:
            True if button was clicked successfully
        """
        self._log("Looking for Save Response button...")
        
        try:
            # Wait for button to be present
            wait = WebDriverWait(self.driver, self.config.save_button_timeout_ms / 1000)
            
            button = self._find_save_button()
            
            if not button:
                self._log("✗ Save button not found", 'warning')
                return False
            
            # Click the button
            try:
                button.click()
                self._log("✓ Save button clicked")
                return True
            except ElementClickInterceptedException:
                # Try JavaScript click
                self.driver.execute_script("arguments[0].click();", button)
                self._log("✓ Save button clicked (JS)")
                return True
        
        except TimeoutException:
            self._log("✗ Timeout waiting for save button", 'error')
            return False
        except Exception as e:
            self._log(f"✗ Error clicking save: {e}", 'error')
            return False
    
    def _navigate_to_forms_list(self) -> bool:
        """
        Navigate to the Forms list page.
        
        Returns:
            True if navigation was successful
        """
        self._log(f"Navigating to Forms list: {self.config.forms_list_url}")
        
        try:
            self.driver.get(self.config.forms_list_url)
            
            # Wait for page to load
            wait = WebDriverWait(self.driver, self.config.forms_list_load_timeout_ms / 1000)
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            
            # Additional wait for dynamic content
            time.sleep(2)
            
            # Check if we're on the forms page
            current_url = self.driver.current_url
            if 'forms.office.com' in current_url or 'forms.microsoft.com' in current_url:
                self._log("✓ Forms list page loaded")
                return True
            
            # Check if redirected to login
            if 'login.microsoftonline.com' in current_url:
                self._log("⚠️ Redirected to login page", 'warning')
                return False
            
            self._log(f"⚠️ Unexpected URL: {current_url}", 'warning')
            return True  # Proceed anyway
        
        except TimeoutException:
            self._log("✗ Timeout loading Forms list", 'error')
            return False
        except Exception as e:
            self._log(f"✗ Navigation error: {e}", 'error')
            return False
    
    def _check_login_status(self) -> bool:
        """
        Check if user is logged in.
        
        Returns:
            True if logged in, False otherwise
        """
        result = self._login_detector.verify(skip_redirect=True)
        return result.logged_in is True
    
    def execute(
        self,
        skip_save_click: bool = False,
        skip_login_check: bool = False,
        return_to_url: str = None
    ) -> PostSubmitResult:
        """
        Execute the complete post-submit flow.
        
        Args:
            skip_save_click: Skip clicking save button (if already on thank you page)
            skip_login_check: Skip login verification (if coming from successful submit)
            return_to_url: URL to return to after capturing
        
        Returns:
            PostSubmitResult with captured URL or error
        """
        if not self.config.enabled:
            return PostSubmitResult(
                success=False,
                state='disabled',
                error='PostSubmit is disabled'
            )
        
        self._log("========== STARTING POST-SUBMIT FLOW ==========")
        
        start_time = time.time() * 1000
        original_url = self.driver.current_url
        original_handles = set(self.driver.window_handles)
        original_handle = self.driver.current_window_handle
        
        result = PostSubmitResult(success=False, state='running')
        
        try:
            # Step 1: Check login status (skip if we just did a successful submit)
            if not skip_login_check:
                self._log("Step 1: Checking login status...")
                if not self._check_login_status():
                    self._log("✗ User not logged in", 'error')
                    return PostSubmitResult(
                        success=False,
                        state='failed',
                        error='not_logged_in',
                        login_required=True,
                        capture_time_ms=time.time() * 1000 - start_time
                    )
                self._log("✓ Login verified")
            else:
                self._log("Step 1: Login check skipped (trusted after successful submit)")
            
            # Step 2: Click save button - this should open a new tab
            self._log("Step 2: Clicking Save Response button...")
            
            # Store current handles BEFORE clicking
            handles_before = set(self.driver.window_handles)
            
            if not skip_save_click:
                if not self._click_save_response():
                    self._log("✗ Save button not found", 'warning')
                    return PostSubmitResult(
                        success=False,
                        state='failed',
                        error='save_button_not_found',
                        capture_time_ms=time.time() * 1000 - start_time
                    )
            
            # Step 3: Wait for and switch to new tab (forms list)
            self._log("Step 3: Waiting for new tab (forms list)...")
            
            new_tab_handle = None
            wait_start = time.time() * 1000
            
            while time.time() * 1000 - wait_start < self.config.navigation_timeout_ms:
                current_handles = set(self.driver.window_handles)
                new_handles = current_handles - handles_before
                
                if new_handles:
                    new_tab_handle = list(new_handles)[0]
                    self._log(f"✓ New tab opened!")
                    break
                
                time.sleep(0.3)
            
            if not new_tab_handle:
                self._log("✗ No new tab detected after clicking save", 'error')
                return PostSubmitResult(
                    success=False,
                    state='failed',
                    error='no_new_tab_after_save',
                    capture_time_ms=time.time() * 1000 - start_time
                )
            
            # Switch to new tab
            self.driver.switch_to.window(new_tab_handle)
            time.sleep(2)  # Wait for page to load
            
            self._log(f"Switched to new tab. URL: {self.driver.current_url[:60]}...")
            
            # Step 4: Handle login if redirected to login page
            current_url = self.driver.current_url
            if any(x in current_url for x in ['login.microsoftonline', 'login.live', 'login.microsoft']):
                self._log("Step 4: Detected login page, handling login...")
                
                # Try auto-login
                login_result = self._login_detector.try_auto_login(timeout_ms=15000)
                
                if not login_result.logged_in:
                    self._log("Auto-login failed, waiting for manual login...")
                    login_result = self._login_detector.wait_for_manual_login(
                        timeout_ms=self.config.relogin_timeout_ms
                    )
                
                if not login_result.logged_in:
                    self._log("✗ Login failed or timed out", 'error')
                    # Close this tab and return
                    try:
                        self.driver.close()
                        self.driver.switch_to.window(original_handle)
                    except:
                        pass
                    
                    return PostSubmitResult(
                        success=False,
                        state='failed',
                        error='login_failed',
                        login_required=True,
                        capture_time_ms=time.time() * 1000 - start_time
                    )
                
                self._log("✓ Login successful")
                time.sleep(2)  # Wait for redirect after login
            else:
                self._log("Step 4: Already on forms list (no login needed)")
            
            # Step 5: Capture URL using URLCapturer
            self._log("Step 5: Capturing edit URL from forms list...")
            
            # Create URLCapturer with login detector
            capturer = URLCapturer(
                self.driver, 
                TabManager(self.driver, self._tab_config),
                self._url_config,
                self._login_detector
            )
            capture_result = capturer.capture()
            
            if capture_result.success:
                result.success = True
                result.url = capture_result.url
                result.strategy = capture_result.strategy_name
                result.confidence = capture_result.confidence
                result.state = 'success'
                result.metadata = capture_result.metadata
                
                self._log(f"✓ URL captured successfully")
                self._log(f"  URL: {result.url}")
                self._log(f"  Confidence: {result.confidence:.0%}")
            else:
                result.success = False
                result.state = 'failed'
                result.error = capture_result.error or 'capture_failed'
                
                self._log(f"✗ URL capture failed: {result.error}", 'error')
            
            # Step 6: Close extra tabs and return to original
            self._log("Step 6: Cleaning up tabs (safely)...")
            
            # ═══════════════════════════════════════════════════════════════
            # ROBUST TAB CLEANUP - NEVER close original, validate everything
            # ═══════════════════════════════════════════════════════════════
            try:
                current_handles = self.driver.window_handles
                self._log(f"Current tabs: {len(current_handles)}")
                
                # ══════════════════════════════════════════════════════════
                # CRITICAL: Verify original tab still exists BEFORE any close
                # ══════════════════════════════════════════════════════════
                if original_handle not in current_handles:
                    self._log("⚠️ CRITICAL: Original tab NOT in current handles!", 'warning')
                    self._log(f"  Original handle: {original_handle[:20]}...")
                    self._log(f"  Current handles: {current_handles}")
                    # Recovery: don't close anything, just return to first available
                    if current_handles:
                        self.driver.switch_to.window(current_handles[0])
                        self._log("✓ Recovered to first available tab")
                else:
                    # Original exists - safe to close others
                    tabs_to_close = [h for h in current_handles if h != original_handle]
                    
                    if tabs_to_close:
                        self._log(f"Will close {len(tabs_to_close)} extra tab(s)")
                        
                        for handle in tabs_to_close:
                            try:
                                # ═══════════════════════════════════════════
                                # DOUBLE CHECK before EVERY close operation
                                # ═══════════════════════════════════════════
                                live_handles = self.driver.window_handles
                                
                                # Safety check 1: Must have at least 2 tabs
                                if len(live_handles) < 2:
                                    self._log("⚠️ Stopping - less than 2 tabs", 'warning')
                                    break
                                
                                # Safety check 2: Original must still exist
                                if original_handle not in live_handles:
                                    self._log("⚠️ Stopping - original tab gone!", 'warning')
                                    break
                                
                                # Safety check 3: Handle to close must exist
                                if handle not in live_handles:
                                    continue  # Already closed
                                
                                # Safe to close
                                self.driver.switch_to.window(handle)
                                time.sleep(0.3)  # Increased delay for stability
                                self.driver.close()
                                self._log(f"✓ Closed tab {handle[:15]}...")
                                time.sleep(0.5)  # Increased delay after close for stability
                                
                            except Exception as e:
                                self._log(f"⚠️ Error closing tab: {e}", 'debug')
                                # Don't break, try next
                    else:
                        self._log("No extra tabs to close")
                    
                    # ═══════════════════════════════════════════════════════
                    # SWITCH BACK to original (must exist at this point)
                    # ═══════════════════════════════════════════════════════
                    remaining_handles = self.driver.window_handles
                    
                    if original_handle in remaining_handles:
                        self.driver.switch_to.window(original_handle)
                        self._log("✓ Returned to original tab")
                    elif remaining_handles:
                        self._log("⚠️ Original tab gone, using first available")
                        self.driver.switch_to.window(remaining_handles[0])
                    else:
                        self._log("✗ CRITICAL: No tabs remaining!", 'error')
                
            except Exception as e:
                self._log(f"⚠️ Error during cleanup: {e}", 'warning')
                # Recovery: switch to any available tab
                try:
                    remaining = self.driver.window_handles
                    if remaining:
                        self.driver.switch_to.window(remaining[0])
                        self._log(f"✓ Recovered to tab: {remaining[0][:15]}...")
                except:
                    pass
            
            # Step 7: Navigate back to form URL and verify
            if return_to_url:
                self._log(f"Step 7: Navigating back to form: {return_to_url[:50]}...")
                try:
                    # Check if current URL is already the form
                    current_url = self.driver.current_url
                    if return_to_url in current_url or current_url in return_to_url:
                        self._log("✓ Already on form URL")
                    else:
                        self.driver.get(return_to_url)
                        time.sleep(3)  # Increased from 2 to 3 seconds
                        
                        # ═══ ESPERA ADICIONAL PARA ESTABILIDAD ═══
                        # Esperar a que la página esté completamente cargada
                        try:
                            WebDriverWait(self.driver, 10).until(
                                lambda d: d.execute_script('return document.readyState') == 'complete'
                            )
                        except:
                            pass
                        
                        # Verify we're on the form
                        final_url = self.driver.current_url
                        if return_to_url in final_url or 'forms.office.com/r/' in final_url:
                            self._log("✓ Successfully returned to form URL")
                        else:
                            self._log(f"⚠️ May not be on form. Current: {final_url[:50]}...", 'warning')
                except Exception as e:
                    self._log(f"⚠️ Error returning to form URL: {e}", 'warning')
            
            result.capture_time_ms = time.time() * 1000 - start_time
            
            self._log("========== POST-SUBMIT COMPLETE ==========")
            self._log(f"Result: {result.state}")
            self._log(f"Time: {result.capture_time_ms:.0f}ms")
            
            return result
        
        except Exception as e:
            self._log(f"✗ Unexpected error: {e}", 'error')
            import traceback
            traceback.print_exc()
            
            # Try to recover by returning to original handle
            try:
                if original_handle in self.driver.window_handles:
                    self.driver.switch_to.window(original_handle)
            except:
                pass
            
            return PostSubmitResult(
                success=False,
                state='failed',
                error=str(e),
                capture_time_ms=time.time() * 1000 - start_time
            )
    
    def execute_after_submit(
        self,
        form_url: str
    ) -> PostSubmitResult:
        """
        Execute post-submit flow immediately after form submission.
        
        This is the main entry point called from FormExecutor after
        a successful form submission.
        
        Args:
            form_url: Original form URL to return to
        
        Returns:
            PostSubmitResult with captured URL
        """
        return self.execute(
            skip_save_click=False,  # MUST click "Guardar mi respuesta" button
            skip_login_check=True,  # We just submitted successfully, user IS logged in
            return_to_url=form_url
        )
