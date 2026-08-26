-- =========================================================
-- Database Schema Script
-- Automatically executed on container startup
-- =========================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    user_id SERIAL PRIMARY KEY,
    mail TEXT NOT NULL UNIQUE CHECK (mail ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    password TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    rol TEXT NOT NULL
        CONSTRAINT chk_usuarios_rol 
        CHECK (rol IN ('VIEW_ONLY', 'RESTRICTED', 'FULL_ACCESS'))
);

-- 2. personas
CREATE TABLE IF NOT EXISTS personas (
    persona_id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    telefono TEXT,
    direccion_pais TEXT,
    direccion_provincia TEXT,
    direccion_ciudad TEXT,
    direccion_calle TEXT,
    direccion_numero INT,
    cuit TEXT UNIQUE,
    user_id INT UNIQUE REFERENCES usuarios(user_id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. empleados
CREATE TABLE IF NOT EXISTS empleados (
    empleado_id SERIAL PRIMARY KEY,
    fecha_de_alta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sueldo NUMERIC(12, 2) NOT NULL,
    puesto TEXT NOT NULL,
    persona_id INT UNIQUE NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. clientes
CREATE TABLE IF NOT EXISTS clientes (
    cliente_id SERIAL PRIMARY KEY,
    dependencia TEXT,
    fecha_de_alta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    persona_id INT UNIQUE NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    proveedor_id SERIAL PRIMARY KEY,
    dependencia TEXT,
    fecha_de_alta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    persona_id INT UNIQUE NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 6. proyectos
CREATE TABLE IF NOT EXISTS proyectos (
    proyecto_id SERIAL PRIMARY KEY,
    fecha_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP,
    nombre TEXT NOT NULL,
    estado TEXT NOT NULL
        CONSTRAINT chk_proyectos_estado 
        CHECK (estado IN ('PAUSADO', 'EN_PROGRESO', 'FINALIZADO', 'CANCELADO')),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 7. proyecto_persona
CREATE TABLE IF NOT EXISTS proyecto_persona (
    persona_id INT NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
    proyecto_id INT NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
    rol TEXT NOT NULL,
    PRIMARY KEY (persona_id, proyecto_id)
);

-- 8. partes
CREATE TABLE IF NOT EXISTS partes (
    parte_id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    unidad TEXT NOT NULL
        CONSTRAINT chk_partes_unidad 
        CHECK (unidad IN ('MM', 'M', 'UNIDADES', 'LTS', 'KG')),
    categoria TEXT NOT NULL,
        CONSTRAINT chk_partes_categoria 
        CHECK (categoria IN ('MECANICA', 'ELECTRONICA', 'ELECTRICIDAD', 'ELECTROMECANICA', 'NEUMATICA', 'HIDRAULICA', 'OTROS')),
    es_ensamble BOOLEAN NOT NULL,
    es_comercial BOOLEAN NOT NULL,
    metadata JSONB
);

-- 9. parte_parte
CREATE TABLE IF NOT EXISTS parte_parte (
    padre_id INT NOT NULL REFERENCES partes(parte_id) ON DELETE CASCADE,
    hijo_id INT NOT NULL REFERENCES partes(parte_id) ON DELETE CASCADE,
    cantidad INT NOT NULL,
    PRIMARY KEY (padre_id, hijo_id)
);

-- 10. stock
CREATE TABLE IF NOT EXISTS stock (
    parte_id INT PRIMARY KEY REFERENCES partes(parte_id) ON DELETE CASCADE,
    cantidad NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- 11. stock_movimientos
CREATE TABLE IF NOT EXISTS stock_movimientos (
    movimiento_id SERIAL PRIMARY KEY,
    cantidad NUMERIC(12, 2) NOT NULL,
    parte_id INT NOT NULL REFERENCES partes(parte_id) ON DELETE CASCADE,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INT NOT NULL REFERENCES usuarios(user_id) ON DELETE RESTRICT
);

-- 12. proveedor_parte
CREATE TABLE IF NOT EXISTS proveedor_parte (
    proveedor_id INT NOT NULL REFERENCES proveedores(proveedor_id) ON DELETE CASCADE,
    parte_id INT NOT NULL REFERENCES partes(parte_id) ON DELETE CASCADE,
    responsable INT NOT NULL REFERENCES empleados(empleado_id) ON DELETE RESTRICT,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    monto NUMERIC(12, 2) NOT NULL,
    metadata JSONB,
    PRIMARY KEY (proveedor_id, parte_id)
);

-- 13. proyecto_parte
CREATE TABLE IF NOT EXISTS proyecto_parte (
    proyecto_id INT NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
    parte_id INT NOT NULL REFERENCES partes(parte_id) ON DELETE CASCADE,
    cantidad NUMERIC(12, 2) NOT NULL,
    PRIMARY KEY (proyecto_id, parte_id)
);

-- 14. ingresos
CREATE TABLE IF NOT EXISTS ingresos (
    ingreso_id SERIAL PRIMARY KEY,
    monto NUMERIC(12, 2) NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    descripcion TEXT,
    empleado_id INT NOT NULL REFERENCES empleados(empleado_id) ON DELETE RESTRICT,
    cliente_id INT REFERENCES clientes(cliente_id) ON DELETE RESTRICT,
    proyecto_id INT REFERENCES proyectos(proyecto_id) ON DELETE RESTRICT
);

-- 15. egresos
CREATE TABLE IF NOT EXISTS egresos (
    egreso_id SERIAL PRIMARY KEY,
    monto NUMERIC(12, 2) NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    descripcion TEXT,
    empleado_id INT NOT NULL REFERENCES empleados(empleado_id) ON DELETE RESTRICT,
    proveedor_id INT REFERENCES proveedores(proveedor_id) ON DELETE RESTRICT,
    proyecto_id INT REFERENCES proyectos(proyecto_id) ON DELETE RESTRICT
);

-- 16. documentos
CREATE TABLE IF NOT EXISTS documentos (
    documento_id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    version_id INT, -- Es una clave foranea, luego se actualiza para solucionar dependencia circular
    estado TEXT NOT NULL
        CONSTRAINT chk_documentos_estado 
        CHECK (estado IN ('EN_REVISION', 'APROBADO', 'RECHAZADO')),
    acceso TEXT NOT NULL
        CONSTRAINT chk_documentos_acceso 
        CHECK (acceso IN ('PRIVADO', 'PUBLICO', 'RESERVADO')),
    metadata JSONB
);

-- 17. proyecto_documento
CREATE TABLE IF NOT EXISTS proyecto_documento (
    proyecto_id INT NOT NULL REFERENCES proyectos(proyecto_id) ON DELETE CASCADE,
    documento_id INT NOT NULL REFERENCES documentos(documento_id) ON DELETE CASCADE,
    PRIMARY KEY (proyecto_id, documento_id)
);

-- 18. documento_version
CREATE TABLE IF NOT EXISTS documento_version (
    version_id SERIAL PRIMARY KEY,
    documento_id INT NOT NULL REFERENCES documentos(documento_id) ON DELETE CASCADE,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INT NOT NULL REFERENCES usuarios(user_id) ON DELETE RESTRICT,
    ubicacion TEXT NOT NULL
);

-- Se agrega la FK a documentos
ALTER TABLE documentos 
    ADD CONSTRAINT fk_documento_version 
    FOREIGN KEY (version_id) REFERENCES documento_version(version_id) ON DELETE SET NULL;

-- 19. fragmentos
CREATE TABLE IF NOT EXISTS fragmentos (
    fragmento_id SERIAL PRIMARY KEY,
    documento_id INT NOT NULL REFERENCES documentos(documento_id) ON DELETE CASCADE,
    numero INT NOT NULL,
    contenido TEXT NOT NULL,
    modelo_embedding TEXT NOT NULL,
    embedding vector(2048)
);

-- 20. archivos
CREATE TABLE IF NOT EXISTS archivos (
    archivo_id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    version_id INT, -- Es una FK, se define luego para evitar dependencia ciruclar
    estado TEXT NOT NULL
        CONSTRAINT chk_archivos_estado 
        CHECK (estado IN ('EN_REVISION', 'APROBADO', 'RECHAZADO')),
    metadata JSONB
);

-- 21. archivo_version
CREATE TABLE IF NOT EXISTS archivo_version (
    version_id SERIAL PRIMARY KEY,
    archivo_id INT NOT NULL REFERENCES archivos(archivo_id) ON DELETE CASCADE,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INT NOT NULL REFERENCES usuarios(user_id) ON DELETE RESTRICT,
    ubicacion TEXT NOT NULL
);

-- Se agrega la FK a archivos
ALTER TABLE archivos 
    ADD CONSTRAINT fk_archivo_version 
    FOREIGN KEY (version_id) REFERENCES archivo_version(version_id) ON DELETE SET NULL;

-- 22. parte_archivo
CREATE TABLE IF NOT EXISTS parte_archivo (
    parte_id INT NOT NULL REFERENCES partes(parte_id) ON DELETE CASCADE,
    archivo_id INT NOT NULL REFERENCES archivos(archivo_id) ON DELETE CASCADE,
    PRIMARY KEY (parte_id, archivo_id)
);
