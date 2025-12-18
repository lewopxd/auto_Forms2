# AutoForms 2.0

Form automation application with Python backend and HTML5 WebView UI.

## Setup

```powershell
# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Run

```powershell
python src/main.py
```

## Project Structure

```
src/
├── main.py                 # Entry point
├── core/
│   ├── config.py           # App configuration
│   ├── logger.py           # Logging system
│   ├── storage.py          # Persistence (JSON)
│   └── single_instance.py  # Prevent duplicates
├── bridge/
│   ├── bridge_api.py       # Python-JS communication
│   └── handlers/
│       └── system_handlers.py
└── ui/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── bridge.js       # JS-side bridge
        └── app.js          # UI logic
```

## Features

- **pywebview** - Native window with embedded WebView
- **Bidirectional bridge** - Python ↔ JavaScript communication
- **Persistence** - Window state and config saved to AppData
- **Single instance** - Prevents duplicate app execution
- **Custom logger** - Multi-level colored terminal output
