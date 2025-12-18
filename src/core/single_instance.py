#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: single_instance.py
Created: 2025-12-16
Author: @lewopxd

Description:
Prevents multiple instances of the application from running.
Uses Windows mutex for reliable cross-process locking.
============================================
"""

import sys
import ctypes
from typing import Optional

# Import Logger
try:
    from .logger import Logger
except ImportError:
    class Logger:
        @staticmethod
        def debug(msg): print(f"DEBUG: {msg}")
        @staticmethod
        def info(msg): print(f"INFO: {msg}")
        @staticmethod
        def warn(msg): print(f"WARN: {msg}")
        @staticmethod
        def error(msg): print(f"ERROR: {msg}")


class SingleInstanceLock:
    """
    Prevents multiple instances of the application from running.
    
    Uses Windows mutex for reliable cross-process locking.
    
    Usage:
        with SingleInstanceLock("MyApp") as lock:
            if not lock.acquired:
                print("Already running!")
                sys.exit(1)
            # Main app code here
    
    Or without context manager:
        lock = SingleInstanceLock("MyApp")
        if not lock.acquire():
            print("Already running!")
            sys.exit(1)
        # ... app code ...
        lock.release()
    """
    
    def __init__(self, app_name: str):
        """
        Initialize the single instance lock.
        
        Args:
            app_name: Unique name for the application (used in mutex name)
        """
        self.app_name = app_name
        self.mutex_name = f"Global\\{app_name}_SingleInstance_Mutex"
        self.mutex_handle: Optional[int] = None
        self.acquired: bool = False
        
        # Windows API constants
        self.ERROR_ALREADY_EXISTS = 183
    
    def acquire(self) -> bool:
        """
        Attempt to acquire the single instance lock.
        
        Returns:
            True if lock acquired (no other instance running),
            False if another instance is already running
        """
        if sys.platform != 'win32':
            Logger.warn("[SingleInstance] Not on Windows, skipping mutex lock")
            self.acquired = True
            return True
        
        try:
            # CreateMutexW(lpMutexAttributes, bInitialOwner, lpName)
            kernel32 = ctypes.windll.kernel32
            
            self.mutex_handle = kernel32.CreateMutexW(
                None,   # Default security attributes
                True,   # Initially owned
                self.mutex_name
            )
            
            if self.mutex_handle == 0:
                Logger.error("[SingleInstance] Failed to create mutex")
                self.acquired = False
                return False
            
            # Check if mutex already existed
            last_error = kernel32.GetLastError()
            
            if last_error == self.ERROR_ALREADY_EXISTS:
                Logger.warn("[SingleInstance] Another instance is already running")
                # Close the handle since we don't own the mutex
                kernel32.CloseHandle(self.mutex_handle)
                self.mutex_handle = None
                self.acquired = False
                return False
            
            Logger.info("[SingleInstance] Lock acquired successfully")
            self.acquired = True
            return True
            
        except Exception as e:
            Logger.error(f"[SingleInstance] Error acquiring lock: {e}")
            self.acquired = False
            return False
    
    def release(self) -> None:
        """Release the single instance lock."""
        if self.mutex_handle is not None and sys.platform == 'win32':
            try:
                kernel32 = ctypes.windll.kernel32
                kernel32.ReleaseMutex(self.mutex_handle)
                kernel32.CloseHandle(self.mutex_handle)
                self.mutex_handle = None
                self.acquired = False
                Logger.debug("[SingleInstance] Lock released")
            except Exception as e:
                Logger.error(f"[SingleInstance] Error releasing lock: {e}")
    
    def __enter__(self) -> "SingleInstanceLock":
        """Context manager entry."""
        self.acquire()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        self.release()


def show_already_running_dialog(app_name: str = "AutoForms") -> None:
    """
    Show a native Windows message box indicating the app is already running.
    
    Args:
        app_name: Name of the application for the dialog title
    """
    if sys.platform != 'win32':
        print(f"{app_name} is already running.")
        return
    
    try:
        import tkinter as tk
        from tkinter import messagebox
        
        root = tk.Tk()
        root.withdraw()  # Hide the main window
        
        messagebox.showwarning(
            title=f"{app_name} - Already Running",
            message=f"{app_name} is already running.\n\n"
                    "Please check your taskbar or system tray."
        )
        
        root.destroy()
        
    except Exception as e:
        # Fallback to ctypes MessageBox
        try:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"{app_name} is already running.\n\nPlease check your taskbar.",
                f"{app_name} - Already Running",
                0x30  # MB_ICONWARNING
            )
        except Exception:
            print(f"{app_name} is already running.")
