# EE Cotizador — Estructura Oficial de Rubros EE, Comparador en Columnas y Landing Page de Inicio

Esta actualización alinea el motor de cotización y la interfaz de **EE Cotizador** con la hoja oficial de cálculo de **Estudiantes Embajadores** (como el caso *Verano Grupal UK — Sol Camps Londres y Oxford*), permite al administrador agregar nuevos rubros dinámicos al catálogo, transforma el comparador en una vista de columnas verticales lado a lado (*Opción 1, Opción 2, Opción 3...*) e incorpora una **Landing Page institucional** como puerta de entrada explicativa con inicio de sesión.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Se han incorporado las tres decisiones confirmadas para garantizar fidelidad exacta con la operación de Estudiantes Embajadores:

- **Decisión Confirmada 1 — Captura Bidireccional de Comisión y Precio Final**: En el cierre de cada escenario (*SubTotal 2 → % Comisión → Comisión → Precio Final*), el usuario podrá editar tanto el **% Comisión** (calculando automáticamente la Comisión unitaria/grupal y el Precio Final en divisa y en pesos) como escribir directamente el **Precio Final deseado** (recalculando al instante la Comisión en monto y el `% Comisión` resultante, tal como en el ejemplo donde SubTotal `$4,342.50` + Comisión `$807.50` [18.60%] = Precio Final `$5,150.00` GBP / `$136,475.00` MXN).
- **Decisión Confirmada 2 — Comparador Vertical Completo por Columnas**: Al comparar escenarios (*Opción 1, Opción 2, Opción 3*), cada escenario se presenta como una columna vertical paralela que muestra de arriba hacia abajo: cabecera de divisa/participantes/días, todos los rubros de **Conceptos**, *SubTotal 1*, *Gastos del líder* (`Total Chaperones / Participantes`), *Compensación del líder*, *SubTotal 2*, *% Comisión*, *Comisión (unitaria y grupal)*, **Precio Final en divisa**, **Estimado en pesos (MXN)** y el bloque completo de **Gastos de Chaperones (Escuela vs. EE)**.
- **Decisión Confirmada 3 — Landing Page con Login Dual (Google OAuth + Acceso Demo)**: La aplicación iniciará en una página de presentación ejecutiva que explica el flujo completo de EE Cotizador y ofrece en su encabezado y sección principal tanto el botón **Iniciar Sesión con Google (OAuth)** como **Ingresar al Entorno Operativo Demo**.

---

## 1. Overview & Core Concept

- **Qué Hace**:
  1. **Landing Page Institucional de Inicio**: Presenta el propósito y las capacidades de *EE Cotizador* (Registro de solicitudes, Cotizador multi-escenario con hoja oficial EE, Flujo de aprobaciones con segregación de funciones, Generación de propuestas PDF/Excel sin filtrar costos internos al cliente e Integraciones con XploreTogether, WeTravel y Wissify) antes de ingresar al espacio de trabajo.
  2. **Hoja de Cotización Exacta de Estudiantes Embajadores + Rubros Administrables**: Reproduce fielmente la estructura operativa de dos bloques vinculantes:
     - **Bloque Izquierdo (Conceptos por Participante)**: *Precio Neto*, *Transfer*, *Comidas*, *Kit EE*, *Seguro MSI*, *Promoción*, *Costo envíos Kits*, *Operación*, *Otros gastos* (con etiqueta/nota editable como `avión`), *Comisión Escuela*, *Comisión Coordinadora* **+ cualquier rubro adicional creado por el Administrador** → **SubTotal 1** → *Gastos del líder* (calculado automáticamente como `Total Chaperones / Participantes`) y *Compensación del líder* → **SubTotal 2** → *% Comisión* y *Comisión* (unitaria y total grupal) → **PRECIO FINAL** (en divisa) → **Estimado en pesos** (unitario y total grupal).
     - **Bloque Derecho (Gastos de Chaperones — Escuela vs. EE)**: *Chaperones Escuela* y *Chaperones EE*, *Fondo de Emergencia*, *Gastos por día* (unitario y total por días/chaperones), *Costo chaperón*, *Gastos del Viaje*, *Seguro*, *Transfer*, *Kit*, *Chaperón Extra* → **SubTotal / Chaperón** → **SubTotal Chaperones** + *Fondo Emergencia* → **Total Chaperones**.
  3. **Comparador en Columnas Verticales**: Alinea *Opción 1*, *Opción 2*, *Opción 3*, etc. en columnas contiguas con las filas sincronizadas horizontalmente para facilitar la lectura ejecutiva y la toma de decisiones en segundos.

