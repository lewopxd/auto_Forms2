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
            
            # Step 2: Click save button (if not skipping)
            if not skip_save_click:
                self._log("Step 2: Clicking Save Response...")
                if not self._click_save_response():
                    self._log("Skipping save click - button not found or already clicked")
            
            # Step 3: Navigate to Forms list
            self._log("Step 3: Navigating to Forms list...")
            if not self._navigate_to_forms_list():
                return PostSubmitResult(
                    success=False,
                    state='failed',
                    error='navigation_failed',
                    capture_time_ms=time.time() * 1000 - start_time
                )
            
            # Step 4: Capture URL using TabManager and URLCapturer
            self._log("Step 4: Capturing edit URL...")
            
            with TabManager(self.driver, self._tab_config) as tab_mgr:
                capturer = URLCapturer(self.driver, tab_mgr, self._url_config)
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
                    self._log(f"  Strategy: {result.strategy}")
                    self._log(f"  Confidence: {result.confidence:.0%}")
                else:
                    result.success = False
                    result.state = 'failed'
                    result.error = capture_result.error or 'capture_failed'
                    
                    self._log(f"✗ URL capture failed: {result.error}", 'error')
            
            # Step 5: Return to original page (if specified)
            if return_to_url:
                self._log(f"Step 5: Returning to {return_to_url}")
                try:
                    self.driver.get(return_to_url)
                    time.sleep(1)
                except Exception as e:
                    self._log(f"⚠️ Error returning to original URL: {e}", 'warning')
            
            result.capture_time_ms = time.time() * 1000 - start_time
            
            self._log("========== POST-SUBMIT COMPLETE ==========")
            self._log(f"Result: {result.state}")
            self._log(f"Time: {result.capture_time_ms:.0f}ms")
            
            return result
        
        except Exception as e:
            self._log(f"✗ Unexpected error: {e}", 'error')
            
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
