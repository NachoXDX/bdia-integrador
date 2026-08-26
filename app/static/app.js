// =========================================================
// Single Page Application Frontend Client
// Handles API calls, full-screen detail views, filtering & UI rendering
// =========================================================

const API_BASE = "";
let currentToken = localStorage.getItem("app_token") || localStorage.getItem("bdia_token") || null;
let currentUser = null;

// Cache arrays for client-side instant filtering
let cacheProyectos = [];
let cachePartes = [];
let cachePersonas = [];
let cacheEmpleados = [];
let cacheClientes = [];
let cacheProveedores = [];
let cacheDocumentos = [];
let cacheStock = [];
let cacheMovimientos = [];
let cacheArchivos = [];
let cacheIngresos = [];
let cacheEgresos = [];
let currentPeopleSubTab = "all";
let currentStockSubTab = "levels";

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    setupModalFormSubmissions();
    setupModalSubTabs();
    setupFullscreenSubTabs();
});

async function initApp() {
    if (currentToken) {
        try {
            currentUser = await apiFetch("/auth/me");
            showAppScreen();
            return;
        } catch (err) {
            console.warn("Token invalido o expirado:", err);
            currentToken = null;
            localStorage.removeItem("app_token");
            localStorage.removeItem("bdia_token");
        }
    }
    showLoginScreen();
}

function setupEventListeners() {
    // Login form submission
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const mail = document.getElementById("loginMail").value;
        const pass = document.getElementById("loginPass").value;
        const errDiv = document.getElementById("loginError");
        errDiv.classList.add("hidden");

        const formData = new FormData();
        formData.append("username", mail);
        formData.append("password", pass);

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: "Error de autenticación" }));
                throw new Error(errData.detail || "Error en inicio de sesión");
            }

            const data = await res.json();
            currentToken = data.access_token;
            currentUser = data.user || { mail, rol: "FULL_ACCESS" };
            localStorage.setItem("app_token", currentToken);
            showAppScreen();
        } catch (err) {
            errDiv.textContent = err.message;
            errDiv.classList.remove("hidden");
        }
    });

    // Logout button
    document.getElementById("logoutBtn").addEventListener("click", () => {
        currentToken = null;
        currentUser = null;
        localStorage.removeItem("app_token");
        localStorage.removeItem("bdia_token");
        showLoginScreen();
    });

    // Sidebar Tab Navigation
    document.querySelectorAll(".sidebar-nav .nav-link").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // NL2SQL Form submission listener
    const nl2sqlForm = document.getElementById("nl2sqlForm");
    if (nl2sqlForm) {
        nl2sqlForm.addEventListener("submit", (e) => {
            e.preventDefault();
            handleNL2SQLSubmit(e);
        });
    }
}

function switchTab(tabId) {
    document.querySelectorAll(".sidebar-nav .nav-link").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));

    const activeBtn = document.querySelector(`.sidebar-nav .nav-link[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add("active");

    const targetTabEl = document.getElementById(tabId);
    if (targetTabEl) targetTabEl.classList.add("active");

    onTabSelected(tabId);
}

function showLoginScreen() {
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("appScreen").classList.add("hidden");
}

function showAppScreen() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");

    if (currentUser) {
        document.getElementById("userEmailBadge").innerHTML = `<i class="fa-solid fa-user-circle"></i> ${currentUser.mail}`;
        document.getElementById("userRoleBadge").textContent = currentUser.rol || "FULL_ACCESS";
    }

    switchTab("tabWelcome");
}

// Generic API helper
async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
    }
    options.headers = headers;

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "API Error" }));
        throw new Error(err.detail || "Error en la petición");
    }
    return res.json();
}

function onTabSelected(tabId) {
    if (tabId === "tabProyectos") {
        closeProyectoDetailView();
        loadProyectosTable();
    } else if (tabId === "tabPartes") {
        closeParteDetailView();
        loadPartesTable();
    } else if (tabId === "tabStakeholders") {
        loadStakeholdersTab();
    } else if (tabId === "tabDocumentos") {
        closeDocumentoDetailView();
        loadDocumentosTable();
    } else if (tabId === "tabStock") {
        loadStockTab();
    } else if (tabId === "tabArchivos") {
        closeArchivoDetailView();
        loadArchivosTable();
    } else if (tabId === "tabFinanzas") {
        loadFinanzasTab();
    } else if (tabId === "tabDashboard") {
        loadActiveProjects();
    } else if (tabId === "tabNL2SQL") {
        if (typeof closeProyectoDetailView === 'function') closeProyectoDetailView();
        if (typeof closeParteDetailView === 'function') closeParteDetailView();
        if (typeof closeDocumentoDetailView === 'function') closeDocumentoDetailView();
        if (typeof closeArchivoDetailView === 'function') closeArchivoDetailView();
        const input = document.getElementById("nl2sqlInput");
        if (input) input.focus();
    }
}

// Modal Helpers & Tab Handlers
function setupModalSubTabs() {
    document.querySelectorAll(".modal-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const parentModal = btn.closest(".modal-card");
            parentModal.querySelectorAll(".modal-tab-btn").forEach(b => b.classList.remove("active"));
            parentModal.querySelectorAll(".modal-tab-content").forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-modtab");
            document.getElementById(targetId).classList.add("active");
        });
    });
}

function setupFullscreenSubTabs() {
    document.querySelectorAll(".fs-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const parentContainer = btn.closest(".card");
            parentContainer.querySelectorAll(".fs-tab-btn").forEach(b => b.classList.remove("active"));
            parentContainer.querySelectorAll(".fs-tab-content").forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-fstab");
            document.getElementById(targetId).classList.add("active");
        });
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("hidden");

    modal.onclick = (e) => {
        if (e.target === modal) closeModal(modalId);
    };

    if (modalId === "modalMovimiento") populatePartesSelect("movParteId");
    else if (modalId === "modalIngreso") populateProyectosSelect("ingProjId");
    else if (modalId === "modalEgreso") populateProyectosSelect("egrProjId");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("hidden");
}

// =========================================================
// SECTION 1: PROYECTOS (FULL-SCREEN DETAIL VIEW)
// =========================================================
async function loadProyectosTable() {
    const div = document.getElementById("projectsTable");
    div.innerHTML = "<p class='text-muted'>Cargando proyectos...</p>";
    try {
        cacheProyectos = await apiFetch("/proyectos?active_only=false");
        renderProyectosTable(cacheProyectos);
    } catch (err) {
        div.innerHTML = `<span class="text-danger">Error al cargar proyectos: ${err.message}</span>`;
    }
}

function filterProyectosTable() {
    const searchText = (document.getElementById("filterProjSearch").value || "").toLowerCase();
    const estadoFilter = document.getElementById("filterProjEstado").value;

    const filtered = cacheProyectos.filter(p => {
        const nameMatch = p.nombre.toLowerCase().includes(searchText);
        const estadoMatch = !estadoFilter || p.estado === estadoFilter;
        return nameMatch && estadoMatch;
    });

    renderProyectosTable(filtered);
}

function renderProyectosTable(data) {
    const div = document.getElementById("projectsTable");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No se encontraron proyectos.</p>";
        return;
    }

    let html = `<div class="table-responsive"><table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Fecha Inicio</th>
                <th>Fecha Fin</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>`;

    data.forEach(p => {
        const statusBadge = getStatusBadge(p.estado);
        const fechaIni = p.fecha_inicio ? new Date(p.fecha_inicio).toLocaleDateString() : "-";
        const fechaFin = p.fecha_fin ? new Date(p.fecha_fin).toLocaleDateString() : "-";

        html += `<tr class="clickable-row" onclick="openProyectoDetailFS(${p.proyecto_id})">
            <td><strong>#${p.proyecto_id}</strong></td>
            <td><strong>${escapeHtml(p.nombre)}</strong></td>
            <td>${statusBadge}</td>
            <td>${fechaIni}</td>
            <td>${fechaFin}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openProyectoDetailFS(${p.proyecto_id})">
                    <i class="fa-solid fa-folder-open"></i> Abrir
                </button>
                <button class="btn btn-sm btn-danger ms-1" onclick="deleteProyecto(${p.proyecto_id}, event)">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });

    html += "</tbody></table></div>";
    div.innerHTML = html;
}

async function openProyectoDetailFS(proyectoId) {
    document.getElementById("proyectosListView").classList.add("hidden");
    document.getElementById("proyectoDetailView").classList.remove("hidden");
    document.getElementById("editProjFSId").value = proyectoId;

    // Reset subtabs
    const container = document.getElementById("proyectoDetailView");
    container.querySelectorAll(".fs-tab-btn").forEach(b => b.classList.remove("active"));
    container.querySelectorAll(".fs-tab-content").forEach(c => c.classList.remove("active"));
    container.querySelector('[data-fstab="projFSInfo"]').classList.add("active");
    document.getElementById("projFSInfo").classList.add("active");

    populatePartesSelect("assignParteFSSelect");
    populateDocumentosSelect("assignDocFSSelect");
    populatePersonasSelect("assignPersonaFSSelect");

    try {
        const proj = await apiFetch(`/proyectos/${proyectoId}`);
        document.getElementById("detailProjScreenTitle").textContent = `Proyecto: ${proj.nombre} (#${proyectoId})`;

        document.getElementById("editProjFSNombre").value = proj.nombre || "";
        document.getElementById("editProjFSEstado").value = proj.estado || "EN_PROGRESO";
        if (proj.fecha_inicio) document.getElementById("editProjFSFechaInicio").value = formatDateTimeInput(proj.fecha_inicio);
        if (proj.fecha_fin) document.getElementById("editProjFSFechaFin").value = formatDateTimeInput(proj.fecha_fin);
        else document.getElementById("editProjFSFechaFin").value = "";

        renderProjFSLinkedPartes(proyectoId, proj.partes || []);
        renderProjFSLinkedDocs(proyectoId, proj.documentos || []);
        renderProjFSLinkedPersonas(proyectoId, proj.personas || []);
        renderProjFSLinkedIngresos(proj.ingresos || []);
        renderProjFSLinkedEgresos(proj.egresos || []);
    } catch (err) {
        alert(`Error al obtener detalle del proyecto: ${err.message}`);
        closeProyectoDetailView();
    }
}

