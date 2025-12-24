# Análisis de Preguntas: APROBADOS-intermed.raf

Este documento contiene el desglose de las preguntas extraídas del archivo de grabación `APROBADOS-intermed.raf`, organizado por páginas y tipos de datos.

## Estructura del Formulario

### Página 1
1. **Pregunta 1**
   - **Texto:** Nombres y Apellidos Psicosocial
   - **Tipo:** fill (text)
   - **Requisito:** Obligatoria

2. **Pregunta 2**
   - **Texto:** Número de Documento del/la Psicosocial
   - **Tipo:** fill (text)
   - **Requisito:** Obligatoria, **Solo Números**

3. **Pregunta 3**
   - **Texto:** Número de Tarjeta Profesional del/la Psicosocial
   - **Tipo:** fill (text)
   - **Requisito:** Obligatoria

---

### Página 2
4. **Pregunta 4**
   - **Texto:** Nombres y Apellidos del beneficiario/a
   - **Tipo:** fill (text)
   - **Requisito:** Obligatoria

5. **Pregunta 5**
   - **Texto:** Tipo Documento del/la beneficiario/a
   - **Tipo:** select (choice)
   - **Requisito:** Obligatoria
   - **Opciones:**
     - 1 . Cedula de Ciudadania
     - 2 . Tarjeta de Identidad
     - 3 . Cedula de Extranjeria
     - 9 . Permiso de Proteccion Temporal
     - 99. Contraseña 

6. **Pregunta 6**
   - **Texto:** Número de Documento del/la Beneficiario/a
   - **Tipo:** fill (text)
   - **Requisito:** Obligatoria, **Solo Números**

7. **Pregunta 7**
   - **Texto:** Ruta del beneficiario
   - **Tipo:** select (choice)
   - **Requisito:** Obligatoria
   - **Opciones:**
     - 1. Curso Corto
     - 2. EPJA
     - 3. Superior - EFT
     - 4. Superior - Tecnico
     - 5. Superior - Teconologo
     - 6. Superior - Superior

---

### Página 3
8. **Pregunta 8**
   - **Texto:** Seleccione el tipo de seguimiento psicosocial
   - **Tipo:** select (choice)
   - **Requisito:** Obligatoria
   - **Opciones:**
     - 1. Proyecto de Vida
     - 2. Trayectoria de Formacion
     - 3. Actividades Complementarias
     - 4. Intermediación laboral 
     - 5. Seguimiento a nivel de riesgo

---

### Página 12
9. **Pregunta 9**
   - **Texto:** Contacto Presencial- Virtual (Si/No)
   - **Tipo:** select (choice)
   - **Requisito:** Obligatoria
   - **Especial:** **BRANCH** (Ramificación)
   - **Opciones:**
     - 1. Virtual (Activa ramas)
     - 2. Presencial
     - 3. Hibrido (Activa ramas)
     - 4. No contactado (Activa rama específica)

10. **Pregunta 10**
    - **Texto:** Contacto Telefónico (Si/No)
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Opciones:** [1. SI, 2. NO]

11. **Pregunta 11**
    - **Texto:** Operador que brinda la Intermediación al/a Joven
    - **Tipo:** fill (text)
    - **Requisito:** Obligatoria

12. **Pregunta 12**
    - **Texto:** ¿El/la joven desistió del proceso de intermediación laboral?
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Especial:** **BRANCH**
    - **Opciones:**
      - 1. SI
      - 2. NO (Activa ramas)

13. **Pregunta 13**
    - **Texto:** ¿El/la joven presentó inconvenientes para registrarse en la plataforma de empleo del operador o entidad con quien se encuentra realizando el proceso de Intermediación Laboral?
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Especial:** **BRANCH**
    - **Opciones:**
      - 1. SI
      - 2. NO (Activa ramas)

14. **Pregunta 14**
    - **Texto:** ¿El/la joven participó de las sesiones de habilidades blandas?
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Especial:** **BRANCH**
    - **Opciones:**
      - 1. SI (Activa ramas)
      - 2. NO

15. **Pregunta 15**
    - **Texto:** ¿En qué modalidad tomó las sesiones de habilidades blandas? (Virtual/Presencial/3. Hibrido)
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Opciones:** [1. Virtual, 2. Presencial, 3. Hibrido]

16. **Pregunta 16**
    - **Texto:** ¿Los temas abordados en las sesiones de habilidades blandas fueron de interés del /la joven?
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Opciones:** [1. SI, 2. NO]

17. **Pregunta 17**
    - **Texto:** Concepto Psicosocial U Observaciones: Describa el proceso de desarrollo de las sesiones de habilidades blandas.
    - **Tipo:** fill (long_text)
    - **Requisito:** Obligatoria

18. **Pregunta 18**
    - **Texto:** ¿El/la joven realizó alguna autopostulación en vacantes laborales a través de la Plataforma?
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Opciones:** [1. SI, 2. NO]

19. **Pregunta 19**
    - **Texto:** ¿El/la joven participó en ferias de empleo?
    - **Tipo:** select (choice)
    - **Requisito:** Obligatoria
    - **Opciones:** [1. SI, 2. NO]

20. **Pregunta 20**
    - **Texto:** Concepto Psicosocial U Observaciones: Describa el proceso de autopostulación y ferias de empleo del joven durante el proceso de intermediación laboral.
    - **Tipo:** fill (long_text)
    - **Requisito:** Obligatoria

21. **Pregunta 21**
    - **Texto:** ¿El beneficiario solicita actualización de datos personales ?
    - **Tipo:** select (choice)
    - **Requisito:** Opcional
    - **Opciones:** [1. SI, 2. NO]

---
**Nota Técnica:** El formulario grabado muestra un salto directo de la página 3 a la 12, lo que indica que las preguntas de la 9 a la 21 se encuentran lógicamente agrupadas en la página 12 o se activaron mediante lógica de saltos (skip logic).
