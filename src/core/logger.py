#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: logger.py
Created: 2025-12-16
Author: @lewopxd

Description:
Centralized logging system for AutoForms.
Provides multi-level terminal logging with optional colors and file output.
============================================
"""

from enum import IntEnum
from typing import Optional
from datetime import datetime
from pathlib import Path
import sys


class LogLevel(IntEnum):
    """Log severity levels (lower = more verbose)."""
    DEBUG = 10
    INFO = 20
    WARN = 30
    ERROR = 40
    SILENT = 100


class Colors:
    """ANSI color codes for terminal output."""
    RESET = "\033[0m"
    GRAY = "\033[90m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    BOLD = "\033[1m"


class AutoFormsLogger:
    """
    Centralized logger for AutoForms.
    
    Singleton pattern - use Logger.* methods directly.
    
    Terminal Logging:
        Logger.debug("message")  → Only shown if level <= DEBUG
        Logger.info("message")   → Standard information
        Logger.warn("message")   → Warnings (yellow)
        Logger.error("message")  → Errors (red)
    
    Configuration:
        Logger.set_level("DEBUG")
        Logger.enable_colors(True)
        Logger.set_log_file("path/to/file.log")
    """
    
    # Class-level state (singleton)
    _level: LogLevel = LogLevel.INFO
    _use_colors: bool = True
    _log_file: Optional[Path] = None
    _initialized: bool = False
    
    # ═══════════════════════════════════════════════════════════
    # CONFIGURATION
    # ═══════════════════════════════════════════════════════════
    
    @classmethod
    def set_level(cls, level: str | LogLevel):
        """
        Set minimum log level for terminal output.
        
        Args:
            level: "DEBUG", "INFO", "WARN", "ERROR", "SILENT" or LogLevel enum
        """
        if isinstance(level, str):
            level_map = {
                "DEBUG": LogLevel.DEBUG,
                "INFO": LogLevel.INFO,
                "WARN": LogLevel.WARN,
                "WARNING": LogLevel.WARN,
                "ERROR": LogLevel.ERROR,
                "SILENT": LogLevel.SILENT
            }
            cls._level = level_map.get(level.upper(), LogLevel.INFO)
        else:
            cls._level = level
    
    @classmethod
    def enable_colors(cls, enabled: bool = True):
        """Enable/disable ANSI colors in terminal output."""
        cls._use_colors = enabled
    
    @classmethod
    def set_log_file(cls, path: Optional[str]):
        """
        Set file path for logging (None to disable).
        
        Args:
            path: Path to log file or None to disable file logging
        """
        if path:
            cls._log_file = Path(path)
            # Ensure directory exists
            cls._log_file.parent.mkdir(parents=True, exist_ok=True)
        else:
            cls._log_file = None
    
    @classmethod
    def initialize(cls, level: str = "INFO", colors: bool = True, log_file: Optional[str] = None):
        """
        Initialize the logger with all settings at once.
        
        Args:
            level: Log level string
            colors: Enable colors
            log_file: Optional log file path
        """
        cls.set_level(level)
        cls.enable_colors(colors)
        if log_file:
            cls.set_log_file(log_file)
        cls._initialized = True
    
    # ═══════════════════════════════════════════════════════════
    # TERMINAL LOGGING
    # ═══════════════════════════════════════════════════════════
    
    @classmethod
    def _get_color(cls, level: LogLevel) -> str:
        """Get ANSI color code for log level."""
        return {
            LogLevel.DEBUG: Colors.GRAY,
            LogLevel.INFO: Colors.GREEN,
            LogLevel.WARN: Colors.YELLOW,
            LogLevel.ERROR: Colors.RED
        }.get(level, Colors.RESET)
    
    @classmethod
    def _format_message(cls, level: LogLevel, message: str) -> str:
        """Format log message with timestamp and level."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        level_str = level.name.ljust(5)
        
        if cls._use_colors:
            color = cls._get_color(level)
            return f"{Colors.GRAY}{timestamp}{Colors.RESET} {color}{level_str}{Colors.RESET} {message}"
        else:
            return f"{timestamp} {level_str} {message}"
    
    @classmethod
    def _log(cls, level: LogLevel, message: str):
        """Internal log method."""
        if level >= cls._level:
            formatted = cls._format_message(level, message)
            
            # Output to appropriate stream
            output = sys.stderr if level >= LogLevel.ERROR else sys.stdout
            print(formatted, file=output)
            
            # Also write to file if configured
            if cls._log_file:
                try:
                    with open(cls._log_file, "a", encoding="utf-8") as f:
                        # Strip colors for file
                        clean_msg = f"{datetime.now().isoformat()} {level.name} {message}\n"
                        f.write(clean_msg)
                except Exception:
                    pass  # Silent fail for file logging
    
    @classmethod
    def debug(cls, message: str):
        """Log debug message (only if level <= DEBUG)."""
        cls._log(LogLevel.DEBUG, message)
    
    @classmethod
    def info(cls, message: str):
        """Log info message."""
        cls._log(LogLevel.INFO, message)
    
    @classmethod
    def warn(cls, message: str):
        """Log warning message."""
        cls._log(LogLevel.WARN, message)
    
    @classmethod
    def error(cls, message: str):
        """Log error message."""
        cls._log(LogLevel.ERROR, message)
    
    # ═══════════════════════════════════════════════════════════
    # UTILITY METHODS
    # ═══════════════════════════════════════════════════════════
    
    @classmethod
    def separator(cls, char: str = "─", length: int = 50):
        """Print a separator line."""
        cls.info(char * length)
    
    @classmethod
    def header(cls, title: str, char: str = "═"):
        """Print a header with title."""
        line = char * 50
        cls.info(line)
        cls.info(f"  {title}")
        cls.info(line)


# ═══════════════════════════════════════════════════════════════════
# CONVENIENCE ALIAS
# ═══════════════════════════════════════════════════════════════════

Logger = AutoFormsLogger
"""Convenience alias for AutoFormsLogger."""