---

## 2. User Experience & Visual Design

- **Flujos de Usuario Clave**:
  1. ** Flujo de Entrada (Landing Page → Login → Workspace)**: El usuario aterriza en la portada de *EE Cotizador*, revisa el proceso de 4 etapas y hace clic en **Iniciar Sesión** (mediante cuenta institucional Google o acceso inmediato al entorno demostrativo). También puede volver a la portada informativa en cualquier momento.
  2. **Flujo de Cotización estilo Hoja EE**: Dentro de un expediente (incluyendo como ejemplo precargado el caso real **Opción 1 — Verano Grupal UK — Sol Camps Londres y Oxford** con Divisa Libras a `26.5`, `20` participantes y `21` días que arroja exactamente `$5,150.00` GBP y `$136,475.00` MXN), el usuario edita cualquier celda en vivo o cambia entre edición por `% Comisión` y `Precio Final`.
  3. **Flujo de Integración de Nuevos Rubros por el Administrador**: En el panel de **Administración** (y directamente desde el cotizador si tiene rol de Administrador/Finanzas), el administrador puede crear nuevos rubros oficiales indicando su nombre, valor predeterminado, nota opcional y si pertenece a la sección de *Conceptos* o de *Gastos de Chaperones*, integrándose automáticamente en los escenarios y en las filas del comparador por columnas.
  4. **Flujo de Comparación en Columnas**: En la pestaña **Comparativo**, todas las opciones del expediente se despliegan como columnas verticales lado a lado (con encabezado azul marino institucional `#0B3B70` / `#134E6F` inspirado en la hoja de EE), resaltando diferencias en participantes, costos, comisión, precio final en divisa y estimado en pesos.

- **Identidad Visual y Tipografía**:
  - **Estética y Paleta (`60-30-10`)**:
    - `--background`: `#F8FAFC` (lienzo neutro limpio) y `#FFFFFF` para superficies de trabajo.
    - `--primary`: `#0B3B70` (Azul Institucional EE) y `#134E6F` (Azul Petróleo de encabezados de tabla EE).
    - `--accent`: `#BAE6FD` / `#E0F2FE` (destacado celeste suave para la fila de `PRECIO FINAL`, idéntico al formato visual de la hoja de EE) y `#16A34A` para indicadores positivos.
  - **Jerarquía Tipográfica**: `Plus Jakarta Sans` para encabezados y etiquetas; `IBM Plex Mono` con `tabular-nums` obligatorio en todas las celdas monetarias, porcentajes, tipos de cambio y subtotales para garantizar alineación decimal perfecta entre columnas.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Sincronización Matemática Exacta con la Hoja Oficial de EE**
  - *Enfoque Elegido*: Soportar nativamente la estructura de doble subtotal (*SubTotal 1 de Conceptos* + *Gastos/Compensación del Líder proveniente del Total de Chaperones entre Participantes* = *SubTotal 2*) y el cálculo bidireccional entre `% Comisión` y `PRECIO FINAL`.
  - *Por Qué*: Elimina cualquier discrepancia de centavos frente al Excel actual de EE y permite validar inmediatamente el caso *Verano Grupal UK — Sol Camps Londres y Oxford* (`$4,195.00` → `+$147.50` → `$4,342.50` → `+$807.50 [18.60%]` → `$5,150.00` GBP → `$136,475.00` MXN).
- **Decisión 2: Rubros Base Oficiales + Rubros Dinámicos del Administrador**
  - *Enfoque Elegido*: Mantener fijos en orden los rubros oficiales de la hoja de EE y permitir que el Administrador inserte rubros adicionales en el catálogo global o en un expediente específico, los cuales aparecen automáticamente como filas sincronizadas tanto en el cotizador como en el comparador en columnas.
  - *Por Qué*: Garantiza que todas las opciones tengan exactamente los mismos renglones al compararse verticalmente en columnas.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Diagrama de Arquitectura y Componentes**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        EE COTIZADOR — FLUJO DE INICIO                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Landing Page Institucional (Propuesta de Valor + Proceso + Módulos)    │  │
