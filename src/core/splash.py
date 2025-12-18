#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: splash.py
Created: 2025-12-16
Author: @lewopxd

Description:
Ultra-fast native splash screen using Tkinter.
Light theme with gradient text effect.
Single-line status that updates in place.
============================================
"""

import sys
import time
import ctypes
import multiprocessing
from typing import Optional


# App name
APP_DISPLAY_NAME = "FormFlow"


class SplashScreen:
    """
    Ultra-fast native splash screen.
    
    Features:
    - Instant display using Tkinter
    - Light theme with gradient text effect
    - Single updating status line (no scrolling logs)
    - Smooth progress bar animation
    - Infinite loading effect when stalled
    """
    
    def __init__(self, log_queue: multiprocessing.Queue = None):
        self.log_queue = log_queue
        self.root = None
        self.start_time = time.time()
        self.is_closing = False
        
        # UI elements
        self.status_label = None
        self.progress_canvas = None
        self.progress_fill = None
        self.progress_shimmer = None
        self.progress_width = 0
        
        # Animation state
        self._progress_target = 0
        self._progress_current = 0
        self._last_progress_change = time.time()
        self._shimmer_pos = 0
        self._shimmer_active = False
    
    def create(self):
        """Create and display the splash screen immediately."""
        import tkinter as tk
        from tkinter import font as tkFont
        
        # DPI Awareness
        if sys.platform == "win32":
            try:
                ctypes.windll.shcore.SetProcessDpiAwareness(1)
            except Exception:
                try:
                    ctypes.windll.user32.SetProcessDPIAware()
                except Exception:
                    pass
        
        self.root = tk.Tk()
        self.root.title(f"{APP_DISPLAY_NAME}")
        
        # --- Colors (Light Theme) ---
        BG_COLOR = "#ffffff"
        TEXT_PRIMARY = "#1a1a2e"
        TEXT_SECONDARY = "#6c757d"
        self.ACCENT_COLOR = "#667eea"
        self.SHIMMER_COLOR = "#00bfa5"  # Vibrant teal for visibility
        BORDER_COLOR = "#e9ecef"
        PROGRESS_BG = "#f1f3f4"
        
        # --- Fonts ---
        TITLE_FONT = tkFont.Font(family="Segoe UI", size=28, weight="bold")
        SUBTITLE_FONT = tkFont.Font(family="Segoe UI", size=10)
        STATUS_FONT = tkFont.Font(family="Segoe UI", size=9)
        CREDIT_FONT = tkFont.Font(family="Segoe UI", size=8)
        
        # --- Window Setup ---
        self.root.configure(bg=BG_COLOR)
        self.root.overrideredirect(True)
        
        if sys.platform == "win32":
            self.root.attributes('-toolwindow', True)
            self.root.attributes('-topmost', True)
        
        # Size and position
        window_width = 400
        window_height = 180
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x_pos = (screen_width - window_width) // 2
        y_pos = (screen_height - window_height) // 2
        
        self.root.geometry(f'{window_width}x{window_height}+{x_pos}+{y_pos}')
        
        # --- Main Container ---
        main_frame = tk.Frame(self.root, bg=BG_COLOR, highlightthickness=1,
                             highlightbackground=BORDER_COLOR)
        main_frame.place(x=0, y=0, width=window_width, height=window_height)
        
        # --- App Name with Gradient Effect ---
        title_canvas = tk.Canvas(main_frame, width=window_width-40, height=45, 
                                bg=BG_COLOR, highlightthickness=0)
        title_canvas.place(x=20, y=25)
        
        # Shadow
        title_canvas.create_text(2, 32, text=APP_DISPLAY_NAME, font=TITLE_FONT,
                                fill="#e8e8e8", anchor="w")
        
        # Main gradient text (simulated with single color for simplicity)
        title_canvas.create_text(0, 30, text=APP_DISPLAY_NAME, font=TITLE_FONT,
                                fill=self.ACCENT_COLOR, anchor="w")
        
        # Subtitle
        subtitle = tk.Label(main_frame, text="Form Automation Suite", 
                           font=SUBTITLE_FONT, fg=TEXT_SECONDARY, bg=BG_COLOR)
        subtitle.place(x=20, y=70)
        
        # --- Progress Bar ---
        progress_y = 105
        self.progress_width = window_width - 40
        
        # Background
        self.progress_canvas = tk.Canvas(main_frame, height=3, 
                                         bg=PROGRESS_BG, highlightthickness=0)
        self.progress_canvas.place(x=20, y=progress_y, width=self.progress_width, height=3)
        
        # Progress fill
        self.progress_fill = self.progress_canvas.create_rectangle(
            0, 0, 0, 3, fill=self.ACCENT_COLOR, outline=""
        )
        
        # Shimmer effect (overlay, hidden initially)
        self.progress_shimmer = self.progress_canvas.create_rectangle(
            -40, 0, 0, 3, fill=self.SHIMMER_COLOR, outline=""
        )
        
        # --- Status Label (single line, updates in place) ---
        self.status_label = tk.Label(main_frame, text="Initializing...", 
                                     font=STATUS_FONT, fg=TEXT_SECONDARY, bg=BG_COLOR,
                                     anchor="w")
        self.status_label.place(x=20, y=120, width=self.progress_width)
        
        # --- Credit ---
        credit = tk.Label(main_frame, text="@lewop", font=CREDIT_FONT,
                         fg="#888888", bg=BG_COLOR)
        credit.place(x=window_width-60, y=150)
        
        # Force display immediately
        self.root.update_idletasks()
        self.root.update()
        
        # Start animations
        self.root.after(30, self._animate_progress)
        self.root.after(50, self._check_log_queue)
    
    def _animate_progress(self):
        """Smooth progress bar animation with shimmer effect when stalled."""
        if self.is_closing or not self.root.winfo_exists():
            return
        
        # Calculate time since last progress change
        time_since_change = time.time() - self._last_progress_change
        
        # Activate shimmer if stalled for more than 1 second
        if time_since_change > 1.0 and self._progress_current > 0:
            self._shimmer_active = True
        else:
            self._shimmer_active = False
        
        # Ease towards target
        diff = self._progress_target - self._progress_current
        if abs(diff) > 0.001:
            self._progress_current += diff * 0.2
        
        # Update main progress bar
        fill_width = int(self._progress_current * self.progress_width)
        self.progress_canvas.coords(self.progress_fill, 0, 0, fill_width, 3)
        
        # Animate shimmer effect (scanning light)
        if self._shimmer_active and fill_width > 0:
            shimmer_width = 60
            self._shimmer_pos += 8  # Fast shimmer speed
            
            # Reset shimmer position when it goes past the progress fill
            if self._shimmer_pos > fill_width + shimmer_width:
                self._shimmer_pos = -shimmer_width
            
            # Position shimmer within bounds
            shimmer_start = self._shimmer_pos
            shimmer_end = min(self._shimmer_pos + shimmer_width, fill_width)
            
            if shimmer_start < fill_width:
                self.progress_canvas.coords(
                    self.progress_shimmer,
                    max(0, shimmer_start), 0, shimmer_end, 3
                )
                self.progress_canvas.itemconfig(self.progress_shimmer, fill=self.SHIMMER_COLOR)
            else:
                # Hide shimmer when out of bounds
                self.progress_canvas.coords(self.progress_shimmer, -40, 0, 0, 3)
        else:
            # Hide shimmer
            self.progress_canvas.coords(self.progress_shimmer, -40, 0, 0, 3)
        
        self.root.after(25, self._animate_progress)
    
    def _check_log_queue(self):
        """Check for messages from child process."""
        if self.is_closing or not self.root.winfo_exists():
            return
        
        if self.log_queue:
            try:
                while not self.log_queue.empty():
                    msg = self.log_queue.get_nowait()
                    if isinstance(msg, dict):
                        self._handle_message(msg)
            except Exception:
                pass
        
        self.root.after(30, self._check_log_queue)
    
    def _handle_message(self, msg: dict):
        """Handle a message from the queue."""
        msg_type = msg.get("type", "")
        
        if msg_type == "status":
            self.set_status(msg.get("text", ""))
        elif msg_type == "progress":
            self.set_progress(msg.get("value", 0))
        elif msg_type == "done":
            self.close()
    
    def set_status(self, text: str):
        """Update the status text (single line, replaces previous)."""
        if self.status_label and self.root.winfo_exists():
            self.status_label.config(text=text)
    
    def set_progress(self, value: float):
        """Set progress bar (0.0 to 1.0)."""
        new_value = max(0, min(1, value))
        if abs(new_value - self._progress_target) > 0.01:
            self._progress_target = new_value
            self._last_progress_change = time.time()
            self._shimmer_pos = -40  # Reset shimmer position
    
    def close(self):
        """Close the splash screen."""
        self.is_closing = True
        if self.root and self.root.winfo_exists():
            self.root.destroy()
    
    def run(self, ready_event: multiprocessing.Event, 
            child_process: multiprocessing.Process):
        """
        Run the splash screen main loop.
        """
        def check_ready():
            if self.is_closing:
                return
            
            # Check if ready event is set
            if ready_event.is_set():
                self.set_status("Ready!")
                self.set_progress(1.0)
                # Small delay to show 100% before closing
                self.root.after(200, self.close)
                return
            
            # Check if child process died
            if not child_process.is_alive():
                self.set_status("Error: Failed to start")
                self.root.after(1500, self.close)
                return
            
            # Check again
            self.root.after(30, check_ready)
        
        self.root.after(50, check_ready)
        
        try:
            self.root.mainloop()
        except Exception:
            pass


def create_splash_process(log_queue: multiprocessing.Queue,
                          ready_event: multiprocessing.Event,
                          child_process: multiprocessing.Process):
    """
    Create and run splash screen (called in main process).
    """
    splash = SplashScreen(log_queue)
    splash.create()
    splash.run(ready_event, child_process)
