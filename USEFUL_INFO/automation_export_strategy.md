# Informe Técnico: Exportación de Paquete de Automatización

## Objetivo

Crear una función que genere un archivo JSON autocontenido (`.afpkg` - AutoForm Package) que permita a un script externo de Selenium automatizar el llenado de formularios sin depender de la aplicación principal.

---

## Estado Actual

### Fuentes de Datos Existentes

| Fuente | Ubicación | Contenido |
|--------|-----------|-----------|
| Recording Data | `projectData.recordings[].data` | Selectores CSS, opciones, navegación (del .raf) |
| User Configs | `projectData.tabs[].cards[].config` | Timing, strategy, validation por pregunta |
| Automation Config | `projectData.tabs[].automationConfig` | Filtros, rango de filas |
| Excel Data | `window.globalExcelData` | Filas de datos fuente |

### Función Existente Reutilizable

```javascript
// autoform_view.js - Línea ~4329
buildRowDataForExport(tabId, rowData)
// Retorna: { rowIndex, filterPasses, questions: [{ key, resolvedValue }] }
```

---

## Estrategia

1. **Extraer Instructions** = `recording.data` + `cards[].config` (excluyendo `mapping`)
2. **Generar Resolved Data** = Reutilizar lógica de `buildExportData()` existente
3. **Fusionar** en un solo JSON exportable

---

## Diagrama de Flujo

```
buildAutomationPackage(tabId, options)
│
├─► getInstructionSet(tabId)
│   ├── recording.data.pages → selectores, opciones, navegación
│   ├── cards[].config → timing, strategy, validation
│   └── Return: instructions{}
│
├─► getResolvedRows(tabId, options)
│   ├── globalExcelData → filas fuente
│   ├── automationConfig.range → filtrar rango
│   ├── buildRowDataForExport() → resolver placeholders
│   ├── automationConfig.filter → excluir filas que no pasan
│   └── Return: resolvedRows[]
│
└─► Return: { meta, instructions, resolvedRows }
```

---

## Funciones Necesarias

### 1. `buildAutomationPackage(tabId, options)`
**Ubicación:** `export_modal.js` o nuevo `automation_export.js`

```javascript
function buildAutomationPackage(tabId, options = { useAutomation: true }) {
    return {
        meta: buildMeta(tabId),
        instructions: getInstructionSet(tabId),
        resolvedRows: getResolvedRows(tabId, options)
    };
}
```

### 2. `getInstructionSet(tabId)`
Fusiona `recording.data` con `cards[].config`:

```javascript
function getInstructionSet(tabId) {
    const recording = getLoadedRecording(tabId);
    const cards = getTabCards(tabId);
    
    return {
        url: recording.url,
        pages: Object.entries(recording.pages).map(([pageKey, page]) => ({
            pageKey,
            pageNumber: page.pageInfo?.current,
            questions: Object.entries(page.questions).map(([qKey, q]) => {
                const cardConfig = cards.find(c => c.questionKey === qKey)?.config || {};
                return {
                    key: qKey,
                    text: q.text,
                    type: q.type,
                    selenium: q.selenium,           // del .raf
                    options: q.options,             // del .raf
                    timing: cardConfig.timing,      // del usuario
                    strategy: cardConfig.strategy,  // del usuario
                    validation: cardConfig.validation
                };
            }),
            navigation: page.navigation
        }))
    };
}
```

### 3. `getResolvedRows(tabId, options)`
Reutiliza lógica existente de `buildExportData()`:

```javascript
function getResolvedRows(tabId, options) {
    // Misma lógica que buildExportData() líneas 631-769
    // Solo retorna el array de filas resueltas
}
```

---

## Output Esperado: Estructura del `.afpkg`

