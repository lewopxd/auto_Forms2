"""
Human-like interaction simulation module.
Provides realistic timing, mouse movements, and typing patterns.
"""
import random
import time
import math
from typing import Optional, Tuple, List

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.action_chains import ActionChains

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import WAIT_TIMES, MOUSE_MOVEMENT
from utils.logger import Logger


class HumanInteraction:
    """
    Simulates human-like interactions with web elements.
    Uses Bezier curves for mouse movement and variable timing for actions.
    """
    
    def __init__(self, driver: WebDriver, logger: Optional[Logger] = None):
        """
        Initialize the human interaction module.
        
        Args:
            driver: Selenium WebDriver instance
            logger: Optional logger instance
        """
        self.driver = driver
        self.logger = logger or Logger("HumanInteraction")
        self.action_chains = ActionChains(driver)
    
    @staticmethod
    def gaussian_random(mean: float, std_dev: float, min_val: float = None, max_val: float = None) -> float:
        """
        Generate a random number with Gaussian distribution.
        More realistic than uniform random for human behavior.
        
        Args:
            mean: Mean value
            std_dev: Standard deviation
            min_val: Optional minimum value
            max_val: Optional maximum value
            
        Returns:
            Random value with Gaussian distribution
        """
        value = random.gauss(mean, std_dev)
        
        if min_val is not None:
            value = max(value, min_val)
        if max_val is not None:
            value = min(value, max_val)
            
        return value
    
    def random_delay(self, min_ms: int = None, max_ms: int = None):
        """
        Wait for a random duration (simulates human hesitation).
        
        Args:
            min_ms: Minimum delay in milliseconds
            max_ms: Maximum delay in milliseconds
        """
        min_ms = min_ms or WAIT_TIMES["min_action_delay"]
        max_ms = max_ms or WAIT_TIMES["max_action_delay"]
        
        # Use Gaussian distribution centered between min and max
        mean = (min_ms + max_ms) / 2
        std_dev = (max_ms - min_ms) / 4  # 95% within range
        
        delay_ms = self.gaussian_random(mean, std_dev, min_ms, max_ms)
        delay_sec = delay_ms / 1000.0
        
        self.logger.debug(f"Random delay: {delay_ms:.0f}ms")
        time.sleep(delay_sec)
    
    def _bezier_curve(self, start: Tuple[float, float], end: Tuple[float, float], 
                      num_points: int = None) -> List[Tuple[int, int]]:
        """
        Generate points along a Bezier curve for natural mouse movement.
        Uses a cubic Bezier curve with random control points.
        
        Args:
            start: Starting coordinates (x, y)
            end: Ending coordinates (x, y)
            num_points: Number of points in the curve
            
        Returns:
            List of (x, y) coordinates along the curve
        """
        num_points = num_points or MOUSE_MOVEMENT["bezier_points"]
        
        # Calculate random control points for natural curve
        x_diff = end[0] - start[0]
        y_diff = end[1] - start[1]
        
        # Random control points offset
        ctrl1 = (
            start[0] + x_diff * random.uniform(0.2, 0.4) + random.uniform(-50, 50),
            start[1] + y_diff * random.uniform(0.2, 0.4) + random.uniform(-50, 50)
        )
        ctrl2 = (
            start[0] + x_diff * random.uniform(0.6, 0.8) + random.uniform(-50, 50),
            start[1] + y_diff * random.uniform(0.6, 0.8) + random.uniform(-50, 50)
        )
        
        points = []
        for i in range(num_points + 1):
            t = i / num_points
            
            # Cubic Bezier formula
            x = (
                (1 - t) ** 3 * start[0] +
                3 * (1 - t) ** 2 * t * ctrl1[0] +
                3 * (1 - t) * t ** 2 * ctrl2[0] +
                t ** 3 * end[0]
            )
            y = (
                (1 - t) ** 3 * start[1] +
                3 * (1 - t) ** 2 * t * ctrl1[1] +
                3 * (1 - t) * t ** 2 * ctrl2[1] +
                t ** 3 * end[1]
            )
            
            points.append((int(x), int(y)))
        
        return points
    
    def get_element_center(self, element: WebElement) -> Tuple[int, int]:
        """
        Get the center coordinates of an element with slight randomization.
        
        Args:
            element: WebElement to get center of
            
        Returns:
            (x, y) coordinates near the element center
        """
        location = element.location
        size = element.size
        
        # Center with small random offset
        offset = MOUSE_MOVEMENT.get("randomize_endpoint", 5)
        x = location['x'] + size['width'] / 2 + random.randint(-offset, offset)
        y = location['y'] + size['height'] / 2 + random.randint(-offset, offset)
        
        return (int(x), int(y))
    
    def human_mouse_move(self, element: WebElement):
        """
        Move mouse to element using a natural Bezier curve path.
        
        Args:
            element: Target WebElement
        """
        try:
            # Get current mouse position (approximation)
            # Note: Selenium doesn't track actual mouse position, so we estimate
            current_pos = (
                random.randint(100, 500),
                random.randint(100, 300)
            )
            
            target_pos = self.get_element_center(element)
            
            # Generate Bezier curve points
            points = self._bezier_curve(current_pos, target_pos)
            
            # Calculate movement duration
            min_dur = MOUSE_MOVEMENT["min_duration"]
            max_dur = MOUSE_MOVEMENT["max_duration"]
            total_duration = random.uniform(min_dur, max_dur)
            step_duration = total_duration / len(points)
            
            self.logger.debug(f"Moving mouse along {len(points)} points")
            
            # Move through each point
            self.action_chains.reset_actions()
            for i, point in enumerate(points):
                if i == len(points) - 1:
                    # Final move to element
                    self.action_chains.move_to_element(element)
                
                # Small delay between movements
                time.sleep(step_duration * random.uniform(0.8, 1.2))
            
            self.action_chains.perform()
            
        except Exception as e:
            self.logger.debug(f"Mouse move fallback: {str(e)}")
            # Fallback to simple move
            self.action_chains.reset_actions()
            self.action_chains.move_to_element(element).perform()
    
    def human_click(self, element: WebElement, move_first: bool = True):
        """
        Perform a human-like click on an element.
        
        Args:
            element: Target WebElement
            move_first: Whether to move mouse to element first
        """
        self.logger.debug("Performing human-like click")
        
        # Small delay before action
        self.random_delay(200, 500)
        
        if move_first:
            self.human_mouse_move(element)
            self.random_delay(50, 150)  # Brief pause before click
        
        # Click with slight randomization in timing
        self.action_chains.reset_actions()
        self.action_chains.click(element).perform()
        
        # Small delay after click
        self.random_delay(100, 300)
    
    def human_type(self, element: WebElement, text: str, clear_first: bool = True):
        """
        Type text with human-like variable speed and occasional pauses.
        
        Args:
            element: Target input element
            text: Text to type
            clear_first: Whether to clear the field first
        """
        self.logger.debug(f"Typing {len(text)} characters with human timing")
        
        # Click element first
        self.human_click(element)
        
        # Clear if needed
        if clear_first:
            element.clear()
            self.random_delay(100, 300)
        
        min_delay = WAIT_TIMES["min_typing_delay"]
        max_delay = WAIT_TIMES["max_typing_delay"]
        
        for i, char in enumerate(text):
            element.send_keys(char)
            
            # Variable delay per character
            mean_delay = (min_delay + max_delay) / 2
            std_dev = (max_delay - min_delay) / 4
            delay = self.gaussian_random(mean_delay, std_dev, min_delay, max_delay)
            
            # Occasional longer pause (thinking/typo simulation)
            if random.random() < 0.05:  # 5% chance
                delay *= random.uniform(2, 4)
            
            # Pause at word boundaries
            if char == ' ':
                delay *= random.uniform(1.2, 1.8)
            
            time.sleep(delay / 1000.0)
        
        self.logger.debug("Typing complete")
    
    def random_scroll(self, direction: str = "down", amount: int = None):
        """
        Perform a human-like scroll action.
        
        Args:
            direction: "up" or "down"
            amount: Scroll amount in pixels (random if None)
        """
        if amount is None:
            amount = random.randint(100, 400)
        
        if direction == "up":
            amount = -amount
        
        self.logger.debug(f"Scrolling {direction} by {abs(amount)}px")
        
        # Execute smooth scroll
        self.driver.execute_script(f"""
            window.scrollBy({{
                top: {amount},
                behavior: 'smooth'
            }});
        """)
        
        # Wait for scroll to complete
        self.random_delay(300, 700)
    
    def hover(self, element: WebElement, duration_ms: int = None):
        """
        Hover over an element for a random duration.
        
        Args:
            element: Target WebElement
            duration_ms: Hover duration in milliseconds
        """
        duration_ms = duration_ms or random.randint(500, 1500)
        
        self.human_mouse_move(element)
        time.sleep(duration_ms / 1000.0)
