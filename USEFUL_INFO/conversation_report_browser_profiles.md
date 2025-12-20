# Reporte de Planificación - Sistema de Perfiles de Navegador

Este documento resume las decisiones de arquitectura y diseño tomadas durante la sesión de planificación del sistema de perfiles.

**Fecha**: 2025-12-20
**Estado**: Planificación completada. Implementación pendiente (pausada por solicitud del usuario).

---

## 1. Análisis Inicial y Limpieza

### Eliminación de Firefox
- **Hecho**: Se eliminó Firefox de `browsers_config.json`.
- **Razón**: Firefox usa motor Gecko, el cual es incompatible con `undetected-chromedriver` (library core del proyecto, diseñada solo para Chromium).
- **Resultado**: El sistema ahora soporta exclusivamente navegadores Chromium: Brave, Chrome, Edge, Ungoogled Chromium.

---

## 2. Arquitectura de Configuración Dual

Se diseñó una arquitectura que separa la definición de configuraciones (defaults), la persistencia (archivo usuario) y la ejecución (runtime).

### Componentes:

1.  **`browser_settings.py` (Fuente de Verdad)**:
    -   Contiene definiciones estáticas en Python.
    -   Perfiles predefinidos (`EFFICIENCY_PROFILES`).
    -   Mapeo de argumentos Chrome (`CHROME_ARGS_MAPPING`).
    -   **No se modifica** en tiempo de ejecución.

2.  **`browser_config.json` (Persistencia / Autosave)**:
    -   Ubicado en la carpeta de datos del usuario (`AppData`).
    -   Almacena las preferencias del usuario editadas desde la UI.
    -   Sirve para restaurar el estado de la UI al abrir la aplicación.

3.  **UI -> Bridge -> Manager (Ejecución)**:
    -   **Decisión Clave**: Para evitar "race conditions" (guardar archivo vs leer archivo), la UI envía el diccionario de configuración **actual** directamente al comando `launch_browser`.
    -   Python recibe este diccionario, instancia `BrowserConfig` y lanza el navegador inmediatamente.
    -   Esto asegura que lo que ve el usuario en la UI es exactamente lo que se ejecuta.

---

## 3. Sistema de Perfiles y Flags

Se decidió no mezclar "Eficiencia" y "Seguridad" en los mismos perfiles.

### Perfiles de Eficiencia (Rendimiento de Máquina)
Nombres definitivos acordados:

1.  **`normal`**: Sin optimizaciones. Máxima compatibilidad. Carga imágenes y animaciones.
2.  **`balanced`**: Optimización moderada (e.g., sin sync, sin translate).
3.  **`efficiency`** (**Recomendado**): Máxima eficiencia sin sacrificar la validación visual (mantiene imágenes, reduce logs/background processes).
4.  **`extreme`**: Máxima eficiencia absoluta. Sin imágenes, sin animaciones, sin GPU. Difícil validación visual.

### Anti-Detección (Flags Individuales)
En lugar de "perfiles de seguridad", se usan flags configurables que están **habilitados por defecto**:

-   `anti_detection_enabled`: Base flags (hide automation).
-   `mock_webdriver`: Oculta `navigator.webdriver`.
-   `exclude_automation_switches`: Excluye flags que delatan automatización.
-   `randomize_window_size`: Evita fingerprints por tamaño exacto.
-   `disable_webrtc_leak`: Protege IP real.

---

## 4. Próximos Pasos (Implementación)

Cuando se reanude el trabajo, se debe ejecutar el archivo `browser_profiles_implementation_plan.md` ubicado en esta misma carpeta.

**Checklist pendiente:**
1. Crear `src/core/browser_automation/browser_settings.py` con el código detallado.
2. Modificar `browser_manager.py` para consumir la nueva configuración.
3. Crear handlers en el Bridge para guardar/cargar JSON y lanzar con dict.
