-- =========================================================
-- Consultas del Sistema (05-consultas.sql)
-- Consultas SQL para reportes, seguimiento de proyectos,
-- desgloses de componentes, stock y proveedores.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ¿Cuáles son los proyectos activos?
-- Devuelve la lista de proyectos en estado 'EN_PROGRESO' que se encuentran activos.
-- ---------------------------------------------------------
SELECT 
    proyecto_id,
    nombre,
    estado,
    fecha_inicio,
    fecha_fin
FROM proyectos
WHERE active = TRUE 
  AND estado = 'EN_PROGRESO'
ORDER BY proyecto_id ASC;


-- ---------------------------------------------------------
-- 2. ¿Dónde se encuentra la última versión del archivo x?
-- Busca la ubicación física/S3 de la última versión registrada para un archivo específico
-- (se puede filtrar por archivo_id o por nombre del archivo).
-- ---------------------------------------------------------
SELECT 
    a.archivo_id,
    a.nombre AS nombre_archivo,
    a.estado AS estado_archivo,
    av.version_id,
    av.fecha AS fecha_version,
    av.ubicacion AS ubicacion_fisica,
    u.mail AS subido_por
FROM archivos a
JOIN archivo_version av ON a.archivo_id = av.archivo_id
LEFT JOIN usuarios u ON av.user_id = u.user_id
WHERE a.archivo_id = 3 -- Reemplazar con el ID del archivo deseado (o: a.nombre ILIKE '%Pinon%')
ORDER BY av.fecha DESC, av.version_id DESC
LIMIT 1;


-- ---------------------------------------------------------
-- 3. ¿Qué componentes (desglosados) se requieren para llevar a cabo el proyecto x?
-- Utiliza una consulta recursiva (CTE) para desglosar la estructura completa de partes
-- y subpartes (BOM - Bill of Materials) multiplicando las cantidades en cada nivel.
-- Se filtra `es_ensamble = FALSE` al final para obtener únicamente las partes/insumos
-- individuales y evitar la doble contabilización de los ensambles.
-- ---------------------------------------------------------
WITH RECURSIVE desglose AS (
    -- Nivel inicial: partes directamente asignadas al proyecto
    SELECT 
        pp.proyecto_id,
        p.parte_id,
        p.nombre AS parte_nombre,
        p.unidad,
        p.categoria,
        p.es_ensamble,
        p.es_comercial,
        pp.cantidad::NUMERIC AS cantidad_requerida,
        1 AS nivel,
        ARRAY[p.parte_id] AS ruta
    FROM proyecto_parte pp
    JOIN partes p ON pp.parte_id = p.parte_id
    WHERE pp.proyecto_id = 3 -- Reemplazar con el ID del proyecto deseado

    UNION ALL

    -- Nivel recursivo: desglose de los ensambles en subpartes (solo si el elemento padre es ensamble)
    SELECT 
        d.proyecto_id,
        sub.parte_id,
        sub.nombre AS parte_nombre,
        sub.unidad,
        sub.categoria,
        sub.es_ensamble,
        sub.es_comercial,
        (d.cantidad_requerida * pm.cantidad::NUMERIC),
        d.nivel + 1 AS nivel,
        d.ruta || sub.parte_id
    FROM desglose d
    JOIN parte_parte pm ON d.parte_id = pm.padre_id
    JOIN partes sub ON pm.hijo_id = sub.parte_id
    WHERE d.es_ensamble = TRUE -- Solo desglosar si el padre es un ensamble
      AND NOT (sub.parte_id = ANY(d.ruta)) -- Control para evitar bucles infinitos
)
SELECT 
    parte_id,
    parte_nombre,
    unidad,
    categoria,
    es_ensamble,
    es_comercial,
    SUM(cantidad_requerida) AS cantidad_total_requerida
FROM desglose
WHERE es_ensamble = FALSE -- Filtrar ensambles para evitar doble contabilización con sus subpartes
GROUP BY parte_id, parte_nombre, unidad, categoria, es_ensamble, es_comercial
ORDER BY parte_id ASC;


