# Plan de Implementación: Sistema de Mapeo para Tarjetas de Texto

## 🎯 Objetivo
Habilitar la funcionalidad de "Mapeo Condicional" en tarjetas de tipo **Texto**.
Esto permite definir reglas lógicas basadas en el valor de una columna de Excel para determinar qué texto escribir en el formulario.

**Caso de Uso Ejemplo:**
*   **Columna Excel:** `Modalidad` (Valores: "Virtual", "Presencial")
*   **Lógica:**
    *   Si es "Virtual" → Escribir `[[Concepto_Texto_Virtual]]`
    *   Si es "Presencial" → Escribir `[[Concepto_Texto_Presencial]]`
    *   Si es otro → Escribir "Dato no disponible" o el valor directo `{Modalidad}`.

---

## ⚙️ Análisis de Viabilidad

### ¿Es posible mapear a Conceptos/Placeholders?
**SÍ.**
El sistema de llenado (`auto_fill_logic`) actualmente procesa el texto antes de escribirlo.
La implementación funcionará así:
1.  El sistema detecta que el mapeo está activo.
2.  Busca el valor de la fila actual (ej. "Virtual").
3.  Recupera el "Valor Destino" del mapa (ej. "[[Concepto_Texto_Virtual]]").
4.  **Paso Clave:** El "Valor Destino" se pasa por el procesador de placeholders (`processPlaceholders`).
5.  El resultado final (el texto del concepto ya resuelto) es lo que se envía a Selenium.

---

## 🏗️ Arquitectura de Datos

Reutilizaremos la estructura `config` existente para mantener consistencia y persistencia automática.

**Estructura del Objeto `config`:**
```javascript
{
    mapping: {
        enabled: true,           // Activado/Desactivado
        sourcePlaceholder: "{Modalidad}", // Columna origen (Trigger)
        defaultValue: "",        // Valor si no hay coincidencia
        map: {
            "Virtual": "[[Concepto_Virtual]]",    // Valor Excel -> Texto a escribir
            "Presencial": "[[Concepto_Presencial]]",
            "Híbrido": "Texto fijo personalizado"
        }
    }
}
```

---

## 📋 Hoja de Ruta de Implementación

### 1. Modificar `action_config_modal.js` (Interfaz)
Actualmente, el modal detecta si es `select` para mostrar la UI de mapeo. Debemos expandirlo para types de texto.

*   **Detección de Tipo:** Habilitar sección de mapeo si `type === 'text' || type === 'text (number)'`, etc.
*   **UI de Configuración:**
    *   **Lado Izquierdo (Origen):** Igual que ahora (Lista de valores únicos del Excel).
    *   **Lado Derecho (Destino):**
        *   *Actual (Select):* Dropdown con opciones del formulario.
        *   *Nuevo (Texto):* Input de texto libre (`<input type="text">`).
*   **Soporte de Chips:** Los inputs del lado derecho deben permitir escribir `[[` o `{` para activar el autocompletado de conceptos/variables (si es posible, o al menos permitir escribir el texto raw).

### 2. Modificar `autoform_view.js` (Lógica de Ejecución)
Actualizar la función que calcula el valor a rellenar (probablemente dentro de la lógica de `fill` o `calculateValue`).

*   **Flujo Nuevo:**
    1.  Verificar `config.mapping.enabled`.
    2.  Resolver el valor de la columna origen (`sourcePlaceholder`) usando la fila actual.
    3.  Buscar ese valor en `config.mapping.map`.
    4.  Si existe coincidencia -> Usar ese valor.
    5.  Si no existe -> Usar `defaultValue` u original.
    6.  **Importante:** Tomar el valor resultante y procesarlo de nuevo para resolver cualquier placeholder (`[[...]]` o `{...}`) que contenga.

### 3. Modificar `autoform_view.js` (Visualización - Vista Previa)
*   Actualizar la vista de tarjetas (Modo VIEW) para mostrar el chip de mapeo en tarjetas de texto (similar a lo que acabamos de arreglar para Select).
*   Mostrar: `Mapeado: {Columna} → Valor_Resultante`

---

## ⚠️ Puntos de Atención
*   **Tipos de Datos:** Asegurar que números en Excel se traten como strings para el mapeo (ej. "1" vs 1).
*   **Inputs Vacíos:** Decidir qué pasa si el target está vacío (¿No escribir nada? ¿Borrar campo?).
*   **Persistencia:** Dado el fix anterior, esto debería funcionar automáticamente, pero verificaremos que `handleSave` capture correctamente los inputs de texto del mapa.
