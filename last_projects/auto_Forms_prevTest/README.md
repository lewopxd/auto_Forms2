# MS Forms Automation

Automated form analysis and interaction tool for Microsoft Forms with **anti-detection** capabilities.

## Features

- 🛡️ **Anti-Detection**: Uses `undetected-chromedriver` to bypass bot detection
- 🖱️ **Human-Like Interaction**: Bezier curve mouse movements, Gaussian timing
- 📊 **Form Analysis**: Extracts all form elements (questions, inputs, buttons)
- 🔐 **Manual Login Support**: Waits for user to log in manually (secure)
- 🎯 **Non-Headless**: Visible browser for full interaction control

## Installation

```powershell
cd d:\progTests\auto_Forms
pip install -r requirements.txt
```

## Usage

### Basic Usage
```powershell
python main.py --url "https://forms.office.com/Pages/ResponsePage.aspx?id=..."
```

### Public Form (No Login Required)
```powershell
python main.py --url "https://forms.office.com/..." --no-wait-login
```

### Debug Mode
```powershell
python main.py --url "https://forms.office.com/..." --debug
```

## Output

The tool prints all form elements to console:
- Question containers with text
- Input fields (text, radio, checkbox, dropdown)
- Element IDs, classes, and data attributes
- Submit button information

## Project Structure

```
auto_Forms/
├── config/
│   └── settings.py      # Configuration parameters
├── core/
│   ├── browser_manager.py    # Anti-detection browser
│   ├── human_interaction.py  # Human-like behavior
│   └── form_analyzer.py      # DOM extraction
├── utils/
│   └── logger.py        # Colored logging
├── main.py              # Entry point
└── requirements.txt     # Dependencies
```

## Anti-Detection Measures

1. `undetected-chromedriver` patches Chrome internally
2. Removes `navigator.webdriver` flag
3. Random window sizes
4. Human-like timing and delays
5. No headless mode indicators

## License

MIT License