```json
{
  "meta": {
    "version": "1.0",
    "generatedAt": "2025-12-24T12:00:00Z",
    "sourceExcel": "datos_beneficiarios.xlsx",
    "sourceSheet": "Hoja1",
    "totalRows": 150,
    "filteredRows": 42,
    "tabName": "Formulario Seguimiento"
  },
  
  "instructions": {
    "url": "https://forms.office.com/...",
    "pages": [
      {
        "pageKey": "page_1",
        "pageNumber": 1,
        "questions": [
          {
            "key": "q1",
            "text": "Nombres y Apellidos",
            "type": "text",
            "selenium": {
              "action": "fill",
              "selector": "[aria-labelledby*=\"QuestionId_r8eb...\"][data-automation-id=\"textInput\"]",
              "method": "send_keys"
            },
            "options": [],
            "timing": { "preDelay": 200, "randomize": false },
            "strategy": { "type": "native", "typingSpeed": 30 },
            "validation": { "verifyContent": true }
          },
          {
            "key": "q2",
            "text": "Tipo Documento",
            "type": "choice",
            "selenium": {
              "action": "select",
              "selector": "[role=\"radiogroup\"]",
              "questionId": "r8c033...",
              "method": "click"
            },
            "options": [
              {
                "value": "1 . Cedula de Ciudadania",
                "selenium": {
                  "byValue": "[data-automation-value=\"1 . Cedula de Ciudadania\"]",
                  "method": "click"
                }
              },
              {
                "value": "2 . Tarjeta de Identidad",
                "selenium": {
                  "byValue": "[data-automation-value=\"2 . Tarjeta de Identidad\"]",
                  "method": "click"
                }
              }
            ],
            "timing": { "preDelay": 100, "randomize": true, "minDelay": 50, "maxDelay": 300 },
            "strategy": { "type": "native" }
          }
        ],
        "navigation": {
          "next": { "selector": "[data-automation-id=\"nextButton\"]", "text": "Siguiente" },
          "submit": null
        }
      },
      {
        "pageKey": "page_7",
        "pageNumber": 7,
        "questions": [...],
        "navigation": {
          "next": null,
          "submit": { "selector": "[data-automation-id=\"submitButton\"]", "text": "Enviar" }
        }
      }
    ],
    "postSubmit": {
      "submitAnother": {
        "selector": "[data-automation-id=\"submitAnother\"]",
        "text": "Enviar otra respuesta"
      }
    }
  },
  
  "resolvedRows": [
    {
      "rowIndex": 0,
      "excelRow": 2,
      "filterPasses": true,
      "answers": {
        "q1": "Juan Carlos Pérez",
        "q2": "1 . Cedula de Ciudadania",
        "q3": "123456789",
        "q4": "Profesional de Seguimiento",
        "q10": "1.⁠ ⁠Virtual",
        "q11": "1. SI"
      }
    },
    {
      "rowIndex": 5,
      "excelRow": 7,
      "filterPasses": true,
      "answers": {
        "q1": "María López Gómez",
        "q2": "2 . Tarjeta de Identidad",
        "q3": "987654321",
        "q4": "Operador Regional",
        "q10": "2.⁠ ⁠Presencial",
        "q11": "2. NO"
      }
    }
  ]
}
```

---

## Uso por Script de Selenium

```python
import json

# Cargar paquete
with open("export_20251224.afpkg", "r", encoding="utf-8") as f:
    package = json.load(f)

instructions = package["instructions"]
rows = package["resolvedRows"]

driver.get(instructions["url"])

for row in rows:
    for page in instructions["pages"]:
        for q in page["questions"]:
            answer = row["answers"].get(q["key"])
            if not answer:
                continue
            
            # Aplicar timing
            if q.get("timing", {}).get("preDelay"):
                time.sleep(q["timing"]["preDelay"] / 1000)
            
            # Ejecutar acción
            element = driver.find_element(By.CSS_SELECTOR, q["selenium"]["selector"])
            
            if q["selenium"]["action"] == "fill":
                element.send_keys(answer)
            elif q["selenium"]["action"] == "select":
                option = next(o for o in q["options"] if o["value"] == answer)
                driver.find_element(By.CSS_SELECTOR, option["selenium"]["byValue"]).click()
        
        # Navegación
        if page["navigation"]["next"]:
            driver.find_element(By.CSS_SELECTOR, page["navigation"]["next"]["selector"]).click()
        elif page["navigation"]["submit"]:
            driver.find_element(By.CSS_SELECTOR, page["navigation"]["submit"]["selector"]).click()
    
    # Post-submit: enviar otra
    if instructions.get("postSubmit", {}).get("submitAnother"):
        driver.find_element(By.CSS_SELECTOR, instructions["postSubmit"]["submitAnother"]["selector"]).click()
```

---

## Propuesta de Extensión de Archivo

| Extensión | Nombre Completo | Descripción |
|-----------|-----------------|-------------|
| `.afpkg` | AutoForm Package | Paquete completo de automatización |

**Alternativas:** `.afauto`, `.formbot`, `.autopack`

---

## Notas de Implementación

1. **Excluir `mapping`** de `cards[].config` (ya está resuelto en `answers`)
2. **Ordenar páginas** por `pageNumber` antes de exportar
3. **Incluir solo filas que pasan filtro** en `resolvedRows`
4. **Validar selectores** no vacíos antes de incluir en output
