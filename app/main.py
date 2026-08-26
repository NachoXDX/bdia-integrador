import os
import io
import json
import hashlib
import requests
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
import psycopg2
from psycopg2.extras import RealDictCursor
import boto3
from botocore.client import Config
import jwt

# =========================================================
# Environment & Configuration
# =========================================================
POSTGRES_DB = os.getenv("POSTGRES_DB", "postgres")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))

# Non-admin application database role credentials
APP_DB_USER = os.getenv("APP_DB_USER", "app_user")
APP_DB_PASSWORD = os.getenv("APP_DB_PASSWORD", "app_password")

# Read-Only AI Agent role credentials
AI_DB_USER = os.getenv("AI_DB_USER", "ai_agent")
AI_DB_PASSWORD = os.getenv("AI_DB_PASSWORD", "ai_agent_password")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")

JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_jwt_key_bdia_2026")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
OPENROUTER_API_BASE = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")

# =========================================================
# FastAPI App Setup
# =========================================================
app = FastAPI(
    title="BDIA System - Integrated API",
    description="Full Backend API for StartUp Project Management, Parts Inventory, Financials, Vector Search & RAG using app_user & ai_agent DB roles",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", include_in_schema=False)
def read_root():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "BDIA FastAPI System is running. Access API docs at /docs"}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# =========================================================
# Database & MinIO Connections
# =========================================================
POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "admin")

DEFAULT_MOCK_USER = {
    "user_id": 1,
    "mail": "admin@empresa.com",
    "active": True,
    "rol": "FULL_ACCESS"
}

def get_db_raw_connection(user: str = POSTGRES_USER, password: str = POSTGRES_PASSWORD):
    return psycopg2.connect(
        dbname=POSTGRES_DB,
        user=user,
        password=password,
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        cursor_factory=RealDictCursor
    )

def get_minio_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ROOT_USER,
        aws_secret_access_key=MINIO_ROOT_PASSWORD,
        config=Config(signature_version="s3v4")
    )

def ensure_bucket_exists(bucket_name: str):
    s3 = get_minio_client()
    try:
        s3.head_bucket(Bucket=bucket_name)
    except Exception:
        s3.create_bucket(Bucket=bucket_name)

# =========================================================
# Authentication & Security Helpers
# =========================================================
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        import bcrypt
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception:
            return False
    return hash_password(plain_password) == hashed_password or plain_password == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales de autenticación. Token inválido o expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("user_id")
        mail: str = payload.get("mail")
        rol: str = payload.get("rol")
        if user_id is None or mail is None:
            raise credentials_exception
        return {
            "user_id": user_id,
            "mail": mail,
            "active": True,
            "rol": rol or "FULL_ACCESS"
        }
    except Exception:
        raise credentials_exception

def get_app_db():
    """Database dependency for application CRUD routes using APP_DB_USER (app_user)."""
    conn = get_db_raw_connection(user=APP_DB_USER, password=APP_DB_PASSWORD)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def get_ai_agent_db():
    """Database dependency for AI agent routes (RAG & NL2SQL) using AI_DB_USER (ai_agent, Read-Only)."""
    conn = get_db_raw_connection(user=AI_DB_USER, password=AI_DB_PASSWORD)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

get_db = get_app_db
get_db_with_rls = get_app_db
get_ai_agent_db_with_rls = get_ai_agent_db


# =========================================================
# Pydantic Schemas
# =========================================================
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class UserLogin(BaseModel):
    mail: EmailStr
    password: str

class PersonaCreate(BaseModel):
    nombre: str
    apellido: str
    telefono: Optional[str] = None
    direccion_pais: Optional[str] = None
    direccion_provincia: Optional[str] = None
    direccion_ciudad: Optional[str] = None
    direccion_calle: Optional[str] = None
    direccion_numero: Optional[int] = None
    cuit: Optional[str] = None
    user_id: Optional[int] = None

class EmpleadoCreate(BaseModel):
    persona_id: int
    puesto: str
    sueldo: float

class ClienteCreate(BaseModel):
    persona_id: int
    dependencia: Optional[str] = None

class ProveedorCreate(BaseModel):
    persona_id: int
    dependencia: Optional[str] = None

class ProyectoCreate(BaseModel):
    nombre: str
    estado: str = "EN_PROGRESO"  # PAUSADO, EN_PROGRESO, FINALIZADO, CANCELADO

class ProyectoPersonaAssign(BaseModel):
    persona_id: int
    rol: str

class ProyectoParteAssign(BaseModel):
    parte_id: int
    cantidad: float

class ParteCreate(BaseModel):
    nombre: str
    unidad: str  # MM, M, UNIDADES, LTS, KG
    categoria: str  # MECANICA, ELECTRONICA, ELECTRICIDAD, ELECTROMECANICA, NEUMATICA, HIDRAULICA, OTROS
    es_ensamble: bool = False
    es_comercial: bool = True
    metadata: Optional[dict] = None

class SubparteAssign(BaseModel):
    hijo_id: int
    cantidad: int

class StockMovimientoCreate(BaseModel):
    parte_id: int
    cantidad: float

class ProveedorParteCreate(BaseModel):
    proveedor_id: int
    parte_id: int
    monto: float
    responsable: Optional[int] = None
    metadata: Optional[dict] = None

class IngresoCreate(BaseModel):
    monto: float
    descripcion: Optional[str] = None
    empleado_id: Optional[int] = None
    cliente_id: Optional[int] = None
    proyecto_id: Optional[int] = None

class EgresoCreate(BaseModel):
    monto: float
    descripcion: Optional[str] = None
    empleado_id: Optional[int] = None
    proveedor_id: Optional[int] = None
    proyecto_id: Optional[int] = None

def get_empleado_id_for_user(user_id: int, db) -> int:
    try:
        with db.cursor() as cur:
            cur.execute("""
                SELECT e.empleado_id
                FROM empleados e
                JOIN personas p ON e.persona_id = p.persona_id
                WHERE p.user_id = %s AND e.active = TRUE
                LIMIT 1
            """, (user_id,))
            row = cur.fetchone()
            if row and row.get("empleado_id"):
                return row["empleado_id"]
    except Exception:
        pass
    return 1

class VectorSearchRequest(BaseModel):
    query_vector: List[float]
    top_k: int = 5
    documento_id: Optional[int] = None

class NL2SQLRequest(BaseModel):
    prompt: str = Field(..., description="Pregunta en lenguaje natural para convertir a consulta SQL")

class RAGChatRequest(BaseModel):
    prompt: str = Field(..., description="Consulta en lenguaje natural para el Agente RAG")
    top_k: Optional[int] = 5
    documento_id: Optional[int] = None

class ProyectoUpdate(BaseModel):
    nombre: Optional[str] = None
    estado: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None

class ParteUpdate(BaseModel):
    nombre: Optional[str] = None
    unidad: Optional[str] = None
    categoria: Optional[str] = None
    es_ensamble: Optional[bool] = None
    es_comercial: Optional[bool] = None

class DocumentoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = None
    acceso: Optional[str] = None

# =========================================================
# Healthcheck Endpoint
# =========================================================
@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "ok",
        "service": "FastAPI BDIA Integrador",
        "app_db_user": APP_DB_USER,
        "ai_db_user": AI_DB_USER,
        "timestamp": datetime.utcnow().isoformat()
    }

