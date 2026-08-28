# Sistema de Gestión Integral para Startups

**Materia:** Bases de Datos para Inteligencia Artificial

**Carrera:** Especialización en Inteligencia Artificial (CEIA)

**Alumno:** Rubiolo, Pedro Ignacio

---

## 🎯 Caso de Uso Elegido

El proyecto está destinado al uso interno de **Startups focalizadas en el diseño, desarrollo y fabricación de proyectos mecatrónicos/industriales**.

El sistema permite centralizar y gestionar:

1. **Stakeholders**: Registro unificado de clientes, proveedores y empleados.
2. **Finanzas Operativas**: Registro detallado de ingresos y egresos vinculados a proyectos y personas.
3. **Gestión de Proyectos**: Seguimiento de estados, involucrados, documentación técnica y archivos asociados.
4. **Control de Versiones**: Trazabilidad completa de versiones de documentos técnicos y archivos CAD/3D.
5. **BOM & Partes**: Desglose de estructuras complejas de componentes (Bill of Materials) con control de ensambles y partes comerciales.
6. **Inventario & Stock**: Monitoreo de existencias y trazabilidad mediante historial de movimientos.
7. **Consultas NL2SQL**: Traducción de preguntas en lenguaje natural a queries SQL sobre la base relacional.
8. **Agente RAG (Retrieval-Augmented Generation)**: Consultas inteligentes y búsqueda semántica en lenguaje natural sobre documentación del sistema utilizando almacenamiento vectorial.

---

## 💡 Descripción Breve de la Solución

La solución combina una **arquitectura híbrida (Relacional + JSONB + Vectorial + Data Lake)** que permite gestionar datos altamente estructurados, semiestructurados y archivos no estructurados.

Se implementó un backend en **FastAPI** junto con un frontend en **HTML5/Vanilla CSS/JS**. La información relacional y los vectores de búsqueda semántica se almacenan en **PostgreSQL con la extensión pgvector**. Los datos no estructurados (planos, archivos CAD, normativas en PDF) se gestionan en un Data Lake sobre **MinIO**.

---

## 📊 Datos Principales Identificados

* **Datos Estructurados**:
  * Información de entidades: Clientes, Proveedores, Empleados, Usuarios y Personas.
  * Estructura de proyectos, partidas de stock, ingresos y egresos.
* **Datos Semiestructurados**:
  * Metadatos flexibles almacenados mediante campos `JSONB` en las tablas `partes`, `archivos`, `documentos` y `proveedor_parte`.
* **Datos No Estructurados**:
  * Planos en PDF, archivos de modelos 3D/CAD (STL, STEP) y especificaciones técnicas almacenadas en el Data Lake de MinIO.
* **Datos Vectoriales**:
  * Embeddings vectoriales de fragmentos de documentos almacenados en la tabla `fragmentos` mediante la extensión `pgvector` para alimentar el sistema RAG.

---

## 🛠️ Tecnologías Utilizadas

* **Base de Datos Relacional y Vectorial**: PostgreSQL con extensión `pgvector`.
* **Data Lake / Almacenamiento de Objetos**: MinIO.
* **Backend & API**: Python + FastAPI + LangChain + Psycopg.
* **Frontend**: HTML, CSS y JavaScript.
* **Integración de IA (LLM & Embeddings)**: OpenRouter API.
* **Gestión de Base de Datos**: pgAdmin 4.
* **Infraestructura y Orquestación**: Docker y Docker Compose.

---

## 📁 Estructura del Repositorio

```text
bdia-integrador/
├── app/                            # Aplicación Backend y Frontend
│   ├── Dockerfile                  # Configuración Docker para el servicio FastAPI
│   ├── main.py                     # Endpoints FastAPI, lógica RAG, NL2SQL y RLS
│   ├── requirements.txt            # Dependencias Python
│   └── static/                     # Frontend Web (index.html, app.js, css)
├── data/                           # Almacenamiento persistente de volúmenes Docker
│   ├── minio/                      # Datos del Data Lake MinIO
│   ├── pgadmin/                    # Configuración de pgAdmin
│   └── postgres/                   # Datos de la base de PostgreSQL
├── docs/                           # Documentación del proyecto
│   ├── Informe Tecnico BDIA.pdf    # Informe Técnico en PDF
│   ├── Arquitectura de datos.png   # Arquitectura de datos en PNG
│   ├── Modelo Conceptual.png       # Modelo Conceptual
│   └── Modelo Logico.png           # Modelo Logico
│   
├── sql/                            # Scripts SQL de inicialización y consultas
│   ├── 01-schema.sql               # Creación de tablas, restricciones y pgvector
│   ├── 02-seed.sql                 # Poblado inicial de datos (carga desde CSVs)
│   ├── 03-triggers.sql             # Triggers para actualización automática de stock
│   ├── 04-roles.sql                # Definición de roles de PostgreSQL (admin, app_user, ai_agent)
│   ├── 05-consultas.sql            # Consultas de negocio representativas (BOM, stock, etc.)
│   └── csv/                        # Archivos CSV de datos de prueba
├── .env                            # Variables de entorno locales
├── .env.example                    # Plantilla de variables de entorno
├── docker-compose.yml              # Orquestación de servicios Docker
└── README.md                       # Documentación principal del proyecto
```

