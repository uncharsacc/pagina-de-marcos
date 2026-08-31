---
name: optimize-comparar
description: Optimiza la velocidad de la comparación visual de marcos en index.html (prioridad máxima). También revisa consistencia de header en cotizar.html/probar.html y estructura general. Usar cuando el usuario diga que comparar/comprar está lento, o pida optimizar la búsqueda por foto.
---

# Skill: Optimizar Comparación + Estructura

Eres un experto en rendimiento frontend y arquitectura de SPAs de catálogo visual.

## Objetivo principal
Hacer que la **comparación por foto** sea lo más rápida posible, sin romper la fórmula/lógica de similitud actual (funciona bien).

## Prioridades (en este orden estricto)
1. Velocidad real de la comparación (tiempo desde "Buscar similares" hasta ver resultados)
2. No cambiar el resultado de la fórmula de comparación a menos que mejore claramente precisión Y velocidad
3. Mantener la estética actual (colores oro rosado / carbón)
4. Consistencia de header y navegación entre páginas
5. Limpieza de código solo si no afecta rendimiento

## Análisis obligatorio antes de tocar código

1. Lee completo:
   - index.html (especialmente la clase App y todo el flujo de subida → crop → comparación → resultados)
   - datos-imagenes.js
   - Cualquier archivo de catálogo frontal (catalogo_frontal.json o similar)
   - cotizar.html y probar.html (solo la parte del header)

2. Identifica el cuello de botella real:
   - ¿El algoritmo de comparación de imágenes es pesado?
   - ¿Se procesan demasiadas imágenes de forma secuencial?
   - ¿Se usa canvas/getImageData de forma ineficiente?
   - ¿Hay re-renders masivos con innerHTML + muchas animaciones?
   - ¿Se vuelve a comparar cuando se abre el modal? (ya hay lógica para evitarlo, verificar que se respete)
   - ¿Falta Web Worker para el trabajo pesado?
   - ¿Se cargan todas las imágenes del catálogo de golpe?

3. Mide conceptualmente el flujo:
   Subir foto → Cropper → Extraer features/frontal → Comparar contra N items → Ordenar → Renderizar cards

## Optimizaciones permitidas y recomendadas

### Alto impacto (hazlas primero)
- Mover el cálculo pesado de comparación a un **Web Worker** si es posible
- Cachear resultados de comparación por hash de la imagen subida
- Limitar el número de items que se comparan realmente (top candidatos primero)
- Evitar getImageData / pixel loops innecesarios en el hilo principal
- Pre-cargar o tener los frontales ya procesados
- Usar DocumentFragment o actualizar el DOM de forma más eficiente al mostrar resultados
- Quitar o reducir animaciones staggered (animation-delay) cuando hay muchos resultados

### Medio impacto
- Debounce en búsquedas de texto
- Lazy load real de imágenes de resultados
- No regenerar todo el grid si solo se filtra
- Verificar que `ultimosResultadosFoto` se reutilice correctamente en el modal (no recomparar)

### Bajo impacto / solo si sobra tiempo
- Limpieza de código duplicado
- Mejorar comentarios
- Unificar header entre index / cotizar / probar

## Sobre separar el catálogo a otro HTML
- **No lo hagas ahora** a menos que el usuario lo pida explícitamente.
- La lentitud actual no se soluciona separando archivos.
- Primero optimiza la comparación. Después se puede hablar de arquitectura.

## Header de cotizar.html y probar.html
- Revisa si les falta el header completo con logo + nav (Catálogo / Buscar por foto / etc.).
- Si falta, propón y aplica el mismo header de index.html de forma consistente, manteniendo el botón "Volver" si es necesario.

## Forma de trabajar
1. Primero explica qué encontraste que es lento y por qué.
2. Propón los cambios concretos.
3. Aplica los cambios.
4. Al final da un resumen claro:
   - Qué era lento
   - Qué se cambió
   - Qué se espera de mejora de velocidad
   - Si quedó algo pendiente

## Reglas estrictas
- No rompas la fórmula de comparación actual.
- No cambies colores ni diseño visual salvo que sea necesario para rendimiento.
- No inventes archivos nuevos innecesarios.
- Si necesitas tocar varios archivos, hazlo de forma limpia.
- Pregunta solo si hay una decisión de producto importante (ejemplo: limitar a top 30 resultados vs mostrar todos).