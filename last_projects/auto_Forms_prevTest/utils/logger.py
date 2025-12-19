"""
Professional logging utility with colored console output.
"""
import sys
from datetime import datetime
from colorama import init, Fore, Style

# Initialize colorama for Windows support
init(autoreset=True)


class Logger:
    """Custom logger with colored console output and timestamps."""
    
    LEVELS = {
        "DEBUG": 0,
        "INFO": 1,
        "WARNING": 2,
        "ERROR": 3,
    }
    
    COLORS = {
        "DEBUG": Fore.CYAN,
        "INFO": Fore.GREEN,
        "WARNING": Fore.YELLOW,
        "ERROR": Fore.RED,
    }
    
    ICONS = {
        "DEBUG": "🔍",
        "INFO": "✅",
        "WARNING": "⚠️",
        "ERROR": "❌",
    }
    
    def __init__(self, name: str = "MSFormsAuto", level: str = "INFO", 
                 show_timestamps: bool = True, use_colors: bool = True):
        """
        Initialize the logger.
        
        Args:
            name: Logger name (shown in output)
            level: Minimum log level to display
            show_timestamps: Whether to show timestamps
            use_colors: Whether to use colored output
        """
        self.name = name
        self.level = self.LEVELS.get(level.upper(), 1)
        self.show_timestamps = show_timestamps
        self.use_colors = use_colors
    
    def _format_message(self, level: str, message: str) -> str:
        """Format a log message with optional timestamp and colors."""
        parts = []
        
        # Timestamp
        if self.show_timestamps:
            timestamp = datetime.now().strftime("%H:%M:%S")
            parts.append(f"[{timestamp}]")
        
        # Level with icon
        icon = self.ICONS.get(level, "")
        if self.use_colors:
            color = self.COLORS.get(level, Fore.WHITE)
            parts.append(f"{color}[{level}]{Style.RESET_ALL}")
        else:
            parts.append(f"[{level}]")
        
        # Logger name
        parts.append(f"[{self.name}]")
        
        # Icon and message
        parts.append(f"{icon} {message}")
        
        return " ".join(parts)
    
    def _log(self, level: str, message: str):
        """Internal logging method."""
        if self.LEVELS.get(level, 0) >= self.level:
            formatted = self._format_message(level, message)
            print(formatted)
            sys.stdout.flush()
    
    def debug(self, message: str):
        """Log a debug message."""
        self._log("DEBUG", message)
    
    def info(self, message: str):
        """Log an info message."""
        self._log("INFO", message)
    
    def warning(self, message: str):
        """Log a warning message."""
        self._log("WARNING", message)
    
    def error(self, message: str):
        """Log an error message."""
        self._log("ERROR", message)
    
    def separator(self, char: str = "=", length: int = 60):
        """Print a separator line."""
        if self.use_colors:
            print(f"{Fore.BLUE}{char * length}{Style.RESET_ALL}")
        else:
            print(char * length)
    
    def header(self, title: str):
        """Print a formatted header."""
        self.separator()
        if self.use_colors:
            print(f"{Fore.CYAN}{Style.BRIGHT}  {title}{Style.RESET_ALL}")
        else:
            print(f"  {title}")
        self.separator()
