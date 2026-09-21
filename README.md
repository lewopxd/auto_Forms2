# AutoForms 2.0

> Desktop form-automation application combining a Python backend with an HTML/JavaScript interface.

AutoForms explores desktop workflow automation through a hybrid architecture: Python handles application logic and system integration while an embedded WebView provides the user interface.

## Architecture

```
Python application
      │
      ├── configuration
      ├── persistence
      ├── logging
      └── automation
      │
      ↕ bridge
      │
HTML / CSS / JavaScript
      │
      └── WebView UI
```

The Python ↔ JavaScript bridge allows the interface to communicate with native application functionality.

## Features

- Native desktop window using **pywebview**.
- Bidirectional Python ↔ JavaScript communication.
- JSON-based configuration persistence.
- Single-instance application control.
- Custom logging system.
- HTML5/CSS/JavaScript interface.
- Automation-oriented application architecture.

## Technology

- Python
- JavaScript
- HTML5
- CSS3
- pywebview
- Selenium
- openpyxl
- JSON
- Windows desktop tooling

## Project structure

```
src/
├── main.py
├── core/
│   ├── config.py
│   ├── logger.py
│   ├── storage.py
│   └── single_instance.py
├── bridge/
│   └── bridge_api.py
└── ui/
    ├── index.html
    ├── css/
    └── js/
```

## Setup

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python src/main.py
```

## Status

Experimental personal automation software.

Before making this repository public, review the repository history and configuration files for credentials, personal data, cookies, API keys or other private information.

## Author

**Leonardo Merchán — lewopxd**

[GitHub profile](https://github.com/lewopxd) · [0zdev](https://github.com/0zdev)
