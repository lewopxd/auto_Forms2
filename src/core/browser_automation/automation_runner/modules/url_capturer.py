#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
URL Capturer - Edit Link Extractor
============================================
Captures the edit link for submitted MS Forms responses using
multiple fallback strategies with configurable selectors.

Strategy Pattern with 5 levels of fallback:
1. TabIndex (fastest, 95% confidence)
2. Timestamp (90% confidence)
3. ARIA Label (85% confidence)
4. Position-based (70% confidence)
5. Bruteforce (60% confidence)
"""

import time
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field
from urllib.parse import urlparse, parse_qs

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
    ElementClickInterceptedException,
    StaleElementReferenceException
)

from .tab_manager import TabManager, TabResult


logger = logging.getLogger(__name__)


@dataclass
class URLCaptureConfig:
    """Configuration for URL capture strategies."""
    # Strategy selectors (can be updated without code changes)
    tabindex_selectors: List[str] = field(default_factory=lambda: [
        ".ms-FocusZone.item__container[data-focuszone-id][tabindex='0']",
        "[data-focuszone-id][tabindex='0']",
        ".item__container[tabindex='0']"
    ])
    
    aria_label_patterns: List[str] = field(default_factory=lambda: [
        "filled form",
        "your filled form",
        "submitted.*ago",
        "last submitted",
        "recent response"
    ])
    
    list_container_selectors: List[str] = field(default_factory=lambda: [
        ".items-list",
        "[data-automation-id='itemsList']",
        "[data-automation-id='recentResponses']"
    ])
    
    item_selectors: List[str] = field(default_factory=lambda: [
        "[role='button']",
        ".item-element",
        "[data-automation-id*='item']"
    ])
    
    # Valid URL domains
    valid_domains: List[str] = field(default_factory=lambda: [
        "forms.office.com",
        "forms.office365.com",
        "forms.microsoft.com"
    ])
    
    # Required URL paths
    required_paths: List[str] = field(default_factory=lambda: [
        "responsepage",
        "/Pages/"
    ])
    
    # Timeouts
    click_wait_ms: int = 10000
    page_load_wait_ms: int = 5000
    
    # Logging
    verbose_logging: bool = True


@dataclass
class CaptureResult:
    """Result of a URL capture attempt."""
    success: bool
    url: Optional[str] = None
    strategy: int = 0
    strategy_name: str = ''
    confidence: float = 0.0
    capture_time_ms: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    element_index: Optional[int] = None
    attempted_strategies: int = 0


class URLCapturer:
    """
    Captures edit URLs from MS Forms using multiple fallback strategies.
    
    Designed to be easily updatable when MS Forms changes its DOM structure
    by modifying the config without touching the core logic.
    
    Usage:
        capturer = URLCapturer(driver, tab_mgr)
        result = capturer.capture()
        if result.success:
            print(f"Captured URL: {result.url}")
    """
    
    def __init__(
        self,
        driver: WebDriver,
        tab_manager: TabManager,
        config: URLCaptureConfig = None,
        config_file: str = None
    ):
        self.driver = driver
        self.tab_manager = tab_manager
        self.config = config or URLCaptureConfig()
        
        # Load config from file if provided
        if config_file and os.path.exists(config_file):
            self._load_config_from_file(config_file)
    
    def _load_config_from_file(self, path: str):
        """Load configuration from JSON file."""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            strategies = data.get('strategies', {})
            if 'tabindex' in strategies:
                self.config.tabindex_selectors = strategies['tabindex'].get('selectors', self.config.tabindex_selectors)
            if 'aria_label' in strategies:
                self.config.aria_label_patterns = strategies['aria_label'].get('patterns', self.config.aria_label_patterns)
            
            validation = data.get('validation', {})
            if 'domains' in validation:
                self.config.valid_domains = validation['domains']
            if 'requiredPaths' in validation:
                self.config.required_paths = validation['requiredPaths']
            
            self._log("Config loaded from file")
        except Exception as e:
            self._log(f"Error loading config file: {e}", 'warning')
    
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
    
    def validate_url(self, url: str) -> bool:
        """
        Validate that a URL is a valid MS Forms edit link.
        
        Checks:
        - HTTPS protocol
        - Valid MS Forms domain
        - Contains response page path
        - Has ID parameter
        """
        if not url:
            return False
        
        # Must be HTTPS
        if not url.startswith('https://'):
            self._log(f"Invalid URL (not HTTPS): {url}", 'debug')
            return False
        
        # Check domain
        domain_valid = any(domain in url for domain in self.config.valid_domains)
        if not domain_valid:
            self._log(f"Invalid URL (wrong domain): {url}", 'debug')
            return False
        
        # Check for required paths (warn if missing but don't fail)
        path_found = any(path in url for path in self.config.required_paths)
        if not path_found:
            self._log(f"⚠️ URL missing expected path: {url}", 'warning')
        
        # Check for ID parameter
        if '?id=' not in url.lower() and '&id=' not in url.lower():
            self._log(f"⚠️ URL missing id parameter: {url}", 'warning')
            # Still accept the URL - some forms use different parameters
        
        return True
    
    def _extract_metadata(self, url: str) -> Dict[str, Any]:
        """Extract metadata from captured URL."""
        metadata = {}
        
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            
            # Extract form ID
            if 'id' in params:
                metadata['formId'] = params['id'][0]
            
            # Store all parameters
            metadata['queryParams'] = {k: v[0] if len(v) == 1 else v for k, v in params.items()}
            
            # Get page title
            try:
                metadata['pageTitle'] = self.driver.title
            except:
                pass
            
            # Capture timestamp
            from datetime import datetime
            metadata['capturedAt'] = datetime.now().isoformat()
            
        except Exception as e:
            self._log(f"Error extracting metadata: {e}", 'warning')
        
        return metadata
    
    def _click_and_capture(
        self,
        element: WebElement,
        timeout_ms: int = None
    ) -> CaptureResult:
        """
        Click an element and capture the URL from the new tab.
        
        Returns:
            CaptureResult with the captured URL or error
        """
        timeout = timeout_ms or self.config.click_wait_ms
        
        try:
            # Record handles before click
            original_handles = self.tab_manager.get_current_handles()
            
            # Click the element
            element.click()
            
            # Wait for new tab
            tab_result = self.tab_manager.wait_for_new_tab(
                original_handles,
                timeout_ms=timeout
            )
            
            if not tab_result.success:
                return CaptureResult(
                    success=False,
                    error='click_no_new_tab'
                )
            
            # Switch to new tab
            switch_result = self.tab_manager.switch_to_tab(tab_result.handle)
            
            if not switch_result.success:
                return CaptureResult(
                    success=False,
                    error='switch_failed'
                )
            
            # Wait for page load
            time.sleep(self.config.page_load_wait_ms / 1000)
            
            # Get URL
            url = self.tab_manager.get_page_url()
            
            # Validate URL
            if self.validate_url(url):
                metadata = self._extract_metadata(url)
                return CaptureResult(
                    success=True,
                    url=url,
                    metadata=metadata
                )
            else:
                return CaptureResult(
                    success=False,
                    url=url,
                    error='invalid_url'
                )
        
        except ElementClickInterceptedException:
            return CaptureResult(
                success=False,
                error='click_intercepted'
            )
        except StaleElementReferenceException:
            return CaptureResult(
                success=False,
                error='element_stale'
            )
        except Exception as e:
            return CaptureResult(
                success=False,
                error=str(e)
            )
    
    def _strategy_tabindex(self) -> CaptureResult:
        """
        Strategy 1: Find element with tabindex=0 (most recent item).
        Fastest and most reliable when available.
        """
        self._log("Strategy 1: TabIndex=0")
        
        try:
            for selector in self.config.tabindex_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    
                    if not elements:
                        continue
                    
                    if len(elements) > 1:
                        self._log(f"  Multiple elements with {selector}, using first")
                    
                    element = elements[0]
                    
                    # Verify aria-label if available
                    aria_label = element.get_attribute('aria-label') or ''
                    if aria_label:
                        self._log(f"  aria-label: {aria_label}", 'debug')
                    
                    # Click and capture
                    result = self._click_and_capture(element)
                    
                    if result.success:
                        self._log(f"✓ Strategy 1: URL captured")
                        result.strategy = 1
                        result.strategy_name = 'tabindex'
                        result.confidence = 0.95
                        return result
                    
                except Exception as e:
                    self._log(f"  Selector {selector} failed: {e}", 'debug')
                    continue
            
            self._log("✗ Strategy 1: No element found")
            return CaptureResult(success=False, strategy=1, strategy_name='tabindex')
        
        except Exception as e:
            self._log(f"✗ Strategy 1 error: {e}", 'error')
            return CaptureResult(success=False, strategy=1, error=str(e))
    
    def _strategy_aria_label(self) -> CaptureResult:
        """
        Strategy 2: Find element by ARIA label patterns.
        Fallback that looks for labeled form responses.
        """
        self._log("Strategy 2: ARIA Label patterns")
        
        try:
            for pattern in self.config.aria_label_patterns:
                try:
                    # Build XPath for pattern
                    xpath = f"//div[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{pattern.lower()}')]"
                    elements = self.driver.find_elements(By.XPATH, xpath)
                    
                    if not elements:
                        continue
                    
                    self._log(f"  Found {len(elements)} elements matching '{pattern}'", 'debug')
                    
                    # Try clicking the first visible one
                    for elem in elements:
                        if elem.is_displayed():
                            result = self._click_and_capture(elem)
                            
                            if result.success:
                                self._log(f"✓ Strategy 2: URL captured (pattern: {pattern})")
                                result.strategy = 2
                                result.strategy_name = 'aria_label'
                                result.confidence = 0.85
                                return result
                            break
                
                except Exception as e:
                    self._log(f"  Pattern {pattern} failed: {e}", 'debug')
                    continue
            
            self._log("✗ Strategy 2: No matching element")
            return CaptureResult(success=False, strategy=2, strategy_name='aria_label')
        
        except Exception as e:
            self._log(f"✗ Strategy 2 error: {e}", 'error')
            return CaptureResult(success=False, strategy=2, error=str(e))
    
    def _strategy_position(self) -> CaptureResult:
        """
        Strategy 3: Get first item from the list container.
        Assumes most recent item is first in the list.
        """
        self._log("Strategy 3: Position-based (first item)")
        
        try:
            # Find list container
            container = None
            for selector in self.config.list_container_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    if elements:
                        container = elements[0]
                        self._log(f"  Found list container: {selector}", 'debug')
                        break
                except:
                    continue
            
            if not container:
                self._log("✗ Strategy 3: List container not found")
                return CaptureResult(success=False, strategy=3, strategy_name='position')
            
            # Find items in container
            items = []
            for selector in self.config.item_selectors:
                try:
                    found = container.find_elements(By.CSS_SELECTOR, selector)
                    items.extend(found)
                except:
                    continue
            
            if not items:
                self._log("✗ Strategy 3: No items in container")
                return CaptureResult(success=False, strategy=3, strategy_name='position')
            
            # Remove duplicates while preserving order
            seen = set()
            unique_items = []
            for item in items:
                item_id = item.id
                if item_id not in seen:
                    seen.add(item_id)
                    unique_items.append(item)
            
            # Try first item
            if unique_items:
                result = self._click_and_capture(unique_items[0])
                
                if result.success:
                    self._log("✓ Strategy 3: URL captured (first item)")
                    result.strategy = 3
                    result.strategy_name = 'position'
                    result.confidence = 0.70
                    return result
            
            self._log("✗ Strategy 3: First item click failed")
            return CaptureResult(success=False, strategy=3, strategy_name='position')
        
        except Exception as e:
            self._log(f"✗ Strategy 3 error: {e}", 'error')
            return CaptureResult(success=False, strategy=3, error=str(e))
    
    def _strategy_timestamp(self) -> CaptureResult:
        """
        Strategy 4: Find element with most recent timestamp.
        Parses visible timestamps to find newest entry.
        """
        self._log("Strategy 4: Timestamp analysis")
        
        try:
            # Look for timestamp elements
            timestamp_selectors = [
                "[class*='timestamp']",
                "[data-automation-id*='time']",
                ".item-time",
                ".response-time"
            ]
            
            items_with_time = []
            
            for selector in timestamp_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    
                    for elem in elements:
                        text = elem.text.strip()
                        if text:
                            # Try to find parent clickable element
                            parent = elem
                            for _ in range(5):  # Max 5 levels up
                                parent = parent.find_element(By.XPATH, '..')
                                if parent.get_attribute('role') == 'button' or \
                                   parent.get_attribute('tabindex'):
                                    items_with_time.append({
                                        'element': parent,
                                        'time_text': text
                                    })
                                    break
                except:
                    continue
            
            if not items_with_time:
                self._log("✗ Strategy 4: No timestamped items found")
                return CaptureResult(success=False, strategy=4, strategy_name='timestamp')
            
            # Sort by "freshness" heuristic (items with "just now", "seconds ago", etc. first)
            freshness_keywords = ['just now', 'second', 'minute ago', 'minutes ago', 'hace']
            
            def freshness_score(item):
                text = item['time_text'].lower()
                for i, keyword in enumerate(freshness_keywords):
                    if keyword in text:
                        return i
                return 999
            
            items_with_time.sort(key=freshness_score)
            
            # Try the freshest item
            if items_with_time:
                result = self._click_and_capture(items_with_time[0]['element'])
                
                if result.success:
                    self._log("✓ Strategy 4: URL captured (by timestamp)")
                    result.strategy = 4
                    result.strategy_name = 'timestamp'
                    result.confidence = 0.90
                    return result
            
            self._log("✗ Strategy 4: Timestamp item click failed")
            return CaptureResult(success=False, strategy=4, strategy_name='timestamp')
        
        except Exception as e:
            self._log(f"✗ Strategy 4 error: {e}", 'error')
            return CaptureResult(success=False, strategy=4, error=str(e))
    
    def _strategy_bruteforce(self) -> CaptureResult:
        """
        Strategy 5: Try all clickable elements until one works.
        Last resort strategy with lower confidence.
        """
        self._log("Strategy 5: Bruteforce (all clickable elements)")
        
        try:
            all_selectors = [
                "[role='button']",
                "[tabindex]",
                "a[href]",
                ".item-element",
                "[data-automation-id*='item']"
            ]
            
            all_elements = []
            seen_ids = set()
            
            for selector in all_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        elem_id = elem.id
                        if elem_id not in seen_ids:
                            seen_ids.add(elem_id)
                            all_elements.append(elem)
                except:
                    continue
            
            self._log(f"  Found {len(all_elements)} clickable elements", 'debug')
            
            # Limit to first 20 to avoid excessive attempts
            max_attempts = min(20, len(all_elements))
            
            for i, elem in enumerate(all_elements[:max_attempts]):
                self._log(f"  Trying element {i+1}/{max_attempts}...", 'debug')
                
                try:
                    if not elem.is_displayed():
                        continue
                    
                    result = self._click_and_capture(elem, timeout_ms=5000)
                    
                    if result.success:
                        self._log(f"✓ Strategy 5: URL found at element {i+1}")
                        result.strategy = 5
                        result.strategy_name = 'bruteforce'
                        result.confidence = 0.60
                        result.element_index = i
                        return result
                except:
                    continue
            
            self._log("✗ Strategy 5: No element produced valid URL")
            return CaptureResult(success=False, strategy=5, strategy_name='bruteforce')
        
        except Exception as e:
            self._log(f"✗ Strategy 5 error: {e}", 'error')
            return CaptureResult(success=False, strategy=5, error=str(e))
    
    def capture(self) -> CaptureResult:
        """
        Execute all strategies in order until one succeeds.
        
        Returns:
            CaptureResult with captured URL or error details
        """
        self._log("========== STARTING URL CAPTURE ==========")
        
        start_time = time.time() * 1000
        
        strategies: List[Callable[[], CaptureResult]] = [
            self._strategy_tabindex,     # 95% confidence
            self._strategy_timestamp,    # 90% confidence
            self._strategy_aria_label,   # 85% confidence
            self._strategy_position,     # 70% confidence
            self._strategy_bruteforce    # 60% confidence
        ]
        
        for i, strategy in enumerate(strategies, 1):
            result = strategy()
            
            if result.success:
                result.capture_time_ms = time.time() * 1000 - start_time
                result.attempted_strategies = i
                
                self._log(f"========== CAPTURE SUCCESS ==========")
                self._log(f"Strategy: {result.strategy_name} (#{result.strategy})")
                self._log(f"Confidence: {result.confidence:.0%}")
                self._log(f"Time: {result.capture_time_ms:.0f}ms")
                
                return result
            
            self._log(f"Strategy '{result.strategy_name}' failed, trying next...")
        
        # All strategies failed
        elapsed = time.time() * 1000 - start_time
        
        self._log("========== ALL STRATEGIES FAILED ==========", 'error')
        
        return CaptureResult(
            success=False,
            capture_time_ms=elapsed,
            error='all_strategies_failed',
            attempted_strategies=len(strategies)
        )