│  │   ├── Botón: Iniciar Sesión con Google (Firebase Auth OAuth Popup)     │  │
│  │   └── Botón: Ingresar al Sistema (Acceso Directo / Demo Interactivo)   │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     MOTOR FINANCIERO OFICIAL EE (v2.0)                       │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Bloque Derecho: Chaperones        │  │ Bloque Izquierdo: Conceptos     │  │
│  │ • Chaperones Escuela vs EE        │  │ • 11 Rubros Base EE + Notas     │  │
│  │ • Fondo Emergencia & Gasto/Día    │  │ • + Rubros Extra Administrador  │  │
│  │ • Viaje, Seguro, Transfer, Kit    │  │ ─────────────────────────────── │  │
│  │ • Chaperón Extra                  │  │ = SubTotal 1 ($4,195.00)        │  │
│  │ ───────────────────────────────── │  │ + Gastos Líder (TotalChap/Part) │  │
│  │ = SubTotal Chaperones ($2,800.00) │─▶│ + Compensación del Líder        │  │
│  │ + Fondo Emergencia ($150.00)      │  │ = SubTotal 2 ($4,342.50)        │  │
│  │ = TOTAL CHAPERONES ($2,950.00)    │  │ + Comisión (% ↔ Precio Final)   │  │
│  └───────────────────────────────────┘  │ = PRECIO FINAL ($5,150.00)      │  │
│                                         │ = Estimado en Pesos ($136,475)  │  │
│                                         └────────────────┬────────────────┘  │
└──────────────────────────────────────────────────────────┼───────────────────┘
                                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│             COMPARADOR MULTICOLUMNA VERTICAL (OPCIÓN 1 | OPCIÓN 2 | ...)     │
│  ┌──────────────────────┬────────────────┬────────────────┬───────────────┐  │
│  │ Rubro / Indicador    │ OPCIÓN 1 (20p) │ OPCIÓN 2 (25p) │ OPCIÓN 3 (30p)│  │
│  ├──────────────────────┼────────────────┼────────────────┼───────────────┤  │
│  │ Divisa / TC / Días   │ Libras · 26.5  │ Libras · 26.5  │ Libras · 26.5 │  │
│  │ Rubros Conceptos...  │ $3,750.00 ...  │ $3,750.00 ...  │ $3,750.00 ... │  │
│  │ SubTotal 1           │ $4,195.00      │ $4,195.00      │ $4,195.00     │  │
│  │ Gastos del Líder     │ $147.50        │ $118.00        │ $145.00       │  │
│  │ SubTotal 2           │ $4,342.50      │ $4,313.00      │ $4,340.00     │  │
│  │ % Comisión / Monto   │ 18.60% ($807.5)│ 18.60% ($802.2)│ 18.60% ($807) │  │
│  │ PRECIO FINAL         │ $5,150.00      │ $5,115.22      │ $5,147.24     │  │
│  │ Estimado en Pesos    │ $136,475.00    │ $135,553.33    │ $136,401.86   │  │
│  │ Bloque Chaperones... │ $2,950.00      │ $2,950.00      │ $4,350.00     │  │
│  └──────────────────────┴────────────────┴────────────────┴───────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Mapeo de Interacciones y Estado**:
  - **Edición en Hoja de Escenario**: Modificar cualquier rubro de Conceptos, nota (ej. `avión`), gasto de chaperones, número de participantes/días o divisa recalcula instantáneamente *SubTotal 1*, *Gastos del líder*, *SubTotal 2*, *Comisión* (unitaria y grupal), *Precio Final* y *Estimado en pesos* (unitario y grupal).
  - **Modo Bidireccional `% Comisión ↔ Precio Final`**: Si el usuario edita el `% Comisión`, se calcula `Comisión = SubTotal2 * (%Comisión / 100)` y `Precio Final = SubTotal2 + Comisión`. Si el usuario edita directamente el `Precio Final`, se calcula `Comisión = Precio Final - SubTotal2` y `% Comisión = (Comisión / SubTotal2) * 100`.
  - **Catálogo de Rubros del Administrador**: Al agregar un nuevo rubro desde Administración o desde el botón `+ Integrar Nuevo Rubro (Admin)` en el cotizador, se añade a la plantilla maestra y aparece en todos los escenarios y en las filas del comparador multicolumna.
