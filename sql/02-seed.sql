-- =========================================================
-- Seed Script: Import Mock Data from CSV Files
-- Automatically executed on container startup
-- =========================================================

-- 1. usuarios
COPY usuarios(user_id, mail, password, active, rol)
FROM '/docker-entrypoint-initdb.d/csv/usuarios.csv'
DELIMITER ',' CSV HEADER;

-- 2. personas
COPY personas(persona_id, nombre, apellido, telefono, direccion_pais, direccion_provincia, direccion_ciudad, direccion_calle, direccion_numero, cuit, user_id, active)
FROM '/docker-entrypoint-initdb.d/csv/personas.csv'
DELIMITER ',' CSV HEADER;

-- 3. empleados
COPY empleados(empleado_id, fecha_de_alta, sueldo, puesto, persona_id, active)
FROM '/docker-entrypoint-initdb.d/csv/empleados.csv'
DELIMITER ',' CSV HEADER;

-- 4. clientes
COPY clientes(cliente_id, dependencia, fecha_de_alta, persona_id, active)
FROM '/docker-entrypoint-initdb.d/csv/clientes.csv'
DELIMITER ',' CSV HEADER;

-- 5. proveedores
COPY proveedores(proveedor_id, dependencia, fecha_de_alta, persona_id, active)
FROM '/docker-entrypoint-initdb.d/csv/proveedores.csv'
DELIMITER ',' CSV HEADER;

-- 6. proyectos
COPY proyectos(proyecto_id, fecha_inicio, fecha_fin, nombre, estado, active)
FROM '/docker-entrypoint-initdb.d/csv/proyectos.csv'
DELIMITER ',' CSV HEADER;

-- 7. proyecto_persona
COPY proyecto_persona(persona_id, proyecto_id, rol)
FROM '/docker-entrypoint-initdb.d/csv/proyecto_persona.csv'
DELIMITER ',' CSV HEADER;

-- 8. partes
COPY partes(parte_id, nombre, unidad, categoria, es_ensamble, es_comercial, metadata)
FROM '/docker-entrypoint-initdb.d/csv/partes.csv'
DELIMITER ',' CSV HEADER;

-- 9. parte_parte
COPY parte_parte(padre_id, hijo_id, cantidad)
FROM '/docker-entrypoint-initdb.d/csv/parte_parte.csv'
DELIMITER ',' CSV HEADER;

-- 10. stock
COPY stock(parte_id, cantidad)
FROM '/docker-entrypoint-initdb.d/csv/stock.csv'
DELIMITER ',' CSV HEADER;

-- 11. stock_movimientos
COPY stock_movimientos(movimiento_id, cantidad, parte_id, fecha, user_id)
FROM '/docker-entrypoint-initdb.d/csv/stock_movimientos.csv'
DELIMITER ',' CSV HEADER;

-- 12. proveedor_parte
COPY proveedor_parte(proveedor_id, parte_id, responsable, fecha, monto, metadata)
FROM '/docker-entrypoint-initdb.d/csv/proveedor_parte.csv'
DELIMITER ',' CSV HEADER;

-- 13. proyecto_parte
COPY proyecto_parte(proyecto_id, parte_id, cantidad)
FROM '/docker-entrypoint-initdb.d/csv/proyecto_parte.csv'
DELIMITER ',' CSV HEADER;

-- 14. ingresos
COPY ingresos(ingreso_id, monto, fecha, descripcion, empleado_id, cliente_id, proyecto_id)
FROM '/docker-entrypoint-initdb.d/csv/ingresos.csv'
DELIMITER ',' CSV HEADER;

-- 15. egresos
COPY egresos(egreso_id, monto, fecha, descripcion, empleado_id, proveedor_id, proyecto_id)
FROM '/docker-entrypoint-initdb.d/csv/egresos.csv'
DELIMITER ',' CSV HEADER;

-- 16. documentos
COPY documentos(documento_id, nombre, descripcion, version_id, estado, acceso, metadata)
FROM '/docker-entrypoint-initdb.d/csv/documentos.csv'
DELIMITER ',' CSV HEADER;