Se recomienda consultar el modelo logico en el siguiente [enlace](https://miro.com/app/board/uXjVHxWEcOg=/?share_link_id=599654576671).

---

## 🚀 Instrucciones para Ejecutar la Implementación Mínima

### Requisitos Previos

* Docker y Docker Compose instalados en el sistema.

### Pasos de Ejecución

1. **Clonar el repositorio**:

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd bdia-integrador
   ```

2. **Configurar las Variables de Entorno**:
   Crea el archivo `.env` tomando como base `.env.example`:

   ```bash
   cp .env.example .env
   ```

   *Ingresa tu clave de OpenRouter en `OPENROUTER_API_KEY` dentro del archivo `.env` para habilitar las funciones de IA (RAG y NL2SQL).*

3. **Levantar los Contenedores**:

   ```bash
   docker compose up -d --build
   ```

4. **Acceso a las Interfaces**:
   * **Aplicación Web / Dashboard**: [http://localhost:8000](http://localhost:8000) *(Email: `admin@empresa.com`, Password: `admin123`)*
   * **pgAdmin 4**: [http://localhost:8080](http://localhost:8080) *(Email: `admin@example.com`, Password: `admin`)*
   * **Consola de MinIO**: [http://localhost:9001](http://localhost:9001) *(User: `minioadmin`, Password: `minioadmin`)*

5. **Interaccion**:

   * Ingresar a la interfaz de pgAdmin 4 y ejecutar las consultas del archivo `sql/05-consultas.sql`. Los resultados se mostrarán en la consola y deben ser acordes a lo que se menciona en el informe técnico.
   * Navegar por la UI web para obtener información sobre los proyectos, clientes, proveedores, empleados y stock.
   * Hacer alguna consulta en NL2SQL.

---

## 🧠 Principales Decisiones de Diseño

1. **Normalización de Entidades y Roles**:
   * Separación entre `personas` y `usuarios`: Permite gestionar personas reales/jurídicas y vincular credenciales o niveles de acceso.
   * Separación de `clientes`, `proveedores` y `empleados` desde la entidad `personas` para resolver ambigüedades cuando un mismo ente cumple múltiples roles.
2. **Control de Stock Auditado**:
   * La tabla `stock` no se modifica manualmente; las existencias se actualizan a través de `stock_movimientos` mediante triggers SQL para mantener trazabilidad absoluta de entradas y salidas.
3. **Manejo del Desglose de Partes (BOM - Bill of Materials)**:
   * Implementación de relaciones jerárquicas recursivas mediante la tabla `parte_parte`.
   * Filtrado explícito de ensambles (`es_ensamble = FALSE`) en las consultas recursivas para evitar la **doble contabilización** de subpartes.
4. **Almacenamiento Híbrido**:
   * Uso de `JSONB` para extensibilidad en metadatos sin necesidad de alterar el esquema relacional.
   * Extensión `pgvector` en PostgreSQL para integrar la búsqueda de similitud coseno vectorial en la misma base relacional.
5. **Seguridad y Permisos Multinivel**:
   * Restricción a nivel de red y aislamiento de contenedores Docker.
   * Autenticación basada en **JWT** en el API Backend.
   * Definición de **Roles en PostgreSQL**: `admin` (superusuario), `app_user` (CRUD operativo con RLS), `ai_agent` (lectura restrictiva para agentes de IA).
   * Implementación de **Row Level Security (RLS)** sobre tablas sensibles (`documentos`, `archivos`, `empleados`).

---

## 🔍 Consultas Incluidas (`sql/05-consultas.sql`)

El sistema incluye las 6 consultas SQL representativas del negocio requeridas en la especificación:

1. **Proyectos Activos**: Consulta los proyectos en estado `'EN_PROGRESO'`.
2. **Última Versión de Archivo**: Recupera la ubicación en MinIO/S3 y detalles de la versión más reciente de un archivo CAD o plano.
3. **Desglose de Componentes del Proyecto (BOM Recursivo)**: Consulta CTE recursiva para obtener el listado total de partes requeridas sin doble contabilización.
4. **Componentes Faltantes**: Contrasta la demanda calculada en la CTE recursiva contra el stock disponible en inventario.
5. **Cotizaciones y Proveedores de Partes**: Muestra proveedores, datos de contacto y precios ordenados de menor a mayor cotización.
6. **Archivos Asociados a una Parte**: Lista planos, datasheets y modelos 3D vinculados a un componente específico.

---

## 📈 Limitaciones y Posibles Mejoras

* **Ingestión y Vectorización Automática**: Automatizar la extracción de texto, fragmentación y generación de embeddings mediante trabajadores en segundo plano (Background Workers/Celery) cada vez que se sube una nueva versión de documento en MinIO.
* **Indexación Vectorial**: Implementar índices `HNSW` o `IVFFlat` en la tabla `fragmentos` cuando la base de conocimiento vectorial crezca sustancialmente.
* **Optimización de Políticas RLS**: Evaluar denormalización estratégica de permisos en la tabla `fragmentos` si el volumen de Joins afecta el rendimiento de las consultas RLS a gran escala.
* **Integración de Visores 3D**: Añadir visores en la interfaz web para renderizar modelos CAD `.stl` / `.step` directamente en el navegador.