function closeProyectoDetailView() {
    document.getElementById("proyectoDetailView").classList.add("hidden");
    document.getElementById("proyectosListView").classList.remove("hidden");
}

function renderProjFSLinkedPartes(projId, partes) {
    const div = document.getElementById("projFSLinkedPartesList");
    if (!partes.length) {
        div.innerHTML = "<p class='text-muted small'>No hay partes vinculadas a este proyecto.</p>";
        return;
    }
    let html = `<table><thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Cantidad</th><th>Acción</th></tr></thead><tbody>`;
    partes.forEach(pt => {
        html += `<tr>
            <td>#${pt.parte_id}</td>
            <td>${escapeHtml(pt.nombre)}</td>
            <td><span class="badge badge-info">${pt.categoria}</span></td>
            <td><strong>${pt.cantidad} ${pt.unidad}</strong></td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="unassignParteProjFS(${projId}, ${pt.parte_id})">
                    <i class="fa-solid fa-unlink"></i> Desvincular
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table>";
    div.innerHTML = html;
}

async function unassignParteProjFS(projId, parteId) {
    if (!confirm("¿Desvincular esta parte del proyecto?")) return;
    try {
        await apiFetch(`/proyectos/${projId}/partes/${parteId}`, { method: "DELETE" });
        openProyectoDetailFS(projId);
    } catch (err) {
        alert(err.message);
    }
}

function renderProjFSLinkedDocs(projId, docs) {
    const div = document.getElementById("projFSLinkedDocsList");
    if (!docs.length) {
        div.innerHTML = "<p class='text-muted small'>No hay documentos vinculados a este proyecto.</p>";
        return;
    }
    let html = `<table><thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Acceso</th><th>Descarga</th><th>Acción</th></tr></thead><tbody>`;
    docs.forEach(d => {
        html += `<tr>
            <td>#${d.documento_id}</td>
            <td>${escapeHtml(d.nombre)}</td>
            <td>${getStatusBadge(d.estado)}</td>
            <td><span class="badge badge-secondary">${d.acceso}</span></td>
            <td>
                <a href="${API_BASE}/documentos/${d.documento_id}/download" target="_blank" class="btn btn-sm btn-success">
                    <i class="fa-solid fa-download"></i> Descargar
                </a>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="unassignDocProjFS(${projId}, ${d.documento_id})">
                    <i class="fa-solid fa-unlink"></i> Desvincular
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table>";
    div.innerHTML = html;
}

async function unassignDocProjFS(projId, docId) {
    if (!confirm("¿Desvincular este documento del proyecto?")) return;
    try {
        await apiFetch(`/proyectos/${projId}/documentos/${docId}`, { method: "DELETE" });
        openProyectoDetailFS(projId);
    } catch (err) {
        alert(err.message);
    }
}

function renderProjFSLinkedPersonas(projId, personas) {
    const div = document.getElementById("projFSLinkedPersonasList");
    if (!personas.length) {
        div.innerHTML = "<p class='text-muted small'>No hay personas asignadas a este proyecto.</p>";
        return;
    }
    let html = `<table><thead><tr><th>ID</th><th>Nombre</th><th>Teléfono</th><th>Rol Asignado</th><th>Acción</th></tr></thead><tbody>`;
    personas.forEach(p => {
        html += `<tr>
            <td>#${p.persona_id}</td>
            <td>${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</td>
            <td>${p.telefono || "-"}</td>
            <td><span class="badge badge-primary">${escapeHtml(p.rol)}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="unassignPersonaProjFS(${projId}, ${p.persona_id})">
                    <i class="fa-solid fa-user-minus"></i> Desvincular
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table>";
    div.innerHTML = html;
}

async function unassignPersonaProjFS(projId, personaId) {
    if (!confirm("¿Desvincular esta persona del proyecto?")) return;
    try {
        await apiFetch(`/proyectos/${projId}/personas/${personaId}`, { method: "DELETE" });
        openProyectoDetailFS(projId);
    } catch (err) {
        alert(err.message);
    }
}

function renderProjFSLinkedIngresos(ingresos) {
    const div = document.getElementById("projFSLinkedIngresosList");
    if (!ingresos.length) {
        div.innerHTML = "<p class='text-muted small'>No hay registros de ingresos asociados a este proyecto.</p>";
        return;
    }
    let html = `<table><thead><tr><th>ID</th><th>Monto</th><th>Descripción</th><th>Registrador</th><th>Fecha</th></tr></thead><tbody>`;
    ingresos.forEach(i => {
        html += `<tr>
            <td>#${i.ingreso_id}</td>
            <td class="text-success"><strong>$${parseFloat(i.monto).toFixed(2)}</strong></td>
            <td>${escapeHtml(i.descripcion || "-")}</td>
            <td>${i.persona_nombre ? `${i.persona_nombre} ${i.persona_apellido}` : `Empleado #${i.empleado_id}`}</td>
            <td>${new Date(i.fecha).toLocaleDateString()}</td>
        </tr>`;
    });
    html += "</tbody></table>";
    div.innerHTML = html;
}

function renderProjFSLinkedEgresos(egresos) {
    const div = document.getElementById("projFSLinkedEgresosList");
    if (!egresos.length) {
        div.innerHTML = "<p class='text-muted small'>No hay registros de egresos asociados a este proyecto.</p>";
        return;
    }
    let html = `<table><thead><tr><th>ID</th><th>Monto</th><th>Descripción</th><th>Registrador</th><th>Fecha</th></tr></thead><tbody>`;
    egresos.forEach(eg => {
        html += `<tr>
            <td>#${eg.egreso_id}</td>
            <td class="text-danger"><strong>$${parseFloat(eg.monto).toFixed(2)}</strong></td>
            <td>${escapeHtml(eg.descripcion || "-")}</td>
            <td>${eg.persona_nombre ? `${eg.persona_nombre} ${eg.persona_apellido}` : `Empleado #${eg.empleado_id}`}</td>
            <td>${new Date(eg.fecha).toLocaleDateString()}</td>
        </tr>`;
    });
    html += "</tbody></table>";
    div.innerHTML = html;
}

// =========================================================
// SECTION 2: DOCUMENTOS (FULL-SCREEN DETAIL VIEW)
// =========================================================
async function loadDocumentosTable() {
    const div = document.getElementById("documentosTable");
    div.innerHTML = "<p class='text-muted'>Cargando documentos...</p>";
    try {
        cacheDocumentos = await apiFetch("/documentos");
        renderDocumentosTable(cacheDocumentos);
    } catch (err) {
        div.innerHTML = `<span class="text-danger">Error al cargar documentos: ${err.message}</span>`;
    }
}

function filterDocumentosTable() {
    const searchText = (document.getElementById("filterDocSearch").value || "").toLowerCase();
    const estadoFilter = document.getElementById("filterDocEstado").value;
    const accesoFilter = document.getElementById("filterDocAcceso").value;

    const filtered = cacheDocumentos.filter(d => {
        const nameMatch = d.nombre.toLowerCase().includes(searchText);
        const estadoMatch = !estadoFilter || d.estado === estadoFilter;
        const accesoMatch = !accesoFilter || d.acceso === accesoFilter;
        return nameMatch && estadoMatch && accesoMatch;
    });

    renderDocumentosTable(filtered);
}

function renderDocumentosTable(data) {
    const div = document.getElementById("documentosTable");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No se encontraron documentos.</p>";
        return;
    }

    let html = `<div class="table-responsive"><table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Nombre Documento</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th>Acceso</th>
                <th>Versión Actual</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>`;

    data.forEach(d => {
        const relVerNum = d.version_num ? `v${d.version_num}` : 'v1';
        html += `<tr class="clickable-row" onclick="openDocumentoDetailFS(${d.documento_id})">
            <td><strong>#${d.documento_id}</strong></td>
            <td><strong>${escapeHtml(d.nombre)}</strong></td>
            <td>${escapeHtml(d.descripcion || "-")}</td>
            <td>${getStatusBadge(d.estado)}</td>
            <td><span class="badge badge-secondary">${d.acceso}</span></td>
            <td><span class="badge badge-info">${relVerNum}</span></td>
            <td>
                <a href="${API_BASE}/documentos/${d.documento_id}/download" target="_blank" onclick="event.stopPropagation();" class="btn btn-sm btn-success me-1">
                    <i class="fa-solid fa-download"></i> Descargar
                </a>
                <button class="btn btn-sm btn-primary me-1" onclick="event.stopPropagation(); openDocumentoDetailFS(${d.documento_id})">
                    <i class="fa-solid fa-code-branch"></i> Versiones
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDocumento(${d.documento_id}, event)">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });

    html += "</tbody></table></div>";
    div.innerHTML = html;
}

async function openDocumentoDetailFS(docId) {
    document.getElementById("documentosListView").classList.add("hidden");
    document.getElementById("documentoDetailView").classList.remove("hidden");
    document.getElementById("editDocFSId").value = docId;

    try {
        const docs = await apiFetch("/documentos");
        const doc = docs.find(d => d.documento_id === docId);
        if (doc) {
            document.getElementById("detailDocScreenTitle").textContent = `Documento: ${doc.nombre} (#${doc.documento_id})`;
            document.getElementById("editDocFSNombre").value = doc.nombre || "";
            document.getElementById("editDocFSDesc").value = doc.descripcion || "";
            document.getElementById("editDocFSEstado").value = doc.estado || "EN_REVISION";
            document.getElementById("editDocFSAcceso").value = doc.acceso || "PUBLICO";
        }

        loadDocFSVersionsList(docId);
    } catch (err) {
        alert(err.message);
        closeDocumentoDetailView();
    }
}

function closeDocumentoDetailView() {
    document.getElementById("documentoDetailView").classList.add("hidden");
    document.getElementById("documentosListView").classList.remove("hidden");
}

async function loadDocFSVersionsList(docId) {
    const div = document.getElementById("docFSVersionsList");
    div.innerHTML = "<p class='text-muted small'>Cargando versiones...</p>";
    try {
        const versions = await apiFetch(`/documentos/${docId}/versions`);
        if (!versions.length) {
            div.innerHTML = "<p class='text-muted small'>No hay historial de versiones registrado.</p>";
            return;
        }

        let html = `<table><thead><tr><th>Nº Versión</th><th>Fecha de Carga</th><th>Usuario Registrador</th><th>Ubicación S3</th><th>Descargar File</th></tr></thead><tbody>`;
        versions.forEach(v => {
            const displayVer = v.version_num ? `v${v.version_num}` : `v${v.version_id}`;
            html += `<tr>
                <td><strong>${displayVer}</strong> <span class="text-muted small">(ID: #${v.version_id})</span></td>
                <td>${new Date(v.fecha).toLocaleString()}</td>
                <td>${v.usuario_mail || `Usuario #${v.user_id}`}</td>
                <td><code>${escapeHtml(v.ubicacion)}</code></td>
                <td>
                    <a href="${API_BASE}/documentos/versions/${v.version_id}/download" target="_blank" class="btn btn-sm btn-success">
                        <i class="fa-solid fa-download"></i> Descargar ${displayVer}
                    </a>
                </td>
            </tr>`;
        });
        html += "</tbody></table>";
        div.innerHTML = html;
    } catch (err) {
        div.innerHTML = `<span class="text-danger small">Error al cargar versiones: ${err.message}</span>`;
    }
}

// =========================================================
// SECTION 3: PARTES (FULL-SCREEN DETAIL VIEW)
// =========================================================
async function loadPartesTable() {
    const div = document.getElementById("partesTable");
    div.innerHTML = "<p class='text-muted'>Cargando partes...</p>";
    try {
        cachePartes = await apiFetch("/partes");
        renderPartesTable(cachePartes);
    } catch (err) {
        div.innerHTML = `<span class="text-danger">Error al cargar partes: ${err.message}</span>`;
    }
}

function filterPartesTable() {
    const searchText = (document.getElementById("filterParteSearch").value || "").toLowerCase();
    const catFilter = document.getElementById("filterParteCategoria").value;
    const ensambleFilter = document.getElementById("filterParteEnsamble").value;

    const filtered = cachePartes.filter(p => {
        const nameMatch = p.nombre.toLowerCase().includes(searchText);
        const catMatch = !catFilter || p.categoria === catFilter;
        let ensambleMatch = true;
        if (ensambleFilter === "ensamble") ensambleMatch = !!p.es_ensamble;
        else if (ensambleFilter === "simple") ensambleMatch = !p.es_ensamble;
        return nameMatch && catMatch && ensambleMatch;
    });

    renderPartesTable(filtered);
}

function renderPartesTable(data) {
    const div = document.getElementById("partesTable");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No se encontraron partes.</p>";
        return;
    }

    let html = `<div class="table-responsive"><table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Unidad</th>
                <th>Stock Actual</th>
                <th>Es Ensamble</th>
                <th>Comercial</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>`;

    data.forEach(p => {
        html += `<tr class="clickable-row" onclick="openParteDetailFS(${p.parte_id})">
            <td><strong>#${p.parte_id}</strong></td>
            <td><strong>${escapeHtml(p.nombre)}</strong></td>
            <td><span class="badge badge-info">${p.categoria}</span></td>
            <td>${p.unidad}</td>
            <td><strong class="${p.stock_actual <= 0 ? 'text-danger' : 'text-success'}">${p.stock_actual}</strong></td>
            <td>${p.es_ensamble ? '<span class="badge badge-warning">SI (BOM)</span>' : '<span class="text-muted">NO</span>'}</td>
            <td>${p.es_comercial ? '<span class="badge badge-success">SI</span>' : '<span class="text-muted">NO</span>'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openParteDetailFS(${p.parte_id})">
                    <i class="fa-solid fa-edit"></i> Abrir
                </button>
                <button class="btn btn-sm btn-danger ms-1" onclick="deleteParte(${p.parte_id}, event)">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });

    html += "</tbody></table></div>";
    div.innerHTML = html;
}

async function openParteDetailFS(parteId) {
    document.getElementById("partesListView").classList.add("hidden");
    document.getElementById("parteDetailView").classList.remove("hidden");
    document.getElementById("editParteFSId").value = parteId;

    const container = document.getElementById("parteDetailView");
    container.querySelectorAll(".fs-tab-btn").forEach(b => b.classList.remove("active"));
    container.querySelectorAll(".fs-tab-content").forEach(c => c.classList.remove("active"));
    container.querySelector('[data-fstab="parteFSInfo"]').classList.add("active");
    document.getElementById("parteFSInfo").classList.add("active");

    try {
        const partes = await apiFetch("/partes");
        const parte = partes.find(p => p.parte_id === parteId);
        if (parte) {
            document.getElementById("detailParteScreenTitle").textContent = `Parte: ${parte.nombre} (#${parte.parte_id})`;
            document.getElementById("editParteFSNombre").value = parte.nombre || "";
            document.getElementById("editParteFSCategoria").value = parte.categoria || "ELECTRONICA";
            document.getElementById("editParteFSUnidad").value = parte.unidad || "UNIDADES";
            document.getElementById("editParteFSEsEnsamble").checked = !!parte.es_ensamble;
            document.getElementById("editParteFSEsComercial").checked = !!parte.es_comercial;

            toggleFSSubpartesTab();
        }

        populatePartesSelectExcept("selectChildParteFS", parteId);
        populateProveedoresSelect("selectQuoteProveedorFS");
        populateArchivosSelect("linkArchivoParteFSSelect");

        loadParteFSSubpartes(parteId);
        loadParteFSCotizaciones(parteId);
        loadParteFSLinkedFiles(parteId);
    } catch (err) {
        alert(err.message);
        closeParteDetailView();
    }
}

function closeParteDetailView() {
    document.getElementById("parteDetailView").classList.add("hidden");
    document.getElementById("partesListView").classList.remove("hidden");
}

function toggleFSSubpartesTab() {
    const isEnsamble = document.getElementById("editParteFSEsEnsamble").checked;
    const tabBtn = document.getElementById("tabFSBtnSubpartes");
    if (isEnsamble) {
        tabBtn.style.display = "inline-flex";
    } else {
        tabBtn.style.display = "none";
    }
}

async function loadParteFSSubpartes(parteId) {
    const div = document.getElementById("parteFSSubpartesList");
    div.innerHTML = "<p class='text-muted small'>Cargando subpartes...</p>";
    try {
        const subpartes = await apiFetch(`/partes/${parteId}/subpartes`);
        if (!subpartes.length) {
            div.innerHTML = "<p class='text-muted small'>No hay subpartes vinculadas a este ensamble.</p>";
            return;
        }

        let html = `<table><thead><tr><th>ID</th><th>Componente Hijo</th><th>Categoría</th><th>Cantidad Requerida</th><th>Acción</th></tr></thead><tbody>`;
        subpartes.forEach(sp => {
            html += `<tr>
                <td>#${sp.parte_id}</td>
                <td><strong>${escapeHtml(sp.nombre)}</strong></td>
                <td><span class="badge badge-info">${sp.categoria}</span></td>
                <td><strong>${sp.cantidad} ${sp.unidad}</strong></td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeSubparteFS(${parteId}, ${sp.parte_id})">
                        <i class="fa-solid fa-minus-circle"></i> Eliminar Subparte
                    </button>
                </td>
            </tr>`;
        });
        html += "</tbody></table>";
        div.innerHTML = html;
    } catch (err) {
        div.innerHTML = `<span class="text-danger small">Error: ${err.message}</span>`;
    }
}

async function removeSubparteFS(padreId, hijoId) {
    if (!confirm("¿Eliminar esta subparte del ensamble?")) return;
    try {
        await apiFetch(`/partes/${padreId}/subpartes/${hijoId}`, { method: "DELETE" });
        loadParteFSSubpartes(padreId);
    } catch (err) {
        alert(err.message);
    }
}

async function loadParteFSCotizaciones(parteId) {
    const div = document.getElementById("parteFSCotizacionesList");
    div.innerHTML = "<p class='text-muted small'>Cargando cotizaciones...</p>";
    try {
        const cotizaciones = await apiFetch(`/partes/${parteId}/cotizaciones`);
        if (!cotizaciones.length) {
            div.innerHTML = "<p class='text-muted small'>No hay cotizaciones de proveedores registradas.</p>";
            return;
        }

        let html = `<table><thead><tr><th>Proveedor</th><th>Monto ($)</th><th>Responsable</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;
        cotizaciones.forEach(c => {
            html += `<tr>
                <td><strong>${escapeHtml(c.persona_nombre)} ${escapeHtml(c.persona_apellido)}</strong> (${escapeHtml(c.proveedor_dependencia || 'Sin Dependencia')})</td>
                <td class="text-success"><strong>$${parseFloat(c.monto).toFixed(2)}</strong></td>
                <td>Empleado #${c.responsable}</td>
                <td>${new Date(c.fecha).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteCotizacion(${parteId}, ${c.proveedor_id})">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </td>
            </tr>`;
        });
        html += "</tbody></table>";
        div.innerHTML = html;
    } catch (err) {
        div.innerHTML = `<span class="text-danger small">Error: ${err.message}</span>`;
    }
}

async function loadParteFSLinkedFiles(parteId) {
    const div = document.getElementById("parteFSLinkedFilesList");
    div.innerHTML = "<p class='text-muted small'>Cargando archivos adjuntos...</p>";
    try {
        const archivos = await apiFetch(`/partes/${parteId}/archivos`);
        if (!archivos.length) {
            div.innerHTML = "<p class='text-muted small'>No hay archivos adjuntos a esta parte.</p>";
            return;
        }
        let html = `<table><thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Descargar</th><th>Acción</th></tr></thead><tbody>`;
        archivos.forEach(a => {
            html += `<tr>
                <td>#${a.archivo_id}</td>
                <td>${escapeHtml(a.nombre)}</td>
                <td>${getStatusBadge(a.estado)}</td>
                <td>
                    <a href="${API_BASE}/archivos/${a.archivo_id}/download" target="_blank" class="btn btn-sm btn-success">
                        <i class="fa-solid fa-download"></i> Descargar File
                    </a>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="unlinkArchivoParteFS(${parteId}, ${a.archivo_id})">
                        <i class="fa-solid fa-unlink"></i> Desvincular
                    </button>
                </td>
            </tr>`;
        });
        html += "</tbody></table>";
        div.innerHTML = html;
    } catch (err) {
        div.innerHTML = `<span class="text-danger small">Error: ${err.message}</span>`;
    }
}

async function unlinkArchivoParteFS(parteId, archivoId) {
    if (!confirm("¿Desvincular este archivo de la parte?")) return;
    try {
        await apiFetch(`/partes/${parteId}/archivos/${archivoId}`, { method: "DELETE" });
        loadParteFSLinkedFiles(parteId);
    } catch (err) {
        alert(err.message);
    }
}

async function deleteParteCurrentFS() {
    const parteId = document.getElementById("editParteFSId").value;
    if (!confirm(`¿Desea eliminar permanentemente la parte #${parteId}?`)) return;
    try {
        await apiFetch(`/partes/${parteId}`, { method: "DELETE" });
        closeParteDetailView();
        loadPartesTable();
    } catch (err) {
        alert(`Error al eliminar: ${err.message}`);
    }
}

// =========================================================
// SECTION 4: PERSONAS / STAKEHOLDERS
// =========================================================
async function loadStakeholdersTab() {
    switchPeopleSubTab(currentPeopleSubTab);
}

async function switchPeopleSubTab(subType) {
    currentPeopleSubTab = subType;
    document.querySelectorAll(".people-subnav .btn").forEach(b => {
        b.classList.remove("btn-primary", "btn-secondary", "active");
        b.classList.add("btn-secondary");
    });

    const activeBtn = document.getElementById(`btnPeople${subType.charAt(0).toUpperCase() + subType.slice(1)}`);
    if (activeBtn) {
        activeBtn.classList.remove("btn-secondary");
        activeBtn.classList.add("btn-primary", "active");
    }

    const div = document.getElementById("stakeholdersList");
    div.innerHTML = "<p class='text-muted'>Cargando personas...</p>";

    try {
        if (subType === "all") {
            cachePersonas = await apiFetch("/personas");
            renderPersonasTable(cachePersonas);
        } else if (subType === "empleados") {
            cacheEmpleados = await apiFetch("/empleados");
            renderEmpleadosTable(cacheEmpleados);
        } else if (subType === "clientes") {
            cacheClientes = await apiFetch("/clientes");
            renderClientesTable(cacheClientes);
        } else if (subType === "proveedores") {
            cacheProveedores = await apiFetch("/proveedores");
            renderProveedoresTable(cacheProveedores);
        }
    } catch (err) {
        div.innerHTML = `<span class="text-danger">Error: ${err.message}</span>`;
    }
}

function filterPersonasTable() {
    const searchText = (document.getElementById("filterPersonaSearch").value || "").toLowerCase();

    if (currentPeopleSubTab === "all") {
        const filtered = cachePersonas.filter(p => 
            (p.nombre || "").toLowerCase().includes(searchText) ||
            (p.apellido || "").toLowerCase().includes(searchText) ||
            (p.cuit || "").toLowerCase().includes(searchText)
        );
        renderPersonasTable(filtered);
    } else if (currentPeopleSubTab === "empleados") {
        const filtered = cacheEmpleados.filter(e => 
            (e.nombre || "").toLowerCase().includes(searchText) ||
            (e.apellido || "").toLowerCase().includes(searchText) ||
            (e.puesto || "").toLowerCase().includes(searchText)
        );
        renderEmpleadosTable(filtered);
    } else if (currentPeopleSubTab === "clientes") {
        const filtered = cacheClientes.filter(c => 
            (c.nombre || "").toLowerCase().includes(searchText) ||
            (c.apellido || "").toLowerCase().includes(searchText) ||
            (c.dependencia || "").toLowerCase().includes(searchText)
        );
        renderClientesTable(filtered);
    } else if (currentPeopleSubTab === "proveedores") {
        const filtered = cacheProveedores.filter(pr => 
            (pr.nombre || "").toLowerCase().includes(searchText) ||
            (pr.apellido || "").toLowerCase().includes(searchText) ||
            (pr.dependencia || "").toLowerCase().includes(searchText)
        );
        renderProveedoresTable(filtered);
    }
}

function renderPersonasTable(data) {
    const div = document.getElementById("stakeholdersList");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No se encontraron personas.</p>";
        return;
    }
    let html = `<div class="table-responsive"><table><thead><tr><th>ID</th><th>Nombre</th><th>Apellido</th><th>Teléfono</th><th>CUIT</th><th>Ciudad</th><th>Acciones</th></tr></thead><tbody>`;
    data.forEach(p => {
        html += `<tr>
            <td><strong>#${p.persona_id}</strong></td>
            <td>${escapeHtml(p.nombre || '')}</td>
            <td>${escapeHtml(p.apellido || '')}</td>
            <td>${escapeHtml(p.telefono || '-')}</td>
            <td>${escapeHtml(p.cuit || '-')}</td>
            <td>${escapeHtml(p.direccion_ciudad || '-')}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deletePersona(${p.persona_id})">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table></div>";
    div.innerHTML = html;
}

function renderEmpleadosTable(data) {
    const div = document.getElementById("stakeholdersList");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No hay empleados registrados.</p>";
        return;
    }
    let html = `<div class="table-responsive"><table><thead><tr><th>ID</th><th>Nombre</th><th>Apellido</th><th>Puesto</th><th>Sueldo</th><th>CUIT</th><th>Acciones</th></tr></thead><tbody>`;
    data.forEach(e => {
        html += `<tr>
            <td><strong>#${e.empleado_id}</strong></td>
            <td>${escapeHtml(e.nombre || '')}</td>
            <td>${escapeHtml(e.apellido || '')}</td>
            <td>${escapeHtml(e.puesto || '-')}</td>
            <td>$${parseFloat(e.sueldo || 0).toFixed(2)}</td>
            <td>${escapeHtml(e.cuit || '-')}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deletePersona(${e.persona_id})">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table></div>";
    div.innerHTML = html;
}

function renderClientesTable(data) {
    const div = document.getElementById("stakeholdersList");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No hay clientes registrados.</p>";
        return;
    }
    let html = `<div class="table-responsive"><table><thead><tr><th>ID</th><th>Nombre</th><th>Apellido</th><th>Dependencia</th><th>CUIT</th><th>Acciones</th></tr></thead><tbody>`;
    data.forEach(c => {
        html += `<tr>
            <td><strong>#${c.cliente_id}</strong></td>
            <td>${escapeHtml(c.nombre || '')}</td>
            <td>${escapeHtml(c.apellido || '')}</td>
            <td>${escapeHtml(c.dependencia || '-')}</td>
            <td>${escapeHtml(c.cuit || '-')}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deletePersona(${c.persona_id})">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table></div>";
    div.innerHTML = html;
}

function renderProveedoresTable(data) {
    const div = document.getElementById("stakeholdersList");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No hay proveedores registrados.</p>";
        return;
    }
    let html = `<div class="table-responsive"><table><thead><tr><th>ID</th><th>Nombre</th><th>Apellido</th><th>Dependencia</th><th>CUIT</th><th>Acciones</th></tr></thead><tbody>`;
    data.forEach(pr => {
        html += `<tr>
            <td><strong>#${pr.proveedor_id}</strong></td>
            <td>${escapeHtml(pr.nombre || '')}</td>
            <td>${escapeHtml(pr.apellido || '')}</td>
            <td>${escapeHtml(pr.dependencia || '-')}</td>
            <td>${escapeHtml(pr.cuit || '-')}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deletePersona(${pr.persona_id})">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });
    html += "</tbody></table></div>";
    div.innerHTML = html;
}

// =========================================================
// SECTION 5: STOCK & MOVIMIENTOS (TOGGLE SUB-TABS)
// =========================================================
async function loadStockTab() {
    switchStockSubTab(currentStockSubTab);
}

async function switchStockSubTab(subType) {
    currentStockSubTab = subType;
    const btnLevels = document.getElementById("btnStockLevels");
    const btnMovements = document.getElementById("btnStockMovements");
    const viewLevels = document.getElementById("stockLevelsView");
    const viewMovements = document.getElementById("stockMovementsView");

    if (subType === "levels") {
        btnLevels.classList.remove("btn-secondary");
        btnLevels.classList.add("btn-primary", "active");
        btnMovements.classList.remove("btn-primary", "active");
        btnMovements.classList.add("btn-secondary");

        viewLevels.classList.remove("hidden");
        viewMovements.classList.add("hidden");

        try {
            cacheStock = await apiFetch("/stock");
            renderStockTable(cacheStock);
        } catch (err) {
            document.getElementById("stockLevelsTable").innerHTML = `Error: ${err.message}`;
        }
    } else {
        btnMovements.classList.remove("btn-secondary");
        btnMovements.classList.add("btn-primary", "active");
        btnLevels.classList.remove("btn-primary", "active");
        btnLevels.classList.add("btn-secondary");

        viewMovements.classList.remove("hidden");
        viewLevels.classList.add("hidden");

        try {
            cacheMovimientos = await apiFetch("/stock/movimientos");
            renderStockMovementsTable(cacheMovimientos);
        } catch (err) {
            document.getElementById("stockMovementsTable").innerHTML = `Error: ${err.message}`;
        }
    }
}

function filterStockTable() {
    const searchText = (document.getElementById("filterStockSearch").value || "").toLowerCase();
    const filtered = cacheStock.filter(s => (s.nombre || "").toLowerCase().includes(searchText) || (s.categoria || "").toLowerCase().includes(searchText));
    renderStockTable(filtered);
}

function renderStockTable(data) {
    document.getElementById("stockLevelsTable").innerHTML = renderTable(data, ["parte_id", "nombre", "categoria", "unidad", "stock_actual"]);
}

function filterMovimientosTable() {
    const searchText = (document.getElementById("filterMovSearch").value || "").toLowerCase();
    const filtered = cacheMovimientos.filter(m => (m.parte_nombre || "").toLowerCase().includes(searchText) || (m.usuario_mail || "").toLowerCase().includes(searchText));
    renderStockMovementsTable(filtered);
}

function renderStockMovementsTable(data) {
    document.getElementById("stockMovementsTable").innerHTML = renderTable(data, ["movimiento_id", "parte_nombre", "cantidad", "usuario_mail", "fecha"]);
}

// =========================================================
// SECTION 6: ARCHIVOS CATALOG (FULL-SCREEN VIEW & VERSIONING)
// =========================================================
async function loadArchivosTable() {
    const div = document.getElementById("archivosTable");
    div.innerHTML = "<p class='text-muted'>Cargando catálogo de archivos...</p>";
    try {
        cacheArchivos = await apiFetch("/archivos");
        renderArchivosTable(cacheArchivos);
    } catch (err) {
        div.innerHTML = `<span class="text-danger">Error al cargar archivos: ${err.message}</span>`;
    }
}

function filterArchivosTable() {
    const searchText = (document.getElementById("filterArchSearch").value || "").toLowerCase();
    const filtered = cacheArchivos.filter(a => (a.nombre || "").toLowerCase().includes(searchText));
    renderArchivosTable(filtered);
}

function renderArchivosTable(data) {
    const div = document.getElementById("archivosTable");
    if (!Array.isArray(data) || data.length === 0) {
        div.innerHTML = "<p class='text-muted p-3'>No hay archivos en el catálogo.</p>";
        return;
    }

    let html = `<div class="table-responsive"><table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Nombre Archivo</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th>Versión Actual</th>
                <th>Ubicación S3</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>`;

    data.forEach(a => {
        const relVerNum = a.version_num ? `v${a.version_num}` : 'v1';
        html += `<tr class="clickable-row" onclick="openArchivoDetailFS(${a.archivo_id})">
            <td><strong>#${a.archivo_id}</strong></td>
            <td><strong>${escapeHtml(a.nombre)}</strong></td>
            <td>${escapeHtml(a.descripcion || "-")}</td>
            <td>${getStatusBadge(a.estado)}</td>
            <td><span class="badge badge-info">${relVerNum}</span></td>
            <td><code>${escapeHtml(a.version_ubicacion || "-")}</code></td>
            <td>
                <a href="${API_BASE}/archivos/${a.archivo_id}/download" target="_blank" onclick="event.stopPropagation();" class="btn btn-sm btn-success me-1">
                    <i class="fa-solid fa-download"></i> Descargar
                </a>
                <button class="btn btn-sm btn-primary me-1" onclick="event.stopPropagation(); openArchivoDetailFS(${a.archivo_id})">
                    <i class="fa-solid fa-code-branch"></i> Cargar Versión
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteArchivo(${a.archivo_id}, event)">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </button>
            </td>
        </tr>`;
    });

    html += "</tbody></table></div>";
    div.innerHTML = html;
}

async function openArchivoDetailFS(archId) {
    document.getElementById("archivosListView").classList.add("hidden");
    document.getElementById("archivoDetailView").classList.remove("hidden");
    document.getElementById("editArchFSId").value = archId;

    try {
        const archivos = await apiFetch("/archivos");
        const arch = archivos.find(a => a.archivo_id === archId);
        if (arch) {
            document.getElementById("detailArchScreenTitle").textContent = `Archivo: ${arch.nombre} (#${arch.archivo_id})`;
        }

        loadArchFSVersionsList(archId);
    } catch (err) {
        alert(err.message);
        closeArchivoDetailView();
    }
}

function closeArchivoDetailView() {
    document.getElementById("archivoDetailView").classList.add("hidden");
    document.getElementById("archivosListView").classList.remove("hidden");
}

async function loadArchFSVersionsList(archId) {
    const div = document.getElementById("archFSVersionsList");
    div.innerHTML = "<p class='text-muted small'>Cargando versiones...</p>";
    try {
        const versions = await apiFetch(`/archivos/${archId}/versions`);
        if (!versions.length) {
            div.innerHTML = "<p class='text-muted small'>No hay historial de versiones para este archivo.</p>";
            return;
        }

        let html = `<table><thead><tr><th>Nº Versión</th><th>Fecha de Carga</th><th>Usuario Registrador</th><th>Ubicación S3</th><th>Descargar File</th></tr></thead><tbody>`;
        versions.forEach(v => {
            const displayVer = v.version_num ? `v${v.version_num}` : `v${v.version_id}`;
            html += `<tr>
                <td><strong>${displayVer}</strong> <span class="text-muted small">(ID: #${v.version_id})</span></td>
                <td>${new Date(v.fecha).toLocaleString()}</td>
                <td>${v.usuario_mail || `Usuario #${v.user_id}`}</td>
                <td><code>${escapeHtml(v.ubicacion)}</code></td>
                <td>
                    <a href="${API_BASE}/archivos/${archId}/download" target="_blank" class="btn btn-sm btn-success">
                        <i class="fa-solid fa-download"></i> Descargar ${displayVer}
                    </a>
                </td>
            </tr>`;
        });
        html += "</tbody></table>";
        div.innerHTML = html;
    } catch (err) {
        div.innerHTML = `<span class="text-danger small">Error al cargar versiones: ${err.message}</span>`;
    }
}

// Finanzas
async function loadFinanzasTab() {
    try {
        cacheIngresos = await apiFetch("/ingresos");
        cacheEgresos = await apiFetch("/egresos");
        renderFinanzasTables(cacheIngresos, cacheEgresos);
    } catch (err) {
        console.error(err);
    }
}

function filterFinanzasTables() {
    const searchText = (document.getElementById("filterFinanzasSearch").value || "").toLowerCase();
    const filteredIng = cacheIngresos.filter(i => (i.descripcion || "").toLowerCase().includes(searchText));
    const filteredEgr = cacheEgresos.filter(eg => (eg.descripcion || "").toLowerCase().includes(searchText));
    renderFinanzasTables(filteredIng, filteredEgr);
}

function renderFinanzasTables(ingresos, egresos) {
    const ingDiv = document.getElementById("ingresosTable");
    if (!Array.isArray(ingresos) || ingresos.length === 0) {
        ingDiv.innerHTML = "<p class='text-muted p-3'>No hay ingresos registrados.</p>";
    } else {
        let html = `<div class="table-responsive"><table><thead><tr><th>ID</th><th>Monto ($)</th><th>Descripción</th><th>Proyecto</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;
        ingresos.forEach(i => {
            html += `<tr>
                <td><strong>#${i.ingreso_id}</strong></td>
                <td class="text-success"><strong>+$${parseFloat(i.monto).toFixed(2)}</strong></td>
                <td>${escapeHtml(i.descripcion || '-')}</td>
                <td>${escapeHtml(i.proyecto_nombre || '-')}</td>
                <td>${i.fecha ? new Date(i.fecha).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteIngreso(${i.ingreso_id})">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </td>
            </tr>`;
        });
        html += "</tbody></table></div>";
        ingDiv.innerHTML = html;
    }

    const egrDiv = document.getElementById("egresosTable");
    if (!Array.isArray(egresos) || egresos.length === 0) {
        egrDiv.innerHTML = "<p class='text-muted p-3'>No hay egresos registrados.</p>";
    } else {
        let html = `<div class="table-responsive"><table><thead><tr><th>ID</th><th>Monto ($)</th><th>Descripción</th><th>Proyecto</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;
        egresos.forEach(eg => {
            html += `<tr>
                <td><strong>#${eg.egreso_id}</strong></td>
                <td class="text-danger"><strong>-$${parseFloat(eg.monto).toFixed(2)}</strong></td>
                <td>${escapeHtml(eg.descripcion || '-')}</td>
                <td>${escapeHtml(eg.proyecto_nombre || '-')}</td>
                <td>${eg.fecha ? new Date(eg.fecha).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteEgreso(${eg.egreso_id})">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </td>
            </tr>`;
        });
        html += "</tbody></table></div>";
        egrDiv.innerHTML = html;
    }
}

// Obsolete Representative Queries removed in favor of Agente RAG & NL2SQL Assistant

// =========================================================
// FORM SUBMISSION HANDLERS
// =========================================================
function setupModalFormSubmissions() {
    // Edit Proyecto FS Form
    document.getElementById("formEditProyectoFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projId = document.getElementById("editProjFSId").value;
        const payload = {
            nombre: document.getElementById("editProjFSNombre").value,
            estado: document.getElementById("editProjFSEstado").value,
            fecha_inicio: document.getElementById("editProjFSFechaInicio").value || null,
            fecha_fin: document.getElementById("editProjFSFechaFin").value || null
        };
        try {
            await apiFetch(`/proyectos/${projId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            alert("Proyecto actualizado con éxito.");
            openProyectoDetailFS(projId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Assign Parte to Proj FS Form
    document.getElementById("formAssignParteProjFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projId = document.getElementById("editProjFSId").value;
        const parteId = document.getElementById("assignParteFSSelect").value;
        const cantidad = parseFloat(document.getElementById("assignParteFSCantidad").value);
        try {
            await apiFetch(`/proyectos/${projId}/partes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parte_id: parseInt(parteId), cantidad })
            });
            openProyectoDetailFS(projId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Assign Doc to Proj FS Form
    document.getElementById("formAssignDocProjFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projId = document.getElementById("editProjFSId").value;
        const docId = document.getElementById("assignDocFSSelect").value;
        try {
            await apiFetch(`/proyectos/${projId}/documentos/${docId}`, { method: "POST" });
            openProyectoDetailFS(projId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Assign Persona to Proj FS Form
    document.getElementById("formAssignPersonaProjFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projId = document.getElementById("editProjFSId").value;
        const personaId = document.getElementById("assignPersonaFSSelect").value;
        const rol = document.getElementById("assignPersonaFSRol").value;
        try {
            await apiFetch(`/proyectos/${projId}/personas`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ persona_id: parseInt(personaId), rol })
            });
            openProyectoDetailFS(projId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Add Direct Ingreso to Project Form
    document.getElementById("formAddDirectIngresoProj").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projId = parseInt(document.getElementById("editProjFSId").value);
        const monto = parseFloat(document.getElementById("directIngMonto").value);
        const descripcion = document.getElementById("directIngDesc").value;

        try {
            await apiFetch("/ingresos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    monto,
                    descripcion,
                    proyecto_id: projId
                })
            });
            document.getElementById("directIngMonto").value = "";
            document.getElementById("directIngDesc").value = "";
            openProyectoDetailFS(projId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Add Direct Egreso to Project Form
    document.getElementById("formAddDirectEgresoProj").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projId = parseInt(document.getElementById("editProjFSId").value);
        const monto = parseFloat(document.getElementById("directEgrMonto").value);
        const descripcion = document.getElementById("directEgrDesc").value;

        try {
            await apiFetch("/egresos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    monto,
                    descripcion,
                    proyecto_id: projId
                })
            });
            document.getElementById("directEgrMonto").value = "";
            document.getElementById("directEgrDesc").value = "";
            openProyectoDetailFS(projId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Edit Documento FS Form
    document.getElementById("formEditDocumentoFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const docId = document.getElementById("editDocFSId").value;
        const payload = {
            nombre: document.getElementById("editDocFSNombre").value,
            descripcion: document.getElementById("editDocFSDesc").value,
            estado: document.getElementById("editDocFSEstado").value,
            acceso: document.getElementById("editDocFSAcceso").value
        };
        try {
            await apiFetch(`/documentos/${docId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            alert("Documento actualizado con éxito.");
            openDocumentoDetailFS(docId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Upload New Doc FS Version Form
    document.getElementById("formUploadNewDocFSVersion").addEventListener("submit", async (e) => {
        e.preventDefault();
        const docId = document.getElementById("editDocFSId").value;
        const fileInput = document.getElementById("newDocFSVersionFile");
        if (!fileInput.files.length) return alert("Seleccione un archivo");

        const formData = new FormData();
        formData.append("file", fileInput.files[0]);

        try {
            const headers = {};
            if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
            const res = await fetch(`${API_BASE}/documentos/${docId}/versions`, {
                method: "POST",
                headers,
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: "Error" }));
                throw new Error(errData.detail || "Error al subir versión");
            }

            alert("Nueva versión cargada exitosamente.");
            fileInput.value = "";
            loadDocFSVersionsList(docId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Edit Parte FS Form
    document.getElementById("formEditParteFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const parteId = document.getElementById("editParteFSId").value;
        const payload = {
            nombre: document.getElementById("editParteFSNombre").value,
            categoria: document.getElementById("editParteFSCategoria").value,
            unidad: document.getElementById("editParteFSUnidad").value,
            es_ensamble: document.getElementById("editParteFSEsEnsamble").checked,
            es_comercial: document.getElementById("editParteFSEsComercial").checked
        };
        try {
            await apiFetch(`/partes/${parteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            alert("Parte actualizada.");
            openParteDetailFS(parteId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Add Subparte FS Form
    document.getElementById("formAddSubparteFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const padreId = document.getElementById("editParteFSId").value;
        const hijoId = document.getElementById("selectChildParteFS").value;
        const cantidad = parseInt(document.getElementById("childParteFSCantidad").value);
        try {
            await apiFetch(`/partes/${padreId}/subpartes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hijo_id: parseInt(hijoId), cantidad })
            });
            loadParteFSSubpartes(padreId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Add Supplier Quote FS Form
    document.getElementById("formAddCotizacionFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const parteId = document.getElementById("editParteFSId").value;
        const proveedorId = document.getElementById("selectQuoteProveedorFS").value;
        const monto = parseFloat(document.getElementById("quoteFSMonto").value);
        try {
            await apiFetch("/partes/cotizaciones", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    proveedor_id: parseInt(proveedorId),
                    parte_id: parseInt(parteId),
                    monto: monto
                })
            });
            document.getElementById("quoteFSMonto").value = "";
            loadParteFSCotizaciones(parteId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Link Archivo to Parte FS Form
    document.getElementById("formLinkArchivoParteFS").addEventListener("submit", async (e) => {
        e.preventDefault();
        const parteId = document.getElementById("editParteFSId").value;
        const archivoId = document.getElementById("linkArchivoParteFSSelect").value;
        try {
            await apiFetch(`/partes/${parteId}/archivos/${archivoId}`, { method: "POST" });
            loadParteFSLinkedFiles(parteId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Upload New Archivo Catalog Version FS Form
    document.getElementById("formUploadNewArchFSVersion").addEventListener("submit", async (e) => {
        e.preventDefault();
        const archId = document.getElementById("editArchFSId").value;
        const fileInput = document.getElementById("newArchFSVersionFile");
        if (!fileInput.files.length) return alert("Seleccione un archivo");

        const formData = new FormData();
        formData.append("file", fileInput.files[0]);

        try {
            const headers = {};
            if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
            const res = await fetch(`${API_BASE}/archivos/${archId}/versions`, {
                method: "POST",
                headers,
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: "Error" }));
                throw new Error(errData.detail || "Error al subir versión de archivo");
            }

            alert("Nueva versión de archivo cargada exitosamente.");
            fileInput.value = "";
            loadArchFSVersionsList(archId);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Proyecto Form
    document.getElementById("formProyecto").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById("projNombre").value,
            estado: document.getElementById("projEstado").value
        };
        try {
            await apiFetch("/proyectos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            closeModal("modalProyecto");
            document.getElementById("formProyecto").reset();
            loadProyectosTable();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Parte Form
    document.getElementById("formParte").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById("parteNombre").value,
            unidad: document.getElementById("parteUnidad").value,
            categoria: document.getElementById("parteCategoria").value,
            es_ensamble: document.getElementById("parteEsEnsamble").checked,
            es_comercial: true
        };
        try {
            await apiFetch("/partes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            closeModal("modalParte");
            document.getElementById("formParte").reset();
            loadPartesTable();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Documento Form
    document.getElementById("formDocumento").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById("docFile");
        if (!fileInput.files.length) return alert("Seleccione un archivo");

        const formData = new FormData();
        formData.append("nombre", document.getElementById("docNombre").value);
        formData.append("descripcion", document.getElementById("docDesc").value);
        formData.append("estado", document.getElementById("docEstado").value);
        formData.append("acceso", document.getElementById("docAcceso").value);
        formData.append("file", fileInput.files[0]);

        try {
            const headers = {};
            if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
            const res = await fetch(`${API_BASE}/documentos`, {
                method: "POST",
                headers,
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: "Error" }));
                throw new Error(errData.detail || "Error al crear documento");
            }

            closeModal("modalDocumento");
            document.getElementById("formDocumento").reset();
            loadDocumentosTable();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Persona Form
    document.getElementById("formPersona").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById("perNombre").value,
            apellido: document.getElementById("perApellido").value,
            cuit: document.getElementById("perCuit").value || null,
            telefono: document.getElementById("perTelefono").value || null,
            direccion_ciudad: document.getElementById("perCiudad").value || null
        };
        try {
            await apiFetch("/personas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            closeModal("modalPersona");
            document.getElementById("formPersona").reset();
            loadStakeholdersTab();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Movimiento Form
    document.getElementById("formMovimiento").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            parte_id: parseInt(document.getElementById("movParteId").value),
            cantidad: parseFloat(document.getElementById("movCantidad").value)
        };
        try {
            await apiFetch("/stock/movimientos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            closeModal("modalMovimiento");
            document.getElementById("formMovimiento").reset();
            loadStockTab();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Archivo Catalog Form
    document.getElementById("formArchivo").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById("archFile");
        if (!fileInput.files.length) return alert("Seleccione un archivo");

        const formData = new FormData();
        formData.append("nombre", document.getElementById("archNombre").value);
        formData.append("descripcion", document.getElementById("archDesc").value);
        formData.append("file", fileInput.files[0]);

        try {
            const headers = {};
            if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
            const res = await fetch(`${API_BASE}/archivos`, {
                method: "POST",
                headers,
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: "Error" }));
                throw new Error(errData.detail || "Error al subir archivo");
            }

            closeModal("modalArchivo");
            document.getElementById("formArchivo").reset();
            loadArchivosTable();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Ingreso Form
    document.getElementById("formIngreso").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projIdVal = document.getElementById("ingProjId").value;
        const payload = {
            monto: parseFloat(document.getElementById("ingMonto").value),
            descripcion: document.getElementById("ingDesc").value,
            proyecto_id: projIdVal ? parseInt(projIdVal) : null
        };
        try {
            await apiFetch("/ingresos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            closeModal("modalIngreso");
            document.getElementById("formIngreso").reset();
            loadFinanzasTab();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });

    // Create Egreso Form
    document.getElementById("formEgreso").addEventListener("submit", async (e) => {
        e.preventDefault();
        const projIdVal = document.getElementById("egrProjId").value;
        const payload = {
            monto: parseFloat(document.getElementById("egrMonto").value),
            descripcion: document.getElementById("egrDesc").value,
            proyecto_id: projIdVal ? parseInt(projIdVal) : null
        };
        try {
            await apiFetch("/egresos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            closeModal("modalEgreso");
            document.getElementById("formEgreso").reset();
            loadFinanzasTab();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    });
}

// Populate Select Helpers
async function populatePartesSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option>Cargando partes...</option>";
    try {
        const partes = await apiFetch("/partes");
        select.innerHTML = partes.map(p => `<option value="${p.parte_id}">#${p.parte_id} - ${escapeHtml(p.nombre)} (${p.categoria})</option>`).join("");
    } catch (err) {
        select.innerHTML = "<option>Error al cargar partes</option>";
    }
}

async function populatePartesSelectExcept(elementId, excludeId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option>Cargando partes...</option>";
    try {
        const partes = await apiFetch("/partes");
        const filtered = partes.filter(p => p.parte_id !== parseInt(excludeId));
        select.innerHTML = filtered.map(p => `<option value="${p.parte_id}">#${p.parte_id} - ${escapeHtml(p.nombre)} (${p.categoria})</option>`).join("");
    } catch (err) {
        select.innerHTML = "<option>Error al cargar partes</option>";
    }
}

async function populateProveedoresSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option>Cargando proveedores...</option>";
    try {
        const proveedores = await apiFetch("/proveedores");
        select.innerHTML = proveedores.map(pr => `<option value="${pr.proveedor_id}">#${pr.proveedor_id} - ${escapeHtml(pr.nombre)} ${escapeHtml(pr.apellido)} (${escapeHtml(pr.dependencia || 'Empresa')})</option>`).join("");
    } catch (err) {
        select.innerHTML = "<option>Error al cargar proveedores</option>";
    }
}

async function populateDocumentosSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option>Cargando documentos...</option>";
    try {
        const docs = await apiFetch("/documentos");
        select.innerHTML = docs.map(d => `<option value="${d.documento_id}">#${d.documento_id} - ${escapeHtml(d.nombre)}</option>`).join("");
    } catch (err) {
        select.innerHTML = "<option>Error al cargar documentos</option>";
    }
}

async function populatePersonasSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option>Cargando personas...</option>";
    try {
        const personas = await apiFetch("/personas");
        select.innerHTML = personas.map(p => `<option value="${p.persona_id}">#${p.persona_id} - ${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</option>`).join("");
    } catch (err) {
        select.innerHTML = "<option>Error al cargar personas</option>";
    }
}

async function populateProyectosSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option value=''>Sin Proyecto</option>";
    try {
        const proyectos = await apiFetch("/proyectos");
        select.innerHTML += proyectos.map(p => `<option value="${p.proyecto_id}">#${p.proyecto_id} - ${escapeHtml(p.nombre)}</option>`).join("");
    } catch (err) {
        console.error(err);
    }
}

async function populateArchivosSelect(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = "<option>Cargando archivos...</option>";
    try {
        const archivos = await apiFetch("/archivos");
        select.innerHTML = archivos.map(a => `<option value="${a.archivo_id}">#${a.archivo_id} - ${escapeHtml(a.nombre)}</option>`).join("");
    } catch (err) {
        select.innerHTML = "<option>Error al cargar archivos</option>";
    }
}

// Rendering Helpers
function renderTable(data, cols) {
    if (!Array.isArray(data) || data.length === 0) return "<p class='text-muted small p-3'>No se encontraron registros.</p>";
    
    let html = "<div class='table-responsive'><table><thead><tr>";
    cols.forEach(c => html += `<th>${c.toUpperCase().replace(/_/g, ' ')}</th>`);
    html += "</tr></thead><tbody>";

    data.forEach(row => {
        html += "<tr>";
        cols.forEach(c => {
            let val = row[c];
            if (val === null || val === undefined) val = "-";
            else if (typeof val === "object") val = JSON.stringify(val);
            else if (typeof val === "string" && val.length > 80) val = escapeHtml(val.substring(0, 80)) + "...";
            else val = escapeHtml(String(val));
            html += `<td>${val}</td>`;
        });
        html += "</tr>";
    });

    html += "</tbody></table></div>";
    return html;
}

function getStatusBadge(status) {
    if (!status) return '<span class="badge badge-secondary">-</span>';
    const s = status.toUpperCase();
    if (s === "EN_PROGRESO" || s === "APROBADO") return `<span class="badge badge-success">${s}</span>`;
    if (s === "PAUSADO" || s === "EN_REVISION") return `<span class="badge badge-warning">${s}</span>`;
    if (s === "CANCELADO" || s === "RECHAZADO") return `<span class="badge badge-danger">${s}</span>`;
    if (s === "FINALIZADO") return `<span class="badge badge-info">${s}</span>`;
    return `<span class="badge badge-secondary">${s}</span>`;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDateTimeInput(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 16);
    } catch {
        return "";
    }
}

// =========================================================
// NL2SQL Natural Language Chat Handlers
// =========================================================

function useNL2SQLPrompt(promptText) {
    const input = document.getElementById("nl2sqlInput");
    if (!input) return;
    input.value = promptText;
    input.focus();
    handleNL2SQLSubmit();
}

async function handleNL2SQLSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById("nl2sqlInput");
    const sendBtn = document.getElementById("nl2sqlSendBtn");
    const chatMessages = document.getElementById("chatMessages");
    if (!input || !chatMessages) return;

    const promptText = input.value.trim();
    if (!promptText) return;

    // Clear input
    input.value = "";

    // 1. Render User Message
    const userMsgId = "msg_user_" + Date.now();
    const userHtml = `
        <div id="${userMsgId}" class="chat-message user">
            <div class="message-content">
                <p>${escapeHtml(promptText)}</p>
            </div>
            <div class="avatar"><i class="fa-solid fa-user"></i></div>
        </div>
    `;
    chatMessages.insertAdjacentHTML("beforeend", userHtml);

    // 2. Render Assistant Loading Message
    const loadingId = "msg_loading_" + Date.now();
    const loadingHtml = `
        <div id="${loadingId}" class="chat-message assistant">
            <div class="avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-content loading-content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
                <p class="small text-muted mb-0 mt-1">Traduciendo a SQL y consultando la base de datos...</p>
            </div>
        </div>
    `;
    chatMessages.insertAdjacentHTML("beforeend", loadingHtml);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Disable input while processing
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
        const response = await apiFetch("/queries/nl2sql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: promptText })
        });

        // Remove loading element
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        // 3. Render Assistant Response Message
        const responseMsgId = "msg_ai_" + Date.now();
        const sqlBoxId = "sql_" + responseMsgId;
        const tableBoxId = "table_" + responseMsgId;

        let tableHtml = "";
        if (Array.isArray(response.results) && response.results.length > 0) {
            const cols = Object.keys(response.results[0]);
            tableHtml = renderTable(response.results, cols);
        } else {
            tableHtml = "<p class='text-muted small p-2'>No se retornaron filas para esta consulta.</p>";
        }

        const aiHtml = `
            <div id="${responseMsgId}" class="chat-message assistant">
                <div class="avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content">
                    <div class="natural-answer mb-3">
                        ${renderMarkdown(response.answer)}
                    </div>

                    <div class="chat-actions-bar mb-2">
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleChatDetails('${sqlBoxId}')">
                            <i class="fa-solid fa-code"></i> Consulta SQL Generada
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="toggleChatDetails('${tableBoxId}')">
                            <i class="fa-solid fa-table"></i> Ver Tabla (${response.row_count} registros)
                        </button>
                    </div>

                    <div id="${sqlBoxId}" class="sql-preview-box hidden mb-2">
                        <div class="box-header">
                            <span><i class="fa-solid fa-terminal"></i> PostgreSQL SELECT (Read-Only)</span>
                            <button class="btn-copy" onclick="copyToClipboard('${sqlBoxId}_code')"><i class="fa-solid fa-copy"></i> Copiar</button>
                        </div>
                        <pre id="${sqlBoxId}_code"><code>${escapeHtml(response.sql)}</code></pre>
                    </div>

                    <div id="${tableBoxId}" class="table-preview-box hidden mb-2">
                        <div class="box-header mb-1">
                            <span><i class="fa-solid fa-database"></i> Resultados raw (${response.row_count} filas)</span>
                        </div>
                        ${tableHtml}
                    </div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML("beforeend", aiHtml);

    } catch (err) {
        // Remove loading element
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        const errorMsgId = "msg_err_" + Date.now();
        const errorHtml = `
            <div id="${errorMsgId}" class="chat-message assistant error">
                <div class="avatar" style="background:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div class="message-content">
                    <p class="text-danger fw-bold mb-1">Error al procesar la consulta:</p>
                    <p class="small mb-0">${escapeHtml(err.message)}</p>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML("beforeend", errorHtml);
    } finally {
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function toggleChatDetails(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.toggle("hidden");
    }
}

function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        navigator.clipboard.writeText(el.innerText || el.textContent);
    }
}

// =========================================================
// Markdown Rendering Helper (Marked.js with Fallback)
// =========================================================
function renderMarkdown(text) {
    if (!text) return "";
    
    // Use marked library if available
    if (typeof marked !== "undefined" && marked.parse) {
        try {
            return marked.parse(text);
        } catch (e) {
            console.warn("Error parsing markdown with marked:", e);
        }
    }

    // Fallback lightweight markdown parser
    let formatted = escapeHtml(text);
    
    // Code blocks ```code```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold **text**
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic *text*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Headers (### Header)
    formatted = formatted.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // Lists (- Bullet point or * Bullet point)
    formatted = formatted.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    formatted = formatted.replace(/<\/ul>\s*<ul>/g, '');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
}

// =========================================================
// Agente RAG Chat Handlers (NVIDIA Nemotron 3 & pgvector)
// =========================================================
function useRAGPrompt(text) {
    const input = document.getElementById("ragChatInput");
    if (input) {
        input.value = text;
        sendRAGChatMessage();
    }
}

async function sendRAGChatMessage() {
    const input = document.getElementById("ragChatInput");
    const sendBtn = document.getElementById("btnSendRAGChat");
    const chatHistory = document.getElementById("ragChatHistory");

    if (!input || !chatHistory) return;

    const promptText = input.value.trim();
    if (!promptText) return;

    // Clear input
    input.value = "";

    // 1. Render User Message
    const userMsgId = "rag_user_" + Date.now();
    const userHtml = `
        <div id="${userMsgId}" class="chat-message user">
            <div class="avatar"><i class="fa-solid fa-user"></i></div>
            <div class="message-content">
                <p class="mb-0">${escapeHtml(promptText)}</p>
            </div>
        </div>
    `;
    chatHistory.insertAdjacentHTML("beforeend", userHtml);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // 2. Render Loading State Indicator
    const loadingId = "rag_loading_" + Date.now();
    const loadingHtml = `
        <div id="${loadingId}" class="chat-message assistant">
            <div class="avatar" style="background: linear-gradient(135deg, #10b981, #3b82f6);"><i class="fa-solid fa-brain"></i></div>
            <div class="message-content">
                <div class="typing-indicator mb-1">
                    <span></span><span></span><span></span>
                </div>
                <p class="small text-muted mb-0">Generando embeddings (NVIDIA Nemotron 3 embed 1B) y buscando en documentos...</p>
            </div>
        </div>
    `;
    chatHistory.insertAdjacentHTML("beforeend", loadingHtml);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
        const response = await apiFetch("/rag/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: promptText })
        });

        // Remove loading element
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        // Build Sources HTML
        let sourcesHtml = "";
        if (Array.isArray(response.sources) && response.sources.length > 0) {
            sourcesHtml += `
                <div class="rag-sources-container">
                    <div class="rag-sources-header">
                        <i class="fa-solid fa-file-invoice"></i> Fuentes Consultadas (${response.sources.length}):
                    </div>
            `;
            response.sources.forEach(src => {
                const distText = src.distancia ? `Distancia: ${src.distancia}` : "";
                sourcesHtml += `
                    <div class="rag-source-item">
                        <div class="rag-source-title">
                            <span><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(src.documento_nombre)} (Frag #${src.numero})</span>
                            <span class="rag-source-badge">Doc ID: ${src.documento_id} ${distText ? '• ' + distText : ''}</span>
                        </div>
                        <div class="rag-source-excerpt">
                            "${escapeHtml(src.contenido)}"
                        </div>
                    </div>
                `;
            });
            sourcesHtml += `</div>`;
        } else {
            sourcesHtml = `
                <div class="rag-sources-container">
                    <p class="text-muted small mb-0"><i class="fa-solid fa-info-circle"></i> No se encontraron fuentes de documentos específicas para esta consulta.</p>
                </div>
            `;
        }

        // 3. Render Assistant Response Message
        const aiMsgId = "rag_ai_" + Date.now();
        const aiHtml = `
            <div id="${aiMsgId}" class="chat-message assistant">
                <div class="avatar" style="background: linear-gradient(135deg, #10b981, #3b82f6);"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content">
                    <div class="natural-answer">
                        ${renderMarkdown(response.answer)}
                    </div>
                    ${sourcesHtml}
                </div>
            </div>
        `;
        chatHistory.insertAdjacentHTML("beforeend", aiHtml);

    } catch (err) {
        // Remove loading element
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        const errorHtml = `
            <div class="chat-message assistant error">
                <div class="avatar" style="background:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div class="message-content">
                    <p class="text-danger fw-bold mb-1">Error en el Agente RAG:</p>
                    <p class="small mb-0">${escapeHtml(err.message)}</p>
                </div>
            </div>
        `;
        chatHistory.insertAdjacentHTML("beforeend", errorHtml);
    } finally {
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

// Expose RAG Chat functions to window scope
window.sendRAGChatMessage = sendRAGChatMessage;
window.useRAGPrompt = useRAGPrompt;
window.renderMarkdown = renderMarkdown;

// =========================================================
// Entity Deletion Handlers & Window Exposures
// =========================================================
async function deleteProyecto(proyectoId, e) {
    if (e) e.stopPropagation();
    if (!confirm(`¿Estás seguro de eliminar el Proyecto #${proyectoId}?`)) return;
    try {
        await apiFetch(`/proyectos/${proyectoId}`, { method: "DELETE" });
        loadProyectosTable();
    } catch (err) {
        alert(`Error al eliminar proyecto: ${err.message}`);
    }
}

async function deleteProyectoCurrentFS() {
    const projId = document.getElementById("editProjFSId").value;
    if (!projId) return;
    if (!confirm(`¿Estás seguro de eliminar el Proyecto #${projId}?`)) return;
    try {
        await apiFetch(`/proyectos/${projId}`, { method: "DELETE" });
        closeProyectoDetailView();
        loadProyectosTable();
    } catch (err) {
        alert(`Error al eliminar proyecto: ${err.message}`);
    }
}

async function deleteParte(parteId, e) {
    if (e) e.stopPropagation();
    if (!confirm(`¿Estás seguro de eliminar la Parte #${parteId}?`)) return;
    try {
        await apiFetch(`/partes/${parteId}`, { method: "DELETE" });
        loadPartesTable();
    } catch (err) {
        alert(`Error al eliminar parte: ${err.message}`);
    }
}

async function deleteDocumento(documentoId, e) {
    if (e) e.stopPropagation();
    if (!confirm(`¿Estás seguro de eliminar el Documento #${documentoId}?`)) return;
    try {
        await apiFetch(`/documentos/${documentoId}`, { method: "DELETE" });
        loadDocumentosTable();
    } catch (err) {
        alert(`Error al eliminar documento: ${err.message}`);
    }
}

async function deleteDocumentoCurrentFS() {
    const docId = document.getElementById("editDocFSId").value;
    if (!docId) return;
    if (!confirm(`¿Estás seguro de eliminar el Documento #${docId}?`)) return;
    try {
        await apiFetch(`/documentos/${docId}`, { method: "DELETE" });
        closeDocumentoDetailView();
        loadDocumentosTable();
    } catch (err) {
        alert(`Error al eliminar documento: ${err.message}`);
    }
}

async function deleteArchivo(archivoId, e) {
    if (e) e.stopPropagation();
    if (!confirm(`¿Estás seguro de eliminar el Archivo #${archivoId}?`)) return;
    try {
        await apiFetch(`/archivos/${archivoId}`, { method: "DELETE" });
        loadArchivosTable();
    } catch (err) {
        alert(`Error al eliminar archivo: ${err.message}`);
    }
}

async function deleteArchivoCurrentFS() {
    const archId = document.getElementById("editArchFSId").value;
    if (!archId) return;
    if (!confirm(`¿Estás seguro de eliminar el Archivo #${archId}?`)) return;
    try {
        await apiFetch(`/archivos/${archId}`, { method: "DELETE" });
        closeArchivoDetailView();
        loadArchivosTable();
    } catch (err) {
        alert(`Error al eliminar archivo: ${err.message}`);
    }
}

async function deletePersona(personaId, e) {
    if (e) e.stopPropagation();
    if (!confirm(`¿Estás seguro de eliminar la Persona #${personaId}?`)) return;
    try {
        await apiFetch(`/personas/${personaId}`, { method: "DELETE" });
        loadStakeholdersTab();
    } catch (err) {
        alert(`Error al eliminar persona: ${err.message}`);
    }
}

async function deleteCotizacion(parteId, proveedorId) {
    if (!confirm("¿Estás seguro de eliminar esta cotización?")) return;
    try {
        await apiFetch(`/partes/${parteId}/cotizaciones/${proveedorId}`, { method: "DELETE" });
        loadCotizacionesFS(parteId);
    } catch (err) {
        alert(`Error al eliminar cotización: ${err.message}`);
    }
}

async function deleteIngreso(ingresoId) {
    if (!confirm(`¿Estás seguro de eliminar el Ingreso #${ingresoId}?`)) return;
    try {
        await apiFetch(`/ingresos/${ingresoId}`, { method: "DELETE" });
        loadFinanzasTab();
    } catch (err) {
        alert(`Error al eliminar ingreso: ${err.message}`);
    }
}

async function deleteEgreso(egresoId) {
    if (!confirm(`¿Estás seguro de eliminar el Egreso #${egresoId}?`)) return;
    try {
        await apiFetch(`/egresos/${egresoId}`, { method: "DELETE" });
        loadFinanzasTab();
    } catch (err) {
        alert(`Error al eliminar egreso: ${err.message}`);
    }
}

// Window scope exports
window.deleteProyecto = deleteProyecto;
window.deleteProyectoCurrentFS = deleteProyectoCurrentFS;
window.deleteParte = deleteParte;
window.deleteParteCurrentFS = deleteParteCurrentFS;
window.deleteDocumento = deleteDocumento;
window.deleteDocumentoCurrentFS = deleteDocumentoCurrentFS;
window.deleteArchivo = deleteArchivo;
window.deleteArchivoCurrentFS = deleteArchivoCurrentFS;
window.deletePersona = deletePersona;
window.deleteCotizacion = deleteCotizacion;
window.deleteIngreso = deleteIngreso;
window.deleteEgreso = deleteEgreso;

