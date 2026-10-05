# Frontend UI/UX Design Skill

Guía profesional para interfaces web y móviles.

## Stack preferido

- **Tailwind CSS** para utilidades; tokens de diseño centralizados (color, spacing, radius, shadow).
- **Radix UI / shadcn-ui** para primitivas accesibles (Dialog, Popover, Tabs, Dropdown, Tooltip). Nunca reimplementes foco/ARIA a mano.
- **Framer Motion** para transiciones y microinteracciones; respeta `prefers-reduced-motion`.

## Principios mobile-first

1. Diseña primero el layout de 360–430 px y escala con breakpoints (`sm/md/lg`).
2. Objetivos táctiles ≥ 44 px; espaciado entre acciones ≥ 8 px.
3. Una acción primaria por pantalla; jerarquía por tamaño, peso y color, no por bordes.
4. Estados obligatorios: loading (skeleton), empty, error y success.
5. Contraste WCAG AA mínimo; no comuniques estados solo por color.

## Dashboards y visualización de datos

- Jerarquía: KPI → tendencia → desglose. Nunca más de 5 KPIs arriba.
- Gráficos: líneas para series temporales, barras para comparación, sparklines para tendencia.
- Formatea números (moneda, %, abreviaturas K/M) y muestra unidades en el eje, no en cada valor.
- Accesibilidad: tablas de datos equivalentes y `aria-describedby` en gráficos.

## Rendimiento

- Code-splitting por ruta; imágenes `loading="lazy"` y `srcset`.
- Evita layout shift: define dimensiones/aspect-ratio.
- Optimiza fuentes (`font-display: swap`, subset).
