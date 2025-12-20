# AutoForm Data Architecture: recording.data vs tab.cards

This document explains the data flow architecture used in AutoForm for managing form recordings and user configurations.

---

## 📦 Data Structures

### `recording.data` (Raw File)
The **original content of the `.raf` file** captured via Selenium recording. Contains:
- Form URL
- Pages and questions structure
- Select options
- Selenium selectors

```json
{
  "url": "https://forms.office.com/...",
  "pages": {
    "page_1": {
      "questions": {
        "q1": { "text": "Nombres", "type": "text", "selenium": {...} },
        "q5": { "text": "Tipo Doc", "type": "choice", "options": [...] }
      }
    }
  }
}
```
👉 **Does NOT contain `config`, `response`, or `mapping`** - it's the raw captured structure.

---

### `tab.cards` (User State)
A **simplified array** that stores **user configurations** from the UI:
- Responses (`response`)
- Selected options (`selectedOptions`)
- **Custom configurations (`config`)** ← Includes mapping settings

```javascript
tab.cards = [
  { 
    pageKey: "page_1", 
    questionKey: "q5", 
    config: { 
      mapping: { enabled: true, placeholder: "{TipoDoc}", map: {...} }
    }
  },
  // ...
]
```

---

### `formData` (In-Memory State)
The **combined working copy** in memory while the user is editing. Merges `recording.data` with configurations from `tab.cards`.

---

## 🔄 Data Flow

```
┌─────────────────┐     Load RAF        ┌─────────────────┐
│  recording.data │ ─────────────────▶  │    formData     │
│   (raw file)    │                     │   (in memory)   │
└─────────────────┘                     └────────┬────────┘
                                                 │
                                        User configures
                                         (mapping, etc)
                                                 │
                                                 ▼
┌─────────────────┐     syncToProject   ┌─────────────────┐
│   tab.cards     │ ◀────────────────── │    formData     │
│ (for autosave)  │                     │   (updated)     │
└────────┬────────┘                     └─────────────────┘
         │
         │ Also syncs back to:
         ▼
┌─────────────────┐
│  recording.data │  ← Ensures configs persist in recordings array
│   (updated)     │
└─────────────────┘
```

---

## 📍 Key Locations in Code

| Concept | File | Function |
|---------|------|----------|
| Build cards from formData | `autoform_view.js` | `buildCardsArray()` |
| Sync to project + recording | `autoform_view.js` | `syncToProjectData()` |
| Restore cards on load | `autoform_view.js` | `createAutoFormContent()` |
| Load recording into tab | `autoform_view.js` | `handleLoadRecording()` |

---

## 🔑 Summary

| Structure | Purpose | Persistence |
|-----------|---------|-------------|
| `recording.data` | Original form template | Saved in `projectData.recordings[]` |
| `tab.cards` | User customizations | Saved in `projectData.tabs[].cards` |
| `formData` | Working copy in memory | Not persisted directly |

**Important:** Both `recording.data` AND `tab.cards` must contain the config for proper persistence across UI reloads.
