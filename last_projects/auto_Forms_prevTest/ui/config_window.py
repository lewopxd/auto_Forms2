"""
Config Window + Browser Launch + Form Analysis + UI Display
"""
import os
import sys
import time
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QComboBox, QLineEdit, QPushButton
)
from PySide6.QtCore import Signal, QObject

from core.browser_detector import BrowserDetector


class Signals(QObject):
    ready = Signal(list)


class ConfigWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.detector = BrowserDetector()
        self.browser_choices = []
        self.result = None
        self.signals = Signals()
        self.signals.ready.connect(self._on_browsers)
        
        self.setWindowTitle("MS Forms Automation")
        self.setFixedSize(450, 200)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(10)
        
        layout.addWidget(QLabel("Browser:"))
        self.browser_cb = QComboBox()
        self.browser_cb.addItem("Loading...")
        layout.addWidget(self.browser_cb)
        
        layout.addWidget(QLabel("Form URL:"))
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("https://forms.office.com/...")
        layout.addWidget(self.url_input)
        
        btn_row = QHBoxLayout()
        cancel = QPushButton("Cancel")
        cancel.clicked.connect(self.close)
        btn_row.addWidget(cancel)
        btn_row.addStretch()
        start = QPushButton("Start")
        start.clicked.connect(self._start)
        btn_row.addWidget(start)
        layout.addLayout(btn_row)
        
        threading.Thread(target=self._detect, daemon=True).start()
    
    def _detect(self):
        choices = self.detector.get_dropdown_choices()
        self.signals.ready.emit(choices)
    
    def _on_browsers(self, choices):
        self.browser_choices = choices
        self.browser_cb.clear()
        if choices:
            for display, name, path in choices:
                self.browser_cb.addItem(display)
        else:
            self.browser_cb.addItem("No browsers found")
    
    def _start(self):
        url = self.url_input.text().strip()
        if not url:
            return
        
        idx = self.browser_cb.currentIndex()
        if idx < 0 or idx >= len(self.browser_choices):
            return
        
        _, browser_name, browser_path = self.browser_choices[idx]
        self.result = {"browser": browser_name, "path": browser_path, "url": url}
        self.close()


def run_automation(config: dict):
    """Launch browser, inject UI, analyze form, display questions."""
    import undetected_chromedriver as uc
    from core.ui_injector import inject_ui
    
    print(f"\n[MSFA] Launching {config['browser']}...")
    
    options = uc.ChromeOptions()
    options.binary_location = config['path']
    driver = uc.Chrome(options=options, use_subprocess=True)
    
    print(f"[MSFA] Navigating to form...")
    driver.get(config['url'])
    time.sleep(2)
    
    print(f"[MSFA] Injecting Record Mode UI...")
    inject_ui(driver)
    time.sleep(1)
    
    print(f"[MSFA] Analyzing form...")
    
    # Extract questions using JavaScript
    questions_js = """
    const questions = [];
    document.querySelectorAll('[data-automation-id="questionItem"]').forEach((item, i) => {
        const titleEl = item.querySelector('[data-automation-id="questionTitle"] .text-format-content');
        const inputEl = item.querySelector('input, textarea, [role="listbox"], [role="radiogroup"]');
        
        let qType = 'text';
        if (item.querySelector('[role="radiogroup"]')) qType = 'choice';
        else if (item.querySelector('[role="listbox"]')) qType = 'dropdown';
        else if (item.querySelector('textarea')) qType = 'long text';
        
        questions.push({
            text: titleEl ? titleEl.textContent.trim() : 'Question ' + (i+1),
            type: qType
        });
    });
    return questions;
    """
    
    questions = driver.execute_script(questions_js)
    print(f"[MSFA] Found {len(questions)} questions")
    
    # Send questions to UI
    import json
    driver.execute_script(f"window.__msfa_setQuestions({json.dumps(questions)})")
    
    print(f"[MSFA] Record Mode ready. Press Ctrl+C to close.")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n[MSFA] Closing...")
        try:
            driver.quit()
        except:
            pass


def main():
    app = QApplication.instance() or QApplication(sys.argv)
    w = ConfigWindow()
    w.show()
    app.exec()
    
    if w.result:
        run_automation(w.result)
    else:
        print("Cancelled")


if __name__ == "__main__":
    main()
