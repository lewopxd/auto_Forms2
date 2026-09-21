# AutoForms 2.0

Desktop automation software that combines a Python application layer with an embedded HTML/CSS/JavaScript interface.

The project was developed to automate form-oriented workflows while keeping the user interface separate from the native application logic.

## Architecture

    Python application
          │
          │ Python ↔ JavaScript bridge
          ▼
    WebView interface

The bridge exposes native application functionality to the web-based interface, allowing the UI and Python layer to work as a single desktop application.

## Features

- Embedded WebView desktop interface.
- Bidirectional Python ↔ JavaScript communication.
- JSON-based configuration and persistence.
- Single-instance application control.
- Structured application logging.
- Automation workflows and browser integration.
- Spreadsheet processing through openpyxl.

## Technology

- Python
- JavaScript
- HTML5 / CSS3
- pywebview
- Selenium
- openpyxl
- JSON
- Windows desktop APIs and tooling

## Project structure

    src/
    ├── main.py
    ├── core/
    ├── bridge/
    └── ui/
        ├── index.html
        ├── css/
        └── js/

## Setup

    python -m venv venv
    .\venv\Scripts\activate
    pip install -r requirements.txt
    python src/main.py

## Status

Experimental desktop automation project developed by Leonardo Merchán.

[GitHub](https://github.com/lewopxd) · [0zdev](https://github.com/0zdev)