-- 17. proyecto_documento
COPY proyecto_documento(proyecto_id, documento_id)
FROM '/docker-entrypoint-initdb.d/csv/proyecto_documento.csv'
DELIMITER ',' CSV HEADER;

-- 18. documento_version
COPY documento_version(version_id, documento_id, fecha, user_id, ubicacion)
FROM '/docker-entrypoint-initdb.d/csv/documento_version.csv'
DELIMITER ',' CSV HEADER;

-- Update foreign keys for latest version in documentos
UPDATE documentos SET version_id = 1 WHERE documento_id = 1;
UPDATE documentos SET version_id = 2 WHERE documento_id = 2;

-- 19. fragmentos
-- COPY fragmentos(fragmento_id, documento_id, numero, contenido, modelo_embedding, embedding)
-- FROM '/docker-entrypoint-initdb.d/csv/fragmentos.csv'
-- DELIMITER ',' CSV HEADER;

-- 20. archivos
COPY archivos(archivo_id, nombre, descripcion, version_id, estado, metadata)
FROM '/docker-entrypoint-initdb.d/csv/archivos.csv'
DELIMITER ',' CSV HEADER;

-- 21. archivo_version
COPY archivo_version(version_id, archivo_id, fecha, user_id, ubicacion)
FROM '/docker-entrypoint-initdb.d/csv/archivo_version.csv'
DELIMITER ',' CSV HEADER;

-- Update foreign keys for latest version in archivos
UPDATE archivos SET version_id = 1 WHERE archivo_id = 1;
UPDATE archivos SET version_id = 2 WHERE archivo_id = 2;

-- 22. parte_archivo
COPY parte_archivo(parte_id, archivo_id)
FROM '/docker-entrypoint-initdb.d/csv/parte_archivo.csv'
DELIMITER ',' CSV HEADER;

-- =========================================================
-- Synchronize Serial Sequences
-- =========================================================
SELECT setval(pg_get_serial_sequence('usuarios', 'user_id'), COALESCE(MAX(user_id), 1)) FROM usuarios;
SELECT setval(pg_get_serial_sequence('personas', 'persona_id'), COALESCE(MAX(persona_id), 1)) FROM personas;
SELECT setval(pg_get_serial_sequence('empleados', 'empleado_id'), COALESCE(MAX(empleado_id), 1)) FROM empleados;
SELECT setval(pg_get_serial_sequence('clientes', 'cliente_id'), COALESCE(MAX(cliente_id), 1)) FROM clientes;
SELECT setval(pg_get_serial_sequence('proveedores', 'proveedor_id'), COALESCE(MAX(proveedor_id), 1)) FROM proveedores;
SELECT setval(pg_get_serial_sequence('proyectos', 'proyecto_id'), COALESCE(MAX(proyecto_id), 1)) FROM proyectos;
SELECT setval(pg_get_serial_sequence('partes', 'parte_id'), COALESCE(MAX(parte_id), 1)) FROM partes;
SELECT setval(pg_get_serial_sequence('stock_movimientos', 'movimiento_id'), COALESCE(MAX(movimiento_id), 1)) FROM stock_movimientos;
SELECT setval(pg_get_serial_sequence('ingresos', 'ingreso_id'), COALESCE(MAX(ingreso_id), 1)) FROM ingresos;
SELECT setval(pg_get_serial_sequence('egresos', 'egreso_id'), COALESCE(MAX(egreso_id), 1)) FROM egresos;
SELECT setval(pg_get_serial_sequence('documentos', 'documento_id'), COALESCE(MAX(documento_id), 1)) FROM documentos;
SELECT setval(pg_get_serial_sequence('documento_version', 'version_id'), COALESCE(MAX(version_id), 1)) FROM documento_version;
SELECT setval(pg_get_serial_sequence('fragmentos', 'fragmento_id'), COALESCE(MAX(fragmento_id), 1)) FROM fragmentos;
SELECT setval(pg_get_serial_sequence('archivos', 'archivo_id'), COALESCE(MAX(archivo_id), 1)) FROM archivos;
SELECT setval(pg_get_serial_sequence('archivo_version', 'version_id'), COALESCE(MAX(version_id), 1)) FROM archivo_version;
