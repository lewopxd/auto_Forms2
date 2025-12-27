#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Login Detector - Authentication Verification
============================================
Verifies if user is authenticated in Microsoft Forms using
multiple detection methods with consensus-based validation.

Methods:
1. Cookie-based detection
2. URL redirect detection  
3. DOM inspection
"""

import time
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.common.by import By
from selenium.common.exceptions import WebDriverException


logger = logging.getLogger(__name__)


@dataclass  
class LoginConfig:
    """Configuration for login detection."""
    # Cache TTL
    cache_ttl_ms: int = 300000  # 5 minutes
    
    # Re-login timeout (configurable as requested)
    relogin_timeout_ms: int = 600000  # 10 minutes (made longer as per request)
    
    # Detection timeouts
    redirect_wait_ms: int = 3000
    dom_check_timeout_ms: int = 5000
    
    # Logging
    verbose_logging: bool = True


@dataclass
class LoginResult:
    """Result of login detection."""
    success: bool
    logged_in: Optional[bool] = None
    method: str = ''
    confidence: float = 0.0
    redirect_url: Optional[str] = None
    error: Optional[str] = None
    methods_used: List[str] = field(default_factory=list)


class LoginDetectorCache:
    """Cache for login detection results with TTL."""
    
    def __init__(self, ttl_ms: int = 300000):
        self.ttl_ms = ttl_ms
        self._cache: Optional[LoginResult] = None
        self._timestamp: Optional[float] = None
    
    def get(self) -> Optional[LoginResult]:
        """Get cached result if valid."""
        if self._cache is None or self._timestamp is None:
            return None
        
        elapsed = time.time() * 1000 - self._timestamp
        if elapsed > self.ttl_ms:
            self._cache = None
            return None
        
        return self._cache
    
    def set(self, result: LoginResult):
        """Cache a result."""
        self._cache = result
        self._timestamp = time.time() * 1000
    
    def invalidate(self):
        """Invalidate the cache."""
        self._cache = None
        self._timestamp = None


class LoginDetector:
    """
    Multi-method login detector for Microsoft accounts.
    
    Uses three independent verification methods and combines
    results through a consensus algorithm.
    
    Features:
    - Cookie-based detection (fast)
    - URL redirect detection (reliable)
    - DOM inspection (fallback)
    - Caching with configurable TTL
    - Confidence scoring
    """
    
    def __init__(self, driver: WebDriver, config: LoginConfig = None):
        self.driver = driver
        self.config = config or LoginConfig()
        self._cache = LoginDetectorCache(self.config.cache_ttl_ms)
    
    def _log(self, message: str, level: str = 'info'):
        """Log with prefix."""
        if not self.config.verbose_logging:
            return
        
        prefix = "[LoginDetector]"
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
    
    def check_login_by_cookies(self) -> LoginResult:
        """
        Method 1: Check for Microsoft auth cookies.
        
        Looks for known authentication cookies that indicate
        an active Microsoft session.
        """
        self._log("Method 1: Checking cookies...")
        
        try:
            # Microsoft authentication cookies
            required_cookies = [
                'ESTSAUTH',
                'ESTSAUTHPERSISTENT', 
                'SignInStateCookie',
                'MicrosoftApplicationsTelemetryDeviceId'
            ]
            
            cookies = self.driver.get_cookies()
            cookie_names = {c['name'] for c in cookies}
            
            found_count = 0
            for cookie_name in required_cookies:
                if cookie_name in cookie_names:
                    found_count += 1
                    self._log(f"  ✓ Cookie found: {cookie_name}", 'debug')
            
            # Consider logged in if at least 2 of 4 cookies present
            threshold = 2
            
            if found_count >= threshold:
                confidence = found_count / len(required_cookies)
                self._log(f"✓ Method 1: Logged in (cookies: {found_count}/{len(required_cookies)})")
                return LoginResult(
                    success=True,
                    logged_in=True,
                    method='cookies',
                    confidence=min(0.80, confidence)
                )
            else:
                self._log(f"✗ Method 1: Insufficient cookies ({found_count}/{threshold})")
                return LoginResult(
                    success=True,
                    logged_in=False,
                    method='cookies',
                    confidence=0.80
                )
        
        except Exception as e:
            self._log(f"✗ Method 1 error: {e}", 'error')
            return LoginResult(
                success=False,
                method='cookies',
                error=str(e)
            )
    
    def check_login_by_redirect(self) -> LoginResult:
        """
        Method 2: Check by navigating to auth-required page.
        
        If redirected to login page, user is not authenticated.
        This is the most reliable method.
        """
        self._log("Method 2: Checking redirect...")
        
        try:
            # Save current URL to return later
            original_url = self.driver.current_url
            
            # Navigate to Forms home (requires auth)
            test_url = "https://forms.office.com/"
            self.driver.get(test_url)
            
            # Wait for redirect
            time.sleep(self.config.redirect_wait_ms / 1000)
            
            current_url = self.driver.current_url
            
            # Check if redirected to login pages
            login_indicators = [
                'login.microsoftonline.com',
                'login.live.com',
                'login.microsoft.com'
            ]
            
            for indicator in login_indicators:
                if indicator in current_url:
                    self._log(f"✗ Method 2: Redirected to login ({indicator})")
                    return LoginResult(
                        success=True,
                        logged_in=False,
                        method='redirect',
                        confidence=0.95,
                        redirect_url=current_url
                    )
            
            # Check if still on forms.office.com
            if 'forms.office.com' in current_url or 'forms.microsoft.com' in current_url:
                self._log("✓ Method 2: No redirect, user logged in")
                return LoginResult(
                    success=True,
                    logged_in=True,
                    method='redirect',
                    confidence=0.90
                )
            
            # Unexpected URL
            self._log(f"⚠️ Method 2: Unexpected URL - {current_url}", 'warning')
            return LoginResult(
                success=True,
                logged_in=None,
                method='redirect',
                confidence=0.0
            )
        
        except Exception as e:
            self._log(f"✗ Method 2 error: {e}", 'error')
            return LoginResult(
                success=False,
                method='redirect',
                error=str(e)
            )
    
    def check_login_by_dom(self) -> LoginResult:
        """
        Method 3: Inspect DOM for logged-in/logged-out elements.
        
        Looks for profile elements (logged in) or sign-in buttons
        (logged out) in the page.
        """
        self._log("Method 3: Inspecting DOM...")
        
        try:
            # Selectors indicating user IS logged in
            logged_in_selectors = [
                "[data-automation-id='userProfileButton']",
                ".ms-Persona",
                "[aria-label*='profile']",
                ".account-button",
                "[data-automation-id='accountSwitcher']",
                ".o365cs-me-tile",
                "[data-automation-id='meControl']"
            ]
            
            # Selectors indicating user is NOT logged in
            not_logged_in_selectors = [
                "[data-automation-id='signInButton']",
                "a[href*='login.microsoftonline.com']",
                ".sign-in-button",
                "[data-automation-id='login']"
            ]
            
            logged_in_points = 0
            not_logged_in_points = 0
            
            # Check logged-in selectors
            for selector in logged_in_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        if elem.is_displayed():
                            logged_in_points += 1
                            self._log(f"  ✓ Logged-in element found: {selector}", 'debug')
                            break
                except:
                    continue
            
            # Check not-logged-in selectors
            for selector in not_logged_in_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        if elem.is_displayed():
                            not_logged_in_points += 1
                            self._log(f"  ✓ Not-logged-in element found: {selector}", 'debug')
                            break
                except:
                    continue
            
            # Determine result
            if logged_in_points > not_logged_in_points:
                confidence = logged_in_points / len(logged_in_selectors)
                self._log(f"✓ Method 3: User logged in (points: {logged_in_points} vs {not_logged_in_points})")
                return LoginResult(
                    success=True,
                    logged_in=True,
                    method='dom',
                    confidence=min(0.70, confidence)
                )
            elif not_logged_in_points > logged_in_points:
                confidence = not_logged_in_points / len(not_logged_in_selectors)
                self._log(f"✗ Method 3: User NOT logged in (points: {not_logged_in_points} vs {logged_in_points})")
                return LoginResult(
                    success=True,
                    logged_in=False,
                    method='dom',
                    confidence=min(0.70, confidence)
                )
            else:
                self._log("⚠️ Method 3: Indeterminate", 'warning')
                return LoginResult(
                    success=True,
                    logged_in=None,
                    method='dom',
                    confidence=0.0
                )
        
        except Exception as e:
            self._log(f"✗ Method 3 error: {e}", 'error')
            return LoginResult(
                success=False,
                method='dom',
                error=str(e)
            )
    
    def _calculate_consensus(self, results: List[LoginResult]) -> LoginResult:
        """Calculate consensus from multiple detection results."""
        if not results:
            return LoginResult(
                success=False,
                logged_in=False,
                confidence=0.0,
                error='no_methods_succeeded'
            )
        
        votes_logged_in = 0.0
        votes_not_logged_in = 0.0
        total_confidence = 0.0
        methods_used = []
        
        for result in results:
            if not result.success:
                continue
            
            methods_used.append(result.method)
            
            if result.logged_in is True:
                votes_logged_in += result.confidence
            elif result.logged_in is False:
                votes_not_logged_in += result.confidence
            
            total_confidence += result.confidence
        
        if total_confidence == 0:
            return LoginResult(
                success=True,
                logged_in=False,
                confidence=0.0,
                methods_used=methods_used
            )
        
        if votes_logged_in > votes_not_logged_in:
            return LoginResult(
                success=True,
                logged_in=True,
                confidence=votes_logged_in / total_confidence,
                methods_used=methods_used
            )
        else:
            return LoginResult(
                success=True,
                logged_in=False,
                confidence=votes_not_logged_in / total_confidence,
                methods_used=methods_used
            )
    
    def verify(self, use_cache: bool = True, skip_redirect: bool = False) -> LoginResult:
        """
        Verify login status using multiple methods.
        
        Args:
            use_cache: Whether to use cached result if available
            skip_redirect: Skip redirect method (if already on forms page)
        
        Returns:
            LoginResult with consensus verdict
        """
        self._log("========== VERIFYING LOGIN ==========")
        
        # Check cache first
        if use_cache:
            cached = self._cache.get()
            if cached:
                self._log("Using cached result")
                return cached
        
        results: List[LoginResult] = []
        
        # Method 1: Cookies (fast, always run first)
        result1 = self.check_login_by_cookies()
        if result1.success:
            results.append(result1)
        
        # Method 2: Redirect (reliable, but slow)
        if not skip_redirect:
            result2 = self.check_login_by_redirect()
            if result2.success:
                results.append(result2)
                
                # If high confidence, can stop early
                if result2.confidence >= 0.90 and result2.logged_in is not None:
                    self._log("High confidence from redirect, skipping DOM check")
                    final = self._calculate_consensus(results)
                    self._cache.set(final)
                    self._log(f"========== RESULT: logged_in={final.logged_in}, confidence={final.confidence:.2f} ==========")
                    return final
        
        # Method 3: DOM (fallback)
        result3 = self.check_login_by_dom()
        if result3.success:
            results.append(result3)
        
        # Calculate consensus
        final = self._calculate_consensus(results)
        
        # Cache result
        self._cache.set(final)
        
        self._log(f"========== RESULT: logged_in={final.logged_in}, confidence={final.confidence:.2f} ==========")
        
        return final
    
    def invalidate_cache(self):
        """Force cache invalidation."""
        self._cache.invalidate()
    
    def quick_check(self) -> bool:
        """
        Quick check using only cookies (fastest method).
        
        Returns:
            True if likely logged in, False otherwise
        """
        result = self.check_login_by_cookies()
        return result.logged_in is True
