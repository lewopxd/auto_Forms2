"""
Main Application Window
Handles browser launch, UI injection, and console log monitoring for Save/Analyze.
"""
import sys
import threading
import time
import json

from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QComboBox, QLineEdit, QPushButton, QFrame
)
from PySide6.QtCore import Signal, QObject, Qt, QTimer

from core.browser_detector import BrowserDetector
from core.browser_launcher import BrowserLauncher
from core.js_injector import inject_ui, set_form_data, reload_ui
from core.form_analyzer import get_questions_for_ui
from core.form_storage import save_page_data
from config.settings import TIMEOUTS
from config.appstate import get_last_url, set_last_url


class WorkerSignals(QObject):
    browsers_ready = Signal(list)
    status_update = Signal(str)
    start_timer = Signal()


class MainWindow(QWidget):
    
    def __init__(self):
        super().__init__()
        self.detector = BrowserDetector()
        self.launcher = None
        self.browser_choices = []
        self.current_form_data = None
        self.signals = WorkerSignals()
        
        self.signals.browsers_ready.connect(self._on_browsers_ready)
        self.signals.status_update.connect(self._on_status_update)
        self.signals.start_timer.connect(self._start_log_timer)
        
        self._setup_ui()
        self._detect_browsers()
        
        # Console log monitor timer
        self.log_timer = QTimer()
        self.log_timer.timeout.connect(self._check_console_logs)
    
    def _setup_ui(self):
        self.setWindowTitle("MS Forms Automation")
        self.setFixedSize(450, 260)
        self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(6)
        
        # Title
        title = QLabel("MS Forms Automation")
        title.setStyleSheet("font-size: 16px; font-weight: bold; margin-bottom: 8px;")
        layout.addWidget(title)
        
        # Browser section
        layout.addWidget(QLabel("Browser:"))
        self.browser_combo = QComboBox()
        self.browser_combo.setMinimumHeight(32)
        self.browser_combo.addItem("Detecting...")
        self.browser_combo.setEnabled(False)
        layout.addWidget(self.browser_combo)
        
        # Spacer
        layout.addSpacing(12)
        
        # URL section
        layout.addWidget(QLabel("Form URL:"))
        self.url_input = QLineEdit()
        self.url_input.setMinimumHeight(32)
        self.url_input.setPlaceholderText("https://forms.office.com/...")
        self.url_input.setText(get_last_url())
        layout.addWidget(self.url_input)
        
        # Status
        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: gray; font-size: 11px;")
        layout.addWidget(self.status_label)
        
        # Buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(10)
        
        self.reload_btn = QPushButton("Reload UI")
        self.reload_btn.setMinimumHeight(34)
        self.reload_btn.setEnabled(False)
        self.reload_btn.clicked.connect(self._on_reload)
        btn_layout.addWidget(self.reload_btn)
        
        btn_layout.addStretch()
        
        self.playground_btn = QPushButton("Playground")
        self.playground_btn.setMinimumHeight(34)
        self.playground_btn.setEnabled(False)  # Enabled after browser detection
        self.playground_btn.clicked.connect(self._on_playground)
        btn_layout.addWidget(self.playground_btn)
        
        self.start_btn = QPushButton("Start Record")
        self.start_btn.setMinimumHeight(34)
        self.start_btn.setMinimumWidth(120)
        self.start_btn.setEnabled(False)
        self.start_btn.clicked.connect(self._on_start)
        btn_layout.addWidget(self.start_btn)
        
        layout.addLayout(btn_layout)
    
    def _detect_browsers(self):
        def detect():
            choices = self.detector.get_dropdown_choices()
            self.signals.browsers_ready.emit(choices)
        threading.Thread(target=detect, daemon=True).start()
    
    def _on_browsers_ready(self, choices):
        self.browser_choices = choices
        self.browser_combo.clear()
        
        if choices:
            for display, name, path in choices:
                self.browser_combo.addItem(display)
            self.browser_combo.setEnabled(True)
            self.start_btn.setEnabled(True)
            self.playground_btn.setEnabled(True)
        else:
            self.browser_combo.addItem("No browsers found")
    
    def _on_status_update(self, text):
        self.status_label.setText(text)
    
    def _start_log_timer(self):
        """Start the command monitoring timer (called from main thread)."""
        if not self.log_timer.isActive():
            self.log_timer.start(500)
    
    def _on_start(self):
        url = self.url_input.text().strip()
        if not url:
            self.status_label.setText("Enter a URL")
            return
        
        if not url.startswith("http"):
            self.status_label.setText("URL must start with http://")
            return
        
        set_last_url(url)
        
        idx = self.browser_combo.currentIndex()
        if idx < 0 or idx >= len(self.browser_choices):
            return
        
        _, browser_name, browser_path = self.browser_choices[idx]
        
        self.start_btn.setEnabled(False)
        self.status_label.setText("Launching...")
        
        def run():
            try:
                self.launcher = BrowserLauncher(browser_path)
                driver = self.launcher.launch(url)
                
                self.signals.status_update.emit("Injecting UI...")
                time.sleep(TIMEOUTS["injection_delay"])
                
                inject_ui(driver)
                self.reload_btn.setEnabled(True)
                
                self.signals.status_update.emit("Analyzing...")
                time.sleep(1.5)
                
                self.current_form_data = get_questions_for_ui(driver)
                set_form_data(driver, self.current_form_data)
                
                q_count = len(self.current_form_data.get("questions", []))
                page = self.current_form_data.get("pageInfo", {}).get("text", "")
                self.signals.status_update.emit(f"{q_count} questions - {page}")
                
                # Start monitoring console logs (via signal for thread safety)
                self.signals.start_timer.emit()
                
            except Exception as e:
                self.signals.status_update.emit(f"Error: {str(e)[:40]}")
            finally:
                self.start_btn.setEnabled(True)
        
        threading.Thread(target=run, daemon=True).start()
    
    def _check_console_logs(self):
        """Check for commands from injected UI via JavaScript variable."""
        if not self.launcher or not self.launcher.get_driver():
            return
        
        try:
            driver = self.launcher.get_driver()
            
            # Get and clear commands from JavaScript
            commands = driver.execute_script("""
                var cmds = window.__msfa_commands || [];
                window.__msfa_commands = [];
                return cmds;
            """)
            
            for cmd in commands:
                cmd_type = cmd.get('type', '')
                
                if cmd_type == 'save':
                    self._handle_save_data(cmd.get('data', {}))
                elif cmd_type == 'analyze':
                    self._handle_analyze()
                    
        except Exception:
            pass
    
    def _handle_save_data(self, data):
        """Save form data to JSON file."""
        try:
            url = data.get('url', self.url_input.text().strip())
            page_num = data.get('pageInfo', {}).get('current', 1)
            
            filepath = save_page_data(url, page_num, data)
            self.signals.status_update.emit(f"Saved page {page_num}")
            
            # Notify UI
            driver = self.launcher.get_driver()
            driver.execute_script("window.__msfa_onSaved && window.__msfa_onSaved()")
            
        except Exception as e:
            self.signals.status_update.emit(f"Save error: {str(e)[:30]}")
    
    def _handle_analyze(self):
        """Re-analyze the current page."""
        def run():
            try:
                driver = self.launcher.get_driver()
                self.signals.status_update.emit("Analyzing...")
                time.sleep(0.5)
                
                self.current_form_data = get_questions_for_ui(driver)
                set_form_data(driver, self.current_form_data)
                
                q_count = len(self.current_form_data.get("questions", []))
                self.signals.status_update.emit(f"Analyzed - {q_count} questions")
                
            except Exception as e:
                self.signals.status_update.emit(f"Analyze error: {str(e)[:30]}")
        
        threading.Thread(target=run, daemon=True).start()
    
    def _on_reload(self):
        if not self.launcher or not self.launcher.get_driver():
            self.status_label.setText("No browser")
            return
        
        self.status_label.setText("Reloading...")
        
        def run():
            try:
                driver = self.launcher.get_driver()
                reload_ui(driver)
                time.sleep(0.5)
                self.current_form_data = get_questions_for_ui(driver)
                set_form_data(driver, self.current_form_data)
                q_count = len(self.current_form_data.get("questions", []))
                self.signals.status_update.emit(f"Reloaded - {q_count} questions")
            except Exception as e:
                self.signals.status_update.emit(f"Error: {str(e)[:30]}")
        
        threading.Thread(target=run, daemon=True).start()
    
    def _on_playground(self):
        """Start playground server and open in browser."""
        from core.playground_server import PlaygroundServer
        
        self.playground_btn.setEnabled(False)
        self.status_label.setText("Starting Playground...")
        
        def run():
            try:
                port = PlaygroundServer.start(port=8000, open_browser=True)
                self.signals.status_update.emit(f"Playground running on port {port}")
            except Exception as e:
                self.signals.status_update.emit(f"Error: {str(e)[:30]}")
            finally:
                self.playground_btn.setEnabled(True)
        
        threading.Thread(target=run, daemon=True).start()
    
    def closeEvent(self, event):
        self.log_timer.stop()
        if self.launcher:
            self.launcher.close()
        event.accept()


def run_app():
    app = QApplication.instance() or QApplication(sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(run_app())