-- ---------------------------------------------------------
-- 4. ¿Qué componentes faltan para llevar a cabo el proyecto x?
-- Calcula la cantidad total requerida de cada componente (vía CTE recursiva)
-- y la contrasta contra el stock disponible actual, filtrando solo aquellas partes
-- cuya cantidad requerida sea superior a la cantidad en stock.
-- ---------------------------------------------------------
WITH RECURSIVE desglose AS (
    SELECT 
        pp.proyecto_id,
        p.parte_id,
        p.nombre AS parte_nombre,
        p.unidad,
        p.es_ensamble,
        pp.cantidad::NUMERIC AS cantidad_requerida,
        ARRAY[p.parte_id] AS ruta
    FROM proyecto_parte pp
    JOIN partes p ON pp.parte_id = p.parte_id
    WHERE pp.proyecto_id = 3 -- Reemplazar con el ID del proyecto deseado

    UNION ALL

    SELECT 
        d.proyecto_id,
        sub.parte_id,
        sub.nombre AS parte_nombre,
        sub.unidad,
        sub.es_ensamble,
        (d.cantidad_requerida * pm.cantidad::NUMERIC),
        d.ruta || sub.parte_id
    FROM desglose d
    JOIN parte_parte pm ON d.parte_id = pm.padre_id
    JOIN partes sub ON pm.hijo_id = sub.parte_id
    WHERE d.es_ensamble = TRUE
      AND NOT (sub.parte_id = ANY(d.ruta))
),
requeridos AS (
    SELECT 
        parte_id,
        parte_nombre,
        unidad,
        SUM(cantidad_requerida) AS cantidad_requerida
    FROM desglose
    WHERE es_ensamble = FALSE
    GROUP BY parte_id, parte_nombre, unidad
)
SELECT 
    r.parte_id,
    r.parte_nombre,
    r.unidad,
    r.cantidad_requerida,
    COALESCE(s.cantidad, 0) AS cantidad_en_stock,
    GREATEST(0, r.cantidad_requerida - COALESCE(s.cantidad, 0)) AS cantidad_faltante
FROM requeridos r
LEFT JOIN stock s ON r.parte_id = s.parte_id
WHERE r.cantidad_requerida > COALESCE(s.cantidad, 0)
ORDER BY r.parte_id ASC;


-- ---------------------------------------------------------
-- 5. ¿Dónde puedo comprar la parte x?
-- Muestra la información de proveedores y cotizaciones registradas para una parte,
-- ordenados de menor a mayor precio.
-- ---------------------------------------------------------
SELECT 
    p.parte_id,
    p.nombre AS parte_nombre,
    pr.proveedor_id,
    COALESCE(pr.dependencia, per.nombre || ' ' || per.apellido) AS proveedor_nombre,
    per.telefono AS telefono_contacto,
    per.direccion_pais,
    per.direccion_provincia,
    per.direccion_ciudad,
    per.direccion_calle,
    per.direccion_numero,
    pp.monto AS precio_cotizado,
    pp.fecha AS fecha_cotizacion,
    pp.metadata
FROM proveedor_parte pp
JOIN partes p ON pp.parte_id = p.parte_id
JOIN proveedores pr ON pp.proveedor_id = pr.proveedor_id
JOIN personas per ON pr.persona_id = per.persona_id
WHERE p.parte_id = 6 -- Reemplazar con el ID de la parte deseada (o: p.nombre ILIKE '%Pinon%')
ORDER BY pp.monto ASC;


-- ---------------------------------------------------------
-- 6. ¿Qué archivos asociados tiene la parte x?
-- Obtiene los archivos vinculados a una parte junto con la información de su versión actual y ubicación.
-- ---------------------------------------------------------
SELECT 
    p.parte_id,
    p.nombre AS parte_nombre,
    a.archivo_id,
    a.nombre AS archivo_nombre,
    a.descripcion AS archivo_descripcion,
    a.estado AS archivo_estado,
    av.version_id,
    av.ubicacion AS ubicacion_archivo,
    av.fecha AS fecha_version
FROM parte_archivo pa
JOIN partes p ON pa.parte_id = p.parte_id
JOIN archivos a ON pa.archivo_id = a.archivo_id
LEFT JOIN archivo_version av ON a.version_id = av.version_id
WHERE p.parte_id = 8 -- Reemplazar con el ID de la parte deseada (o: p.nombre ILIKE '%Portarodamiento%')
ORDER BY a.archivo_id ASC;