# =========================================================
# Auth Routes
# =========================================================
@app.post("/auth/login", response_model=Token, tags=["Authentication"])
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_raw_connection(user=APP_DB_USER, password=APP_DB_PASSWORD)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, mail, password, active, rol FROM usuarios WHERE mail = %s", (form_data.username,))
            user = cur.fetchone()
            if not user or not user["active"]:
                raise HTTPException(status_code=400, detail="Invalid email or inactive user")
            if not verify_password(form_data.password, user["password"]):
                raise HTTPException(status_code=400, detail="Incorrect password")

            user_data = dict(user)
            user_data.pop("password", None)
            access_token = create_access_token(data={"user_id": user_data["user_id"], "mail": user_data["mail"], "rol": user_data["rol"]})
            return {"access_token": access_token, "token_type": "bearer", "user": user_data}
    finally:
        conn.close()

@app.get("/auth/me", tags=["Authentication"])
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# =========================================================
# Stakeholders Routes (Personas, Empleados, Clientes, Proveedores)
# =========================================================
@app.get("/personas", tags=["Stakeholders"])
def list_personas(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM personas WHERE active = TRUE ORDER BY persona_id ASC")
        return [dict(row) for row in cur.fetchall()]

@app.post("/personas", tags=["Stakeholders"])
def create_persona(payload: PersonaCreate, current_user: dict = Depends(get_current_user), db=Depends(get_db_with_rls)):
    user_id = payload.user_id if payload.user_id else current_user["user_id"]
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO personas (nombre, apellido, telefono, direccion_pais, direccion_provincia, direccion_ciudad, direccion_calle, direccion_numero, cuit, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (payload.nombre, payload.apellido, payload.telefono, payload.direccion_pais, payload.direccion_provincia, payload.direccion_ciudad, payload.direccion_calle, payload.direccion_numero, payload.cuit, user_id))
        return dict(cur.fetchone())

@app.delete("/personas/{persona_id}", tags=["Stakeholders"])
def delete_persona(persona_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("UPDATE personas SET active = FALSE WHERE persona_id = %s RETURNING persona_id", (persona_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Persona not found")
        return {"message": "Persona deleted successfully", "persona_id": persona_id}

@app.get("/empleados", tags=["Stakeholders"])
def list_empleados(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT e.*, p.nombre, p.apellido, p.cuit
            FROM empleados e
            JOIN personas p ON e.persona_id = p.persona_id
            WHERE e.active = TRUE
            ORDER BY e.empleado_id ASC
        """)
        return [dict(row) for row in cur.fetchall()]

@app.post("/empleados", tags=["Stakeholders"])
def create_empleado(payload: EmpleadoCreate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO empleados (persona_id, puesto, sueldo)
            VALUES (%s, %s, %s)
            RETURNING *
        """, (payload.persona_id, payload.puesto, payload.sueldo))
        return dict(cur.fetchone())

@app.get("/clientes", tags=["Stakeholders"])
def list_clientes(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT c.*, p.nombre, p.apellido, p.cuit
            FROM clientes c
            JOIN personas p ON c.persona_id = p.persona_id
            WHERE c.active = TRUE
            ORDER BY c.cliente_id ASC
        """)
        return [dict(row) for row in cur.fetchall()]

@app.post("/clientes", tags=["Stakeholders"])
def create_cliente(payload: ClienteCreate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO clientes (persona_id, dependencia)
            VALUES (%s, %s)
            RETURNING *
        """, (payload.persona_id, payload.dependencia))
        return dict(cur.fetchone())

@app.get("/proveedores", tags=["Stakeholders"])
def list_proveedores(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT pr.*, p.nombre, p.apellido, p.cuit
            FROM proveedores pr
            JOIN personas p ON pr.persona_id = p.persona_id
            WHERE pr.active = TRUE
            ORDER BY pr.proveedor_id ASC
        """)
        return [dict(row) for row in cur.fetchall()]

@app.post("/proveedores", tags=["Stakeholders"])
def create_proveedor(payload: ProveedorCreate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO proveedores (persona_id, dependencia)
            VALUES (%s, %s)
            RETURNING *
        """, (payload.persona_id, payload.dependencia))
        return dict(cur.fetchone())

# =========================================================
# Projects Routes
# =========================================================
@app.get("/proyectos", tags=["Projects"])
def list_proyectos(active_only: bool = True, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        query = "SELECT * FROM proyectos"
        if active_only:
            query += " WHERE active = TRUE"
        query += " ORDER BY proyecto_id ASC"
        cur.execute(query)
        return [dict(row) for row in cur.fetchall()]

@app.post("/proyectos", tags=["Projects"])
def create_proyecto(payload: ProyectoCreate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO proyectos (nombre, estado)
            VALUES (%s, %s)
            RETURNING *
        """, (payload.nombre, payload.estado))
        return dict(cur.fetchone())

@app.get("/proyectos/{proyecto_id}", tags=["Projects"])
def get_proyecto_detail(proyecto_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM proyectos WHERE proyecto_id = %s", (proyecto_id,))
        proj = cur.fetchone()
        if not proj:
            raise HTTPException(status_code=404, detail="Proyecto not found")
        
        # Associated personas
        cur.execute("""
            SELECT pp.rol, p.* 
            FROM proyecto_persona pp
            JOIN personas p ON pp.persona_id = p.persona_id
            WHERE pp.proyecto_id = %s
        """, (proyecto_id,))
        personas = [dict(r) for r in cur.fetchall()]

        # Associated documentos (filtered by RLS on documentos)
        cur.execute("""
            SELECT d.* 
            FROM proyecto_documento pd
            JOIN documentos d ON pd.documento_id = d.documento_id
            WHERE pd.proyecto_id = %s
        """, (proyecto_id,))
        documentos = [dict(r) for r in cur.fetchall()]

        # Associated partes
        cur.execute("""
            SELECT pr.cantidad, pt.* 
            FROM proyecto_parte pr
            JOIN partes pt ON pr.parte_id = pt.parte_id
            WHERE pr.proyecto_id = %s
        """, (proyecto_id,))
        partes = [dict(r) for r in cur.fetchall()]

        # Associated ingresos
        cur.execute("""
            SELECT i.*, p.nombre as persona_nombre, p.apellido as persona_apellido
            FROM ingresos i
            LEFT JOIN empleados e ON i.empleado_id = e.empleado_id
            LEFT JOIN personas p ON e.persona_id = p.persona_id
            WHERE i.proyecto_id = %s
            ORDER BY i.fecha DESC
        """, (proyecto_id,))
        ingresos = [dict(r) for r in cur.fetchall()]

        # Associated egresos
        cur.execute("""
            SELECT eg.*, p.nombre as persona_nombre, p.apellido as persona_apellido
            FROM egresos eg
            LEFT JOIN empleados e ON eg.empleado_id = e.empleado_id
            LEFT JOIN personas p ON e.persona_id = p.persona_id
            WHERE eg.proyecto_id = %s
            ORDER BY eg.fecha DESC
        """, (proyecto_id,))
        egresos = [dict(r) for r in cur.fetchall()]

        res = dict(proj)
        res["personas"] = personas
        res["documentos"] = documentos
        res["partes"] = partes
        res["ingresos"] = ingresos
        res["egresos"] = egresos
        return res

@app.put("/proyectos/{proyecto_id}", tags=["Projects"])
def update_proyecto(proyecto_id: int, payload: ProyectoUpdate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        updates = []
        params = []
        if payload.nombre is not None:
            updates.append("nombre = %s")
            params.append(payload.nombre)
        if payload.estado is not None:
            updates.append("estado = %s")
            params.append(payload.estado)
        if payload.fecha_inicio is not None:
            updates.append("fecha_inicio = %s")
            params.append(payload.fecha_inicio)
        if payload.fecha_fin is not None:
            updates.append("fecha_fin = %s")
            params.append(payload.fecha_fin if payload.fecha_fin != "" else None)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        params.append(proyecto_id)
        cur.execute(f"UPDATE proyectos SET {', '.join(updates)} WHERE proyecto_id = %s RETURNING *", params)
        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Proyecto not found")
        return dict(updated)

@app.delete("/proyectos/{proyecto_id}", tags=["Projects"])
def delete_proyecto(proyecto_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("UPDATE proyectos SET active = FALSE WHERE proyecto_id = %s RETURNING proyecto_id", (proyecto_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Proyecto not found")
        return {"message": "Proyecto deleted successfully", "proyecto_id": proyecto_id}

@app.post("/proyectos/{proyecto_id}/personas", tags=["Projects"])
def assign_persona_to_proyecto(proyecto_id: int, payload: ProyectoPersonaAssign, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO proyecto_persona (proyecto_id, persona_id, rol)
            VALUES (%s, %s, %s)
            ON CONFLICT (persona_id, proyecto_id) DO UPDATE SET rol = EXCLUDED.rol
        """, (proyecto_id, payload.persona_id, payload.rol))
        return {"message": "Persona assigned successfully"}

@app.delete("/proyectos/{proyecto_id}/personas/{persona_id}", tags=["Projects"])
def unassign_persona_from_proyecto(proyecto_id: int, persona_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM proyecto_persona WHERE proyecto_id = %s AND persona_id = %s", (proyecto_id, persona_id))
        return {"message": "Persona unassigned from proyecto"}

@app.post("/proyectos/{proyecto_id}/documentos/{documento_id}", tags=["Projects"])
def assign_documento_to_proyecto(proyecto_id: int, documento_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO proyecto_documento (proyecto_id, documento_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
        """, (proyecto_id, documento_id))
        return {"message": "Documento assigned to proyecto"}

@app.delete("/proyectos/{proyecto_id}/documentos/{documento_id}", tags=["Projects"])
def unassign_documento_from_proyecto(proyecto_id: int, documento_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM proyecto_documento WHERE proyecto_id = %s AND documento_id = %s", (proyecto_id, documento_id))
        return {"message": "Documento unassigned from proyecto"}

@app.post("/proyectos/{proyecto_id}/partes", tags=["Projects"])
def assign_parte_to_proyecto(proyecto_id: int, payload: ProyectoParteAssign, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO proyecto_parte (proyecto_id, parte_id, cantidad)
            VALUES (%s, %s, %s)
            ON CONFLICT (proyecto_id, parte_id) DO UPDATE SET cantidad = EXCLUDED.cantidad
        """, (proyecto_id, payload.parte_id, payload.cantidad))
        return {"message": "Parte assigned to proyecto"}

@app.delete("/proyectos/{proyecto_id}/partes/{parte_id}", tags=["Projects"])
def unassign_parte_from_proyecto(proyecto_id: int, parte_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM proyecto_parte WHERE proyecto_id = %s AND parte_id = %s", (proyecto_id, parte_id))
        return {"message": "Parte unassigned from proyecto"}

# =========================================================
# Parts & Inventory Catalog Routes
# =========================================================
@app.get("/partes", tags=["Parts Inventory"])
def list_partes(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT p.*, COALESCE(s.cantidad, 0) as stock_actual
            FROM partes p
            LEFT JOIN stock s ON p.parte_id = s.parte_id
            ORDER BY p.parte_id ASC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.post("/partes", tags=["Parts Inventory"])
def create_parte(payload: ParteCreate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        metadata_json = json.dumps(payload.metadata) if payload.metadata else None
        cur.execute("""
            INSERT INTO partes (nombre, unidad, categoria, es_ensamble, es_comercial, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (payload.nombre, payload.unidad, payload.categoria, payload.es_ensamble, payload.es_comercial, metadata_json))
        new_part = dict(cur.fetchone())
        
        # Initialize stock row
        cur.execute("INSERT INTO stock (parte_id, cantidad) VALUES (%s, 0) ON CONFLICT DO NOTHING", (new_part["parte_id"],))
        return new_part

@app.get("/partes/{parte_id}/subpartes", tags=["Parts Inventory"])
def get_subpartes(parte_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT pp.cantidad, p.*
            FROM parte_parte pp
            JOIN partes p ON pp.hijo_id = p.parte_id
            WHERE pp.padre_id = %s
            ORDER BY p.parte_id ASC
        """, (parte_id,))
        return [dict(r) for r in cur.fetchall()]

@app.post("/partes/{padre_id}/subpartes", tags=["Parts Inventory"])
def add_subparte(padre_id: int, payload: SubparteAssign, db=Depends(get_db_with_rls)):
    if padre_id == payload.hijo_id:
        raise HTTPException(status_code=400, detail="A part cannot be a child of itself")
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO parte_parte (padre_id, hijo_id, cantidad)
            VALUES (%s, %s, %s)
            ON CONFLICT (padre_id, hijo_id) DO UPDATE SET cantidad = EXCLUDED.cantidad
        """, (padre_id, payload.hijo_id, payload.cantidad))
        return {"message": "Subpart assigned to assembly"}

@app.delete("/partes/{padre_id}/subpartes/{hijo_id}", tags=["Parts Inventory"])
def remove_subparte(padre_id: int, hijo_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM parte_parte WHERE padre_id = %s AND hijo_id = %s", (padre_id, hijo_id))
        return {"message": "Subpart removed from assembly"}

@app.get("/partes/{parte_id}/cotizaciones", tags=["Parts Inventory"])
def get_parte_cotizaciones(parte_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT pp.*, pr.dependencia as proveedor_dependencia, p.nombre as persona_nombre, p.apellido as persona_apellido
            FROM proveedor_parte pp
            JOIN proveedores pr ON pp.proveedor_id = pr.proveedor_id
            JOIN personas p ON pr.persona_id = p.persona_id
            WHERE pp.parte_id = %s
            ORDER BY pp.fecha DESC
        """, (parte_id,))
        return [dict(r) for r in cur.fetchall()]

@app.post("/partes/cotizaciones", tags=["Parts Inventory"])
def create_proveedor_parte_quote(payload: ProveedorParteCreate, current_user: dict = Depends(get_current_user), db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        metadata_json = json.dumps(payload.metadata) if payload.metadata else None
        responsable_id = payload.responsable if payload.responsable else get_empleado_id_for_user(current_user["user_id"], db)
        cur.execute("""
            INSERT INTO proveedor_parte (proveedor_id, parte_id, responsable, monto, metadata, fecha)
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (proveedor_id, parte_id) 
            DO UPDATE SET 
                monto = EXCLUDED.monto,
                responsable = EXCLUDED.responsable,
                metadata = COALESCE(EXCLUDED.metadata, proveedor_parte.metadata),
                fecha = CURRENT_TIMESTAMP
            RETURNING *
        """, (payload.proveedor_id, payload.parte_id, responsable_id, payload.monto, metadata_json))
        return dict(cur.fetchone())

@app.delete("/partes/{parte_id}/cotizaciones/{proveedor_id}", tags=["Parts Inventory"])
def delete_proveedor_parte_quote(parte_id: int, proveedor_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM proveedor_parte WHERE parte_id = %s AND proveedor_id = %s RETURNING parte_id", (parte_id, proveedor_id))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Cotización not found")
        return {"message": "Cotización deleted successfully"}

@app.put("/partes/{parte_id}", tags=["Parts Inventory"])
def update_parte(parte_id: int, payload: ParteUpdate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        updates = []
        params = []
        if payload.nombre is not None:
            updates.append("nombre = %s")
            params.append(payload.nombre)
        if payload.unidad is not None:
            updates.append("unidad = %s")
            params.append(payload.unidad)
        if payload.categoria is not None:
            updates.append("categoria = %s")
            params.append(payload.categoria)
        if payload.es_ensamble is not None:
            updates.append("es_ensamble = %s")
            params.append(payload.es_ensamble)
        if payload.es_comercial is not None:
            updates.append("es_comercial = %s")
            params.append(payload.es_comercial)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        params.append(parte_id)
        cur.execute(f"UPDATE partes SET {', '.join(updates)} WHERE parte_id = %s RETURNING *", params)
        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Parte not found")
        return dict(updated)

@app.delete("/partes/{parte_id}", tags=["Parts Inventory"])
def delete_parte(parte_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM partes WHERE parte_id = %s", (parte_id,))
        return {"message": "Parte deleted successfully"}

@app.get("/partes/{parte_id}/archivos", tags=["Parts Inventory"])
def get_parte_archivos(parte_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT a.*, av.ubicacion as version_ubicacion
            FROM parte_archivo pa
            JOIN archivos a ON pa.archivo_id = a.archivo_id
            LEFT JOIN archivo_version av ON a.version_id = av.version_id
            WHERE pa.parte_id = %s
        """, (parte_id,))
        return [dict(r) for r in cur.fetchall()]

@app.post("/partes/{parte_id}/archivos/{archivo_id}", tags=["Parts Inventory"])
def link_archivo_to_parte(parte_id: int, archivo_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("INSERT INTO parte_archivo (parte_id, archivo_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (parte_id, archivo_id))
        return {"message": "Archivo linked to parte"}

@app.delete("/partes/{parte_id}/archivos/{archivo_id}", tags=["Parts Inventory"])
def unlink_archivo_from_parte(parte_id: int, archivo_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM parte_archivo WHERE parte_id = %s AND archivo_id = %s", (parte_id, archivo_id))
        return {"message": "Archivo unlinked from parte"}

# =========================================================
# Stock & Movements Routes
# =========================================================
@app.get("/stock", tags=["Stock Management"])
def list_stock(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT s.parte_id, p.nombre, p.unidad, p.categoria, s.cantidad as stock_actual
            FROM stock s
            JOIN partes p ON s.parte_id = p.parte_id
            ORDER BY s.parte_id ASC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.get("/stock/movimientos", tags=["Stock Management"])
def list_stock_movimientos(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT sm.*, p.nombre as parte_nombre, u.mail as usuario_mail
            FROM stock_movimientos sm
            JOIN partes p ON sm.parte_id = p.parte_id
            LEFT JOIN usuarios u ON sm.user_id = u.user_id
            ORDER BY sm.movimiento_id DESC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.post("/stock/movimientos", tags=["Stock Management"])
def register_stock_movimiento(payload: StockMovimientoCreate, current_user: dict = Depends(get_current_user), db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO stock_movimientos (parte_id, cantidad, user_id)
            VALUES (%s, %s, %s)
            RETURNING *
        """, (payload.parte_id, payload.cantidad, current_user["user_id"]))
        return dict(cur.fetchone())

# =========================================================
# Documents, Versions & MinIO Routes
# =========================================================
@app.get("/documentos", tags=["Documents & RAG"])
def list_documentos(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            WITH version_counts AS (
                SELECT version_id, documento_id,
                       ROW_NUMBER() OVER (PARTITION BY documento_id ORDER BY version_id ASC) as version_num
                FROM documento_version
            )
            SELECT d.*, dv.ubicacion as version_ubicacion, COALESCE(vc.version_num, 1) as version_num
            FROM documentos d
            LEFT JOIN documento_version dv ON d.version_id = dv.version_id
            LEFT JOIN version_counts vc ON d.version_id = vc.version_id
            ORDER BY d.documento_id ASC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.post("/documentos", tags=["Documents & RAG"])
async def upload_new_documento(
    nombre: str = Form(...),
    descripcion: Optional[str] = Form(None),
    estado: str = Form("EN_REVISION"),  # EN_REVISION, APROBADO, RECHAZADO
    acceso: str = Form("PUBLICO"),      # PRIVADO, PUBLICO, RESERVADO
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db_with_rls)
):
    ensure_bucket_exists("documentos")
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO documentos (nombre, descripcion, estado, acceso)
            VALUES (%s, %s, %s, %s)
            RETURNING documento_id
        """, (nombre, descripcion, estado, acceso))
        doc_id = cur.fetchone()["documento_id"]

        version_num = 1
        s3_key = f"{doc_id}/v{version_num}/{file.filename}"
        s3_client = get_minio_client()
        content_bytes = await file.read()
        s3_client.put_object(Bucket="documentos", Key=s3_key, Body=content_bytes)

        cur.execute("""
            INSERT INTO documento_version (documento_id, user_id, ubicacion)
            VALUES (%s, %s, %s)
            RETURNING version_id
        """, (doc_id, current_user["user_id"], s3_key))
        version_id = cur.fetchone()["version_id"]

        cur.execute("UPDATE documentos SET version_id = %s WHERE documento_id = %s", (version_id, doc_id))
        return {"documento_id": doc_id, "version_id": version_id, "s3_key": s3_key}

@app.post("/documentos/{documento_id}/versions", tags=["Documents & RAG"])
async def upload_documento_version(
    documento_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db_with_rls)
):
    ensure_bucket_exists("documentos")
    with db.cursor() as cur:
        cur.execute("SELECT * FROM documentos WHERE documento_id = %s", (documento_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Documento not found")

        cur.execute("SELECT COUNT(*) as cnt FROM documento_version WHERE documento_id = %s", (documento_id,))
        next_ver = cur.fetchone()["cnt"] + 1

        s3_key = f"{documento_id}/v{next_ver}/{file.filename}"
        s3_client = get_minio_client()
        content_bytes = await file.read()
        s3_client.put_object(Bucket="documentos", Key=s3_key, Body=content_bytes)

        cur.execute("""
            INSERT INTO documento_version (documento_id, user_id, ubicacion)
            VALUES (%s, %s, %s)
            RETURNING version_id
        """, (documento_id, current_user["user_id"], s3_key))
        version_id = cur.fetchone()["version_id"]

        cur.execute("UPDATE documentos SET version_id = %s WHERE documento_id = %s", (version_id, documento_id))
        return {"documento_id": documento_id, "version_id": version_id, "s3_key": s3_key}

@app.get("/documentos/{documento_id}/download", tags=["Documents & RAG"])
def download_documento_file(documento_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT d.nombre, dv.ubicacion 
            FROM documentos d
            JOIN documento_version dv ON d.version_id = dv.version_id
            WHERE d.documento_id = %s
        """, (documento_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Document version not found or access denied")

        s3_client = get_minio_client()
        try:
            response = s3_client.get_object(Bucket="documentos", Key=doc["ubicacion"])
            filename = doc["ubicacion"].split("/")[-1]
            return StreamingResponse(
                io.BytesIO(response["Body"].read()),
                media_type="application/octet-stream",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading file from MinIO: {str(e)}")


@app.get("/documentos/{documento_id}/versions", tags=["Documents & RAG"])
def list_documento_versions(documento_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            WITH version_counts AS (
                SELECT version_id,
                       ROW_NUMBER() OVER (PARTITION BY documento_id ORDER BY version_id ASC) as version_num
                FROM documento_version
                WHERE documento_id = %s
            )
            SELECT dv.*, u.mail as usuario_mail, vc.version_num
            FROM documento_version dv
            JOIN version_counts vc ON dv.version_id = vc.version_id
            LEFT JOIN usuarios u ON dv.user_id = u.user_id
            WHERE dv.documento_id = %s
            ORDER BY dv.version_id DESC
        """, (documento_id, documento_id))
        return [dict(r) for r in cur.fetchall()]

@app.get("/documentos/versions/{version_id}/download", tags=["Documents & RAG"])
def download_specific_document_version(version_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT dv.ubicacion, d.nombre
            FROM documento_version dv
            JOIN documentos d ON dv.documento_id = d.documento_id
            WHERE dv.version_id = %s
        """, (version_id,))
        ver = cur.fetchone()
        if not ver:
            raise HTTPException(status_code=404, detail="Version not found")

        s3_client = get_minio_client()
        try:
            response = s3_client.get_object(Bucket="documentos", Key=ver["ubicacion"])
            filename = ver["ubicacion"].split("/")[-1]
            return StreamingResponse(
                io.BytesIO(response["Body"].read()),
                media_type="application/octet-stream",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading file from MinIO: {str(e)}")

@app.put("/documentos/{documento_id}", tags=["Documents & RAG"])
def update_documento(documento_id: int, payload: DocumentoUpdate, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        updates = []
        params = []
        if payload.nombre is not None:
            updates.append("nombre = %s")
            params.append(payload.nombre)
        if payload.descripcion is not None:
            updates.append("descripcion = %s")
            params.append(payload.descripcion)
        if payload.estado is not None:
            updates.append("estado = %s")
            params.append(payload.estado)
        if payload.acceso is not None:
            updates.append("acceso = %s")
            params.append(payload.acceso)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        params.append(documento_id)
        cur.execute(f"UPDATE documentos SET {', '.join(updates)} WHERE documento_id = %s RETURNING *", params)
        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Documento not found")
        return dict(updated)

@app.delete("/documentos/{documento_id}", tags=["Documents & RAG"])
def delete_documento(documento_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM documentos WHERE documento_id = %s", (documento_id,))
        return {"message": "Documento deleted successfully"}

# =========================================================
# Files (Archivos) & MinIO Routes
# =========================================================
@app.get("/archivos", tags=["Files Catalog"])
def list_archivos(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            WITH version_counts AS (
                SELECT version_id, archivo_id,
                       ROW_NUMBER() OVER (PARTITION BY archivo_id ORDER BY version_id ASC) as version_num
                FROM archivo_version
            )
            SELECT a.*, av.ubicacion as version_ubicacion, COALESCE(vc.version_num, 1) as version_num
            FROM archivos a
            LEFT JOIN archivo_version av ON a.version_id = av.version_id
            LEFT JOIN version_counts vc ON a.version_id = vc.version_id
            ORDER BY a.archivo_id ASC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.post("/archivos", tags=["Files Catalog"])
async def upload_new_archivo(
    nombre: str = Form(...),
    descripcion: Optional[str] = Form(None),
    estado: str = Form("EN_REVISION"),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db_with_rls)
):
    ensure_bucket_exists("archivos")
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO archivos (nombre, descripcion, estado)
            VALUES (%s, %s, %s)
            RETURNING archivo_id
        """, (nombre, descripcion, estado))
        arch_id = cur.fetchone()["archivo_id"]

        s3_key = f"{arch_id}/v1/{file.filename}"
        s3_client = get_minio_client()
        content_bytes = await file.read()
        s3_client.put_object(Bucket="archivos", Key=s3_key, Body=content_bytes)

        cur.execute("""
            INSERT INTO archivo_version (archivo_id, user_id, ubicacion)
            VALUES (%s, %s, %s)
            RETURNING version_id
        """, (arch_id, current_user["user_id"], s3_key))
        version_id = cur.fetchone()["version_id"]

        cur.execute("UPDATE archivos SET version_id = %s WHERE archivo_id = %s", (version_id, arch_id))
        return {"archivo_id": arch_id, "version_id": version_id, "s3_key": s3_key}

@app.get("/archivos/{archivo_id}/versions", tags=["Files Catalog"])
def list_archivo_versions(archivo_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            WITH version_counts AS (
                SELECT version_id,
                       ROW_NUMBER() OVER (PARTITION BY archivo_id ORDER BY version_id ASC) as version_num
                FROM archivo_version
                WHERE archivo_id = %s
            )
            SELECT av.*, u.mail as usuario_mail, vc.version_num
            FROM archivo_version av
            JOIN version_counts vc ON av.version_id = vc.version_id
            LEFT JOIN usuarios u ON av.user_id = u.user_id
            WHERE av.archivo_id = %s
            ORDER BY av.version_id DESC
        """, (archivo_id, archivo_id))
        return [dict(r) for r in cur.fetchall()]

@app.post("/archivos/{archivo_id}/versions", tags=["Files Catalog"])
async def upload_archivo_version(
    archivo_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db_with_rls)
):
    ensure_bucket_exists("archivos")
    with db.cursor() as cur:
        cur.execute("SELECT * FROM archivos WHERE archivo_id = %s", (archivo_id,))
        arch = cur.fetchone()
        if not arch:
            raise HTTPException(status_code=404, detail="Archivo not found")

        cur.execute("SELECT COUNT(*) as cnt FROM archivo_version WHERE archivo_id = %s", (archivo_id,))
        next_ver = cur.fetchone()["cnt"] + 1

        s3_key = f"{archivo_id}/v{next_ver}/{file.filename}"
        s3_client = get_minio_client()
        content_bytes = await file.read()
        s3_client.put_object(Bucket="archivos", Key=s3_key, Body=content_bytes)

        cur.execute("""
            INSERT INTO archivo_version (archivo_id, user_id, ubicacion)
            VALUES (%s, %s, %s)
            RETURNING version_id
        """, (archivo_id, current_user["user_id"], s3_key))
        version_id = cur.fetchone()["version_id"]

        cur.execute("UPDATE archivos SET version_id = %s WHERE archivo_id = %s", (version_id, archivo_id))
        return {"archivo_id": archivo_id, "version_id": version_id, "s3_key": s3_key}

@app.get("/archivos/{archivo_id}/download", tags=["Files Catalog"])
def download_archivo_file(archivo_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT a.nombre, av.ubicacion 
            FROM archivos a
            JOIN archivo_version av ON a.version_id = av.version_id
            WHERE a.archivo_id = %s
        """, (archivo_id,))
        arch = cur.fetchone()
        if not arch:
            raise HTTPException(status_code=404, detail="Archivo version not found")

        s3_client = get_minio_client()
        try:
            response = s3_client.get_object(Bucket="archivos", Key=arch["ubicacion"])
            filename = arch["ubicacion"].split("/")[-1]
            return StreamingResponse(
                io.BytesIO(response["Body"].read()),
                media_type="application/octet-stream",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading file from MinIO: {str(e)}")

@app.delete("/archivos/{archivo_id}", tags=["Files Catalog"])
def delete_archivo(archivo_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM archivos WHERE archivo_id = %s RETURNING archivo_id", (archivo_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Archivo not found")
        return {"message": "Archivo deleted successfully", "archivo_id": archivo_id}

# =========================================================
# Financials Routes (Ingresos & Egresos)
# =========================================================
@app.get("/ingresos", tags=["Financials"])
def list_ingresos(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT i.*, p.nombre as proyecto_nombre, e.puesto as empleado_puesto
            FROM ingresos i
            LEFT JOIN proyectos p ON i.proyecto_id = p.proyecto_id
            JOIN empleados e ON i.empleado_id = e.empleado_id
            ORDER BY i.ingreso_id DESC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.post("/ingresos", tags=["Financials"])
def create_ingreso(payload: IngresoCreate, current_user: dict = Depends(get_current_user), db=Depends(get_db_with_rls)):
    emp_id = payload.empleado_id if payload.empleado_id else get_empleado_id_for_user(current_user["user_id"], db)
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO ingresos (monto, descripcion, empleado_id, cliente_id, proyecto_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (payload.monto, payload.descripcion, emp_id, payload.cliente_id, payload.proyecto_id))
        return dict(cur.fetchone())

@app.get("/egresos", tags=["Financials"])
def list_egresos(db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT eg.*, p.nombre as proyecto_nombre, e.puesto as empleado_puesto
            FROM egresos eg
            LEFT JOIN proyectos p ON eg.proyecto_id = p.proyecto_id
            JOIN empleados e ON eg.empleado_id = e.empleado_id
            ORDER BY eg.egreso_id DESC
        """)
        return [dict(r) for r in cur.fetchall()]

@app.post("/egresos", tags=["Financials"])
def create_egreso(payload: EgresoCreate, current_user: dict = Depends(get_current_user), db=Depends(get_db_with_rls)):
    emp_id = payload.empleado_id if payload.empleado_id else get_empleado_id_for_user(current_user["user_id"], db)
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO egresos (monto, descripcion, empleado_id, proveedor_id, proyecto_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (payload.monto, payload.descripcion, emp_id, payload.proveedor_id, payload.proyecto_id))
        return dict(cur.fetchone())

@app.delete("/ingresos/{ingreso_id}", tags=["Financials"])
def delete_ingreso(ingreso_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM ingresos WHERE ingreso_id = %s RETURNING ingreso_id", (ingreso_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Ingreso not found")
        return {"message": "Ingreso deleted successfully"}

@app.delete("/egresos/{egreso_id}", tags=["Financials"])
def delete_egreso(egreso_id: int, db=Depends(get_db_with_rls)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM egresos WHERE egreso_id = %s RETURNING egreso_id", (egreso_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Egreso not found")
        return {"message": "Egreso deleted successfully"}

# =========================================================
# Agente RAG (NVIDIA Nemotron 3 embed 1B & OpenRouter)
# =========================================================
NVIDIA_EMBED_MODEL = "nvidia/nemotron-3-embed-1b:free"

def get_nemotron_embedding(text: str) -> List[float]:
    """
    Genera embeddings para el texto de entrada utilizando la API de OpenRouter 
    con el modelo NVIDIA Nemotron 3 embed 1B (nvidia/nemotron-3-embed-1b:free).
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key or api_key == "your_openrouter_api_key_here":
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY no configurada. Configure una clave API válida de OpenRouter en el archivo .env"
        )

    url = f"{OPENROUTER_API_BASE}/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bdia-system.local",
        "X-Title": "BDIA Agente RAG"
    }
    payload = {
        "model": NVIDIA_EMBED_MODEL,
        "input": text
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        if "data" in data and len(data["data"]) > 0:
            return data["data"][0]["embedding"]
        else:
            raise ValueError(f"Respuesta inesperada de la API de embeddings: {data}")
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error al obtener embeddings de OpenRouter ({NVIDIA_EMBED_MODEL}): {str(e)}"
        )


@app.post("/rag/chat", tags=["AI Agent & RAG"])
def rag_chat_agent(payload: RAGChatRequest, current_user: dict = Depends(get_current_user), db=Depends(get_ai_agent_db_with_rls)):
    """
    Endpoint del Agente RAG que:
    1. Recibe la consulta en lenguaje natural del usuario.
    2. Genera el vector de embedding con el modelo nvidia/nemotron-3-embed-1b:free a través de OpenRouter.
    3. Realiza la búsqueda vectorial en la tabla 'fragmentos' con pgvector.
    4. Genera la respuesta sintetizada en lenguaje natural usando el LLM de OpenRouter.
    5. Devuelve la respuesta junto con las fuentes detalladas (Documento y Fragmentos).
    """
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="El prompt de consulta no puede estar vacío.")

    # 1. Obtener embedding vectorial usando NVIDIA Nemotron 3 embed 1B
    query_vector = get_nemotron_embedding(payload.prompt)
    vector_str = str(query_vector)

    # 2. Realizar búsqueda vectorial en PostgreSQL (fragmentos JOIN documentos)
    retrieved_fragments = []
    with db.cursor() as cur:
        try:
            if payload.documento_id:
                cur.execute("""
                    SELECT f.fragmento_id, f.documento_id, f.numero, f.contenido, f.modelo_embedding,
                           d.nombre AS documento_nombre, d.descripcion AS documento_descripcion,
                           (f.embedding <=> %s::vector) AS distancia
                    FROM fragmentos f
                    LEFT JOIN documentos d ON f.documento_id = d.documento_id
                    WHERE f.documento_id = %s
                    ORDER BY distancia ASC
                    LIMIT %s
                """, (vector_str, payload.documento_id, payload.top_k or 5))
            else:
                cur.execute("""
                    SELECT f.fragmento_id, f.documento_id, f.numero, f.contenido, f.modelo_embedding,
                           d.nombre AS documento_nombre, d.descripcion AS documento_descripcion,
                           (f.embedding <=> %s::vector) AS distancia
                    FROM fragmentos f
                    LEFT JOIN documentos d ON f.documento_id = d.documento_id
                    ORDER BY distancia ASC
                    LIMIT %s
                """, (vector_str, payload.top_k or 5))
            retrieved_fragments = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            # Manejo defensivo en caso de discrepancia de dimensión de vectores almacenados
            db.rollback()
            cur.execute("""
                SELECT f.fragmento_id, f.documento_id, f.numero, f.contenido, f.modelo_embedding,
                       d.nombre AS documento_nombre, d.descripcion AS documento_descripcion,
                       0.5 AS distancia
                FROM fragmentos f
                LEFT JOIN documentos d ON f.documento_id = d.documento_id
                LIMIT %s
            """, (payload.top_k or 5,))
            retrieved_fragments = [dict(r) for r in cur.fetchall()]

    # 3. Formatear fuentes y contexto para el LLM
    context_text = ""
    sources_list = []
    for idx, frag in enumerate(retrieved_fragments, start=1):
        doc_title = frag.get("documento_nombre") or f"Documento #{frag.get('documento_id')}"
        frag_num = frag.get("numero", idx)
        content = frag.get("contenido", "")
        dist = frag.get("distancia", 0.0)

        context_text += f"\n--- Fuente [{idx}]: Documento '{doc_title}' (ID: {frag.get('documento_id')}), Fragmento #{frag_num} ---\n{content}\n"

        sources_list.append({
            "fragmento_id": frag.get("fragmento_id"),
            "documento_id": frag.get("documento_id"),
            "documento_nombre": doc_title,
            "numero": frag_num,
            "contenido": content,
            "distancia": round(float(dist), 4) if dist is not None else 0.0
        })

    # 4. Invocar LLM vía OpenRouter para redactar la respuesta en lenguaje natural
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = ChatOpenAI(
            model=OPENROUTER_MODEL,
            openai_api_key=api_key,
            openai_api_base=OPENROUTER_API_BASE,
            temperature=0.2,
            default_headers={"HTTP-Referer": "https://bdia-system.local", "X-Title": "BDIA Agente RAG"}
        )

        messages = [
            SystemMessage(content=(
                "Eres el Agente RAG profesional del sistema BDIA.\n"
                "Responde de forma clara, detallada y estructurada en español basándote de forma prioritaria en los fragmentos de documentos recuperados.\n"
                "Al finalizar tu explicación, cita siempre las fuentes indicando el Documento y el número de Fragmento utilizados."
            )),
            HumanMessage(content=(
                f"Pregunta del usuario: {payload.prompt}\n\n"
                f"Fragmentos de documentos recuperados mediante el modelo de embeddings NVIDIA Nemotron 3 embed 1B ({len(retrieved_fragments)} fuentes):\n"
                f"{context_text if context_text else 'No se encontraron fragmentos específicos.'}"
            ))
        ]

        response = llm.invoke(messages)
        natural_answer = response.content.strip()
    except Exception as e:
        natural_answer = f"Se encontraron {len(sources_list)} fuentes relevantes. Sintetizado directo de contexto:\n" + "\n".join([f"- {s['documento_nombre']} (Frag #{s['numero']}): {s['contenido']}" for s in sources_list])

    return {
        "question": payload.prompt,
        "answer": natural_answer,
        "sources": sources_list,
        "embedding_model": NVIDIA_EMBED_MODEL
    }


# =========================================================
# Natural Language to SQL (LangChain & OpenRouter)
# =========================================================

DB_SCHEMA_SYSTEM_PROMPT = """
Eres un asistente experto en generación de consultas SQL PostgreSQL para el sistema BDIA.
Tu tarea es convertir la pregunta del usuario en lenguaje natural a UNA SOLA consulta SQL de tipo SELECT válida para PostgreSQL.

REGLAS DE SEGURIDAD ABSOLUTAS:
1. Genera ÚNICAMENTE consultas SQL de tipo SELECT (o expresiones comunes de tabla CTE que inicien con WITH y ejecuten SELECT).
2. NUNCA generes comandos de modificación o definición como INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, EXECUTE, COPY ni llamadas a funciones destructivas.
3. No incluyas punto y coma ';' al final de la consulta ni ejecutes múltiples sentencias.
4. Responde ÚNICAMENTE con la sentencia SQL pura, o dentro de un bloque de código ```sql ... ``` sin texto descriptivo adicional antes ni después.

ESQUEMA COMPLETO DE LA BASE DE DATOS Y RELACIONES:

1. usuarios:
   - user_id INT PRIMARY KEY
   - mail TEXT (email único)
   - active BOOLEAN (estado activo)
   - rol TEXT ('VIEW_ONLY', 'RESTRICTED', 'FULL_ACCESS')

2. personas:
   - persona_id INT PRIMARY KEY
   - nombre TEXT, apellido TEXT, telefono TEXT
   - direccion_pais TEXT, direccion_provincia TEXT, direccion_ciudad TEXT, direccion_calle TEXT, direccion_numero INT
   - cuit TEXT (cuit o cuil único)
   - user_id INT (FK usuarios.user_id)
   - active BOOLEAN

3. empleados:
   - empleado_id INT PRIMARY KEY
   - fecha_de_alta TIMESTAMP, sueldo NUMERIC(12,2), puesto TEXT
   - persona_id INT (FK personas.persona_id, UNIQUE)
   - active BOOLEAN

4. clientes:
   - cliente_id INT PRIMARY KEY
   - dependencia TEXT, fecha_de_alta TIMESTAMP
   - persona_id INT (FK personas.persona_id, UNIQUE)
   - active BOOLEAN

5. proveedores:
   - proveedor_id INT PRIMARY KEY
   - dependencia TEXT, fecha_de_alta TIMESTAMP
   - persona_id INT (FK personas.persona_id, UNIQUE)
   - active BOOLEAN

6. proyectos:
   - proyecto_id INT PRIMARY KEY
   - fecha_inicio TIMESTAMP, fecha_fin TIMESTAMP, nombre TEXT
   - estado TEXT ('PAUSADO', 'EN_PROGRESO', 'FINALIZADO', 'CANCELADO')
   - active BOOLEAN

7. proyecto_persona (Relación M:N personas <-> proyectos):
   - persona_id INT (FK personas.persona_id)
   - proyecto_id INT (FK proyectos.proyecto_id)
   - rol TEXT (rol en el proyecto)
   - PRIMARY KEY (persona_id, proyecto_id)

8. partes (Piezas/componentes en catálogo):
   - parte_id INT PRIMARY KEY
   - nombre TEXT
   - unidad TEXT ('MM', 'M', 'UNIDADES', 'LTS', 'KG')
   - categoria TEXT ('MECANICA', 'ELECTRONICA', 'ELECTRICIDAD', 'ELECTROMECANICA', 'NEUMATICA', 'HIDRAULICA', 'OTROS')
   - es_ensamble BOOLEAN, es_comercial BOOLEAN
   - metadata JSONB

9. parte_parte (BOM - Ensamble/Subpartes):
   - padre_id INT (FK partes.parte_id)
   - hijo_id INT (FK partes.parte_id)
   - cantidad INT
   - PRIMARY KEY (padre_id, hijo_id)

10. stock (Cantidad actual por parte):
    - parte_id INT PRIMARY KEY (FK partes.parte_id)
    - cantidad NUMERIC(12,2)

11. stock_movimientos (Movimientos de inventario):
    - movimiento_id INT PRIMARY KEY
    - cantidad NUMERIC(12,2), parte_id INT (FK partes.parte_id), fecha TIMESTAMP, user_id INT (FK usuarios.user_id)

12. proveedor_parte (Cotizaciones de partes por proveedor):
    - proveedor_id INT (FK proveedores.proveedor_id)
    - parte_id INT (FK partes.parte_id)
    - responsable INT (FK empleados.empleado_id)
    - fecha TIMESTAMP, monto NUMERIC(12,2), metadata JSONB
    - PRIMARY KEY (proveedor_id, parte_id)

13. proyecto_parte (Materiales requeridos por proyecto):
    - proyecto_id INT (FK proyectos.proyecto_id)
    - parte_id INT (FK partes.parte_id)
    - cantidad NUMERIC(12,2)
    - PRIMARY KEY (proyecto_id, parte_id)

14. ingresos (Finanzas - Entradas de dinero):
    - ingreso_id INT PRIMARY KEY
    - monto NUMERIC(12,2), fecha TIMESTAMP, descripcion TEXT
    - empleado_id INT (FK empleados.empleado_id)
    - cliente_id INT (FK clientes.cliente_id)
    - proyecto_id INT (FK proyectos.proyecto_id)

15. egresos (Finanzas - Salidas de dinero):
    - egreso_id INT PRIMARY KEY
    - monto NUMERIC(12,2), fecha TIMESTAMP, descripcion TEXT
    - empleado_id INT (FK empleados.empleado_id)
    - proveedor_id INT (FK proveedores.proveedor_id)
    - proyecto_id INT (FK proyectos.proyecto_id)

16. documentos (Documentos de proyecto):
    - documento_id INT PRIMARY KEY, nombre TEXT, descripcion TEXT, version_id INT, estado TEXT ('EN_REVISION', 'APROBADO', 'RECHAZADO'), acceso TEXT ('PRIVADO', 'PUBLICO', 'RESERVADO')

17. proyecto_documento: proyecto_id (FK proyectos), documento_id (FK documentos)
18. documento_version: version_id PRIMARY KEY, documento_id (FK documentos), fecha TIMESTAMP, user_id INT, ubicacion TEXT
19. fragmentos: fragmento_id PRIMARY KEY, documento_id INT, numero INT, contenido TEXT
20. archivos & 21. archivo_version & 22. parte_archivo

GUÍA DE JOINS Y CONSULTAS FRECUENTES:
- Para obtener nombre y apellido de empleados: JOIN personas ON empleados.persona_id = personas.persona_id
- Para obtener cliente/proveedor y su nombre: clientes/proveedores JOIN personas ON personas.persona_id = clientes/proveedores.persona_id
- Para obtener stock por parte: partes LEFT JOIN stock ON partes.parte_id = stock.parte_id
- Para obtener piezas requeridas por un proyecto: proyecto_parte JOIN partes ON proyecto_parte.parte_id = partes.parte_id
- Para totales de ingresos/egresos: SUM(monto) agrupado por proyecto, cliente o fecha.
"""


def validate_select_sql(sql_str: str) -> tuple[bool, str, str]:
    """
    Validates that the provided SQL query is strictly a single SELECT statement.
    Returns (is_valid, error_message, cleaned_sql).
    """
    cleaned = sql_str.strip()
    
    # Remove markdown codeblock syntax if present
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    # Remove trailing semicolon if any
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1].strip()

    # Check for multiple statements
    if ";" in cleaned:
        return False, "Se prohíbe la ejecución de múltiples sentencias SQL en una misma consulta.", cleaned

    upper_sql = cleaned.upper()

    # Must start with SELECT or WITH
    if not (upper_sql.startswith("SELECT") or upper_sql.startswith("WITH")):
        return False, "La consulta generada no comienza con SELECT ni WITH. Solo se permiten consultas de lectura.", cleaned

    # Prohibited dangerous keywords
    prohibited_keywords = [
        "INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "TRUNCATE ", 
        "CREATE ", "GRANT ", "REVOKE ", "EXECUTE ", "PG_SLEEP", "COPY ", "INTO "
    ]
    for kw in prohibited_keywords:
        # Check keyword in upper_sql (except INTO which could be inside variable, check whole word)
        if kw == "INTO ":
            if " SELECT " in upper_sql and " INTO " in upper_sql:
                return False, "No se permite 'SELECT INTO' para crear tablas.", cleaned
        elif kw in upper_sql:
            return False, f"Palabra clave no permitida detectada: '{kw.strip()}'. Solo se permiten consultas SELECT.", cleaned

    import re
    if re.search(r'<[a-zA-Z_0-9]+>', cleaned):
        return False, "La consulta contiene marcadores de posición no válidos (ej. <user_id>). Use valores explícitos.", cleaned

    return True, "", cleaned


@app.post("/queries/nl2sql", tags=["AI Agent & NL2SQL"])
def natural_language_to_sql(payload: NL2SQLRequest, current_user: dict = Depends(get_current_user), db=Depends(get_ai_agent_db_with_rls)):
    """
    Endpoint de Inteligencia Artificial que recibe una pregunta en lenguaje natural,
    genera la consulta SQL PostgreSQL mediante LangChain y OpenRouter (con validación de solo SELECT),
    ejecuta la consulta de forma segura en la BD y retorna los resultados formateados en lenguaje natural.
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key or api_key == "your_openrouter_api_key_here":
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY no configurada. Configure una clave API válida de OpenRouter en el archivo .env"
        )

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Las librerías de LangChain no están instaladas correctamente en el entorno del servidor."
        )

    # Context about the currently authenticated user
    user_id_val = current_user.get("user_id", 1)
    user_mail_val = current_user.get("mail", "admin@empresa.com")
    user_role_val = current_user.get("rol", "FULL_ACCESS")

    user_context_info = (
        f"\n\nDATOS DEL USUARIO ACTUAL AUTENTICADO EN SESIÓN:\n"
        f"- user_id = {user_id_val}\n"
        f"- mail = '{user_mail_val}'\n"
        f"- rol = '{user_role_val}'\n"
        f"INSTRUCCIÓN CRÍTICA PARA EL USUARIO ACTUAL:\n"
        f"Si la pregunta dice 'mis proyectos', 'mi usuario', 'mis egresos', 'mis datos' o se refiere al usuario actual, "
        f"usa obligatoriamente el número {user_id_val} para user_id o '{user_mail_val}' para mail. "
        f"NUNCA devuelvas marcadores de posición como '<user_id>', '$user_id' o 'user_id_here'."
    )

    # Initialize LangChain ChatOpenAI targeting OpenRouter
    llm = ChatOpenAI(
        model=OPENROUTER_MODEL,
        openai_api_key=api_key,
        openai_api_base=OPENROUTER_API_BASE,
        temperature=0.0,
        default_headers={"HTTP-Referer": "https://bdia-system.local", "X-Title": "BDIA NL2SQL System"}
    )

    messages = [
        SystemMessage(content=DB_SCHEMA_SYSTEM_PROMPT + user_context_info),
        HumanMessage(content=f"Pregunta del usuario: {payload.prompt}")
    ]

    try:
        llm_response = llm.invoke(messages)
        raw_generated_sql = llm_response.content.strip()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error al comunicarse con la API de OpenRouter/LangChain: {str(e)}"
        )

    # Validate SELECT-only safety constraint
    is_valid, err_msg, sql_query = validate_select_sql(raw_generated_sql)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"La consulta SQL generada fue rechazada por seguridad: {err_msg}"
        )

    # Execute query safely against Postgres DB
    try:
        with db.cursor() as cur:
            cur.execute("SET TRANSACTION READ ONLY;")
            cur.execute(sql_query)
            rows = cur.fetchall()
            row_dicts = [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error al ejecutar la consulta SQL [{sql_query}] en la base de datos: {str(e)}"
        )

    # LLM Second Pass: Format output rows in natural language
    format_messages = [
        SystemMessage(content=(
            "Eres un asistente virtual experto para la plataforma de gestión BDIA.\n"
            "Responde a la consulta del usuario en lenguaje natural fluido en español basándote estricta y verdaderamente en los datos devueltos por la consulta SQL.\n"
            "Sé claro, profesional, informativo y conciso."
        )),
        HumanMessage(content=(
            f"Pregunta original: {payload.prompt}\n"
            f"Consulta SQL ejecutada: {sql_query}\n"
            f"Resultados de la base de datos ({len(row_dicts)} filas obtenidas):\n"
            f"{json.dumps(row_dicts[:50], default=str, ensure_ascii=False)}"
        ))
    ]

    try:
        summary_response = llm.invoke(format_messages)
        natural_answer = summary_response.content.strip()
    except Exception as e:
        natural_answer = f"Se obtuvieron {len(row_dicts)} registros como resultado de la consulta."

    return {
        "question": payload.prompt,
        "sql": sql_query,
        "results": row_dicts[:100],
        "answer": natural_answer,
        "row_count": len(row_dicts)
    }

