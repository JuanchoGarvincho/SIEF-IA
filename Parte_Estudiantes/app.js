const LOGIN_URL = "../../LOGIN/index.html?rol=estudiantes";
const API_BASE = localStorage.getItem("etitc-api-base") || "https://sief-ia-backend.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const session = readSession();
  // Todas las páginas del estudiante exigen sesión: sin token se vuelve al login
  if (!session?.token || session.rol !== "estudiantes") {
    window.location.replace(LOGIN_URL);
    return;
  }

  setActiveNavLink();
  setupProfileMenu(session);
  setupInscripcion();
  setupMiProyecto();
  setupCalificaciones();
});

function readSession() {
  try {
    return JSON.parse(localStorage.getItem("etitc-session") || "null");
  } catch {
    localStorage.removeItem("etitc-session");
    return null;
  }
}

function logout() {
  localStorage.removeItem("etitc-session");
  window.location.href = LOGIN_URL;
}

// Llama al backend con el token. Si la sesión venció, vuelve al login.
async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${readSession()?.token || ""}`,
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    logout();
    throw new Error("Sesión vencida");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// Todo texto que viene de la base de datos o de la IA se escapa antes de ponerlo en el HTML
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function listItems(items) {
  return items
    .map((text) => `<li class="diagnostic__item"><span class="diagnostic__dot"></span><span>${esc(text)}</span></li>`)
    .join("");
}

// Reinicia la animación de llenado de una barra con el nuevo ancho
function setBar(bar, percent) {
  if (!bar) return;
  bar.style.animation = "none";
  bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  void bar.offsetWidth;
  bar.style.animation = "";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setActiveNavLink() {
  const links = Array.from(document.querySelectorAll(".nav__link"));
  const currentPath = decodeURIComponent(window.location.pathname);
  const match = links.find((link) => {
    const linkPath = decodeURIComponent(new URL(link.getAttribute("href"), window.location.href).pathname);
    return currentPath.endsWith(linkPath.split("/").pop());
  });
  if (match) {
    links.forEach((link) => link.classList.remove("is-active"));
    match.classList.add("is-active");
  }
}

/* ===================== Inscripción ===================== */

function setupInscripcion() {
  const form = document.getElementById("inscripcionForm");
  if (!form) return;

  const estado = document.getElementById("inscripcionEstado");
  const btnGuardar = document.getElementById("btnGuardar");
  const btnDiagnostico = document.getElementById("btnDiagnostico");
  const consentimiento = document.getElementById("consentimientoCampo");

  // Si ya tiene proyecto, se carga para que pueda editarlo
  api("/estudiante/proyecto")
    .then((proyecto) => {
      form.elements.tituloProyecto.value = proyecto.titulo || "";
      form.elements.resumenTecnico.value = proyecto.resumen || "";
      if (proyecto.categoria) {
        const select = form.elements.categoria;
        if (![...select.options].some((o) => o.value === proyecto.categoria)) {
          select.add(new Option(proyecto.categoria, proyecto.categoria));
        }
        select.value = proyecto.categoria;
      }
      btnGuardar.textContent = "Actualizar inscripción";
      // Ya autorizó el tratamiento de datos al inscribirse la primera vez
      if (consentimiento) consentimiento.hidden = true;
      estado.textContent = `Proyecto inscrito${proyecto.stand ? ` · ${proyecto.stand}` : ""}. Puedes actualizarlo cuando quieras.`;
    })
    .catch((error) => {
      if (error.status !== 404) estado.textContent = `No se pudo cargar tu proyecto: ${error.message}`;
    });

  const datos = () => ({
    tituloProyecto: form.elements.tituloProyecto.value.trim(),
    categoria: form.elements.categoria.value,
    resumenTecnico: form.elements.resumenTecnico.value.trim()
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { ...datos(), aceptaTratamientoDatos: Boolean(form.elements.aceptaDatos?.checked) };
    if (!body.tituloProyecto) {
      estado.textContent = "Escribe el título del proyecto.";
      return;
    }

    btnGuardar.disabled = true;
    estado.textContent = "Guardando y generando las preguntas del jurado con IA (puede tardar unos segundos)...";
    try {
      const proyecto = await api("/estudiante/inscripcion", { method: "POST", body: JSON.stringify(body) });
      btnGuardar.textContent = "Actualizar inscripción";
      if (consentimiento) consentimiento.hidden = true;
      const preguntas = proyecto.preguntasIA?.length
        ? `La IA generó ${proyecto.preguntasIA.length} preguntas: míralas en "Mi Proyecto".`
        : "La IA no respondió esta vez; vuelve a guardar más tarde para generar las preguntas.";
      estado.textContent = `Inscripción guardada${proyecto.stand ? ` · ${proyecto.stand}` : ""}. ${preguntas}`;
    } catch (error) {
      estado.textContent = error.message;
    } finally {
      btnGuardar.disabled = false;
    }
  });

  btnDiagnostico?.addEventListener("click", async () => {
    btnDiagnostico.disabled = true;
    setText("diagPuntaje", "...");
    setText("diagResumen", "Analizando tu propuesta con IA...");
    document.getElementById("diagObservaciones").innerHTML = "";
    try {
      const diag = await api("/estudiante/diagnostico", { method: "POST", body: JSON.stringify(datos()) });
      setText("diagPuntaje", `${diag.puntaje}%`);
      setText("diagResumen", diag.resumen);
      setBar(document.getElementById("diagBarra"), diag.puntaje);
      document.getElementById("diagObservaciones").innerHTML = listItems(diag.observaciones || []);
    } catch (error) {
      setText("diagPuntaje", "--");
      setText("diagResumen", error.message);
      setBar(document.getElementById("diagBarra"), 0);
    } finally {
      btnDiagnostico.disabled = false;
    }
  });
}

/* ===================== Mi Proyecto ===================== */

async function setupMiProyecto() {
  const pasos = document.getElementById("avancePasos");
  if (!pasos) return;

  let proyecto;
  try {
    proyecto = await api("/estudiante/proyecto");
  } catch (error) {
    setText("avancePorcentaje", "0%");
    setText("proyectoTitulo", error.status === 404 ? "Aún no tienes un proyecto inscrito" : error.message);
    pasos.innerHTML = `<li class="diagnostic__item"><span class="diagnostic__dot"></span><span>Ve a <a href="../INSCRIPCION/index.html"><strong>Inscripción</strong></a> para registrar tu proyecto.</span></li>`;
    document.getElementById("preguntasIA").innerHTML = listItems(["Las preguntas aparecen cuando inscribas tu proyecto."]);
    return;
  }

  const notas = await api("/estudiante/calificaciones").catch(() => ({ evaluado: false }));

  // El avance se calcula con las etapas reales del proyecto en la feria
  const etapas = [
    ["Proyecto inscrito", true],
    ["Stand asignado", Boolean(proyecto.stand)],
    ["Preguntas de sustentación generadas por IA", proyecto.preguntasIA.length > 0],
    [notas.evaluado ? `Evaluado por ${notas.evaluaciones} jurado(s)` : "Pendiente de evaluación del jurado", Boolean(notas.evaluado)]
  ];
  const hechas = etapas.filter(([, ok]) => ok).length;
  const porcentaje = Math.round((hechas / etapas.length) * 100);

  setText("avancePorcentaje", `${porcentaje}%`);
  setText("proyectoTitulo", `${proyecto.titulo}${proyecto.categoria ? ` · ${proyecto.categoria}` : ""}`);
  setBar(document.getElementById("avanceBarra"), porcentaje);
  pasos.innerHTML = etapas
    .map(([texto, ok]) => `<li class="diagnostic__item"><span class="diagnostic__dot${ok ? "" : " diagnostic__dot--pending"}"></span><span>${esc(texto)}</span></li>`)
    .join("");

  document.getElementById("preguntasIA").innerHTML = proyecto.preguntasIA.length
    ? listItems(proyecto.preguntasIA)
    : listItems(["Aún no hay preguntas. Guarda de nuevo tu inscripción para que la IA las genere."]);

  setText("standAsignado", proyecto.stand || "Sin stand");
  setText("salonAsignado", proyecto.salon || "Ubicación por definir");
  setText("standDetalle", proyecto.stand
    ? "Este es el lugar donde presentarás tu proyecto el día de la feria."
    : "Aún no tienes un stand asignado.");
}

/* ===================== Calificaciones ===================== */

function etiquetaNota(nota) {
  if (nota >= 90) return "Excelente";
  if (nota >= 80) return "Sobresaliente";
  if (nota >= 70) return "Bueno";
  if (nota >= 60) return "Aceptable";
  return "Por mejorar";
}

async function setupCalificaciones() {
  const rubrica = document.getElementById("rubrica");
  if (!rubrica) return;

  const feedback = document.getElementById("feedbackIA");
  const comentarios = document.getElementById("comentariosJurado");

  let notas;
  try {
    notas = await api("/estudiante/calificaciones");
  } catch (error) {
    notas = { evaluado: false, mensaje: error.status === 404 ? "Aún no tienes un proyecto inscrito." : error.message };
  }

  if (!notas.evaluado) {
    setText("notaFinal", "--");
    setText("notaEtiqueta", "Sin calificar");
    setText("notaDetalle", notas.mensaje || "Tu proyecto aún no ha sido evaluado.");
    feedback.innerHTML = `<p class="helper">La retroalimentación aparece cuando un jurado califique tu proyecto.</p>`;
    comentarios.innerHTML = "";
    rubrica.innerHTML = `<tr><td colspan="3">Sin calificaciones todavía.</td></tr>`;
    return;
  }

  setText("notaFinal", `${notas.puntajeFinal} / 100`);
  setText("notaEtiqueta", etiquetaNota(notas.puntajeFinal));
  setText("notaDetalle", `Promedio de ${notas.evaluaciones} evaluación(es) del jurado.`);
  setBar(document.getElementById("notaBarra"), notas.puntajeFinal);

  feedback.innerHTML = notas.feedbackIA.length
    ? notas.feedbackIA
        .map((texto) => `
          <div class="comment" style="margin-bottom: 1rem;">
            <div class="comment__meta"><span>IA</span><span class="tag">Gemini</span></div>
            <p style="margin: 0; color: var(--text);">${esc(texto)}</p>
          </div>`)
        .join("")
    : `<p class="helper">La IA aún no ha generado retroalimentación para tu proyecto.</p>`;

  comentarios.innerHTML = notas.comentarios
    .map((c) => `
      <div class="comment">
        <div class="comment__meta"><span>${esc(c.jurado)}</span><span>Nota rápida</span></div>
        <p style="margin: 0;">${esc(c.nota)}</p>
      </div>`)
    .join("");

  rubrica.innerHTML = notas.criterios
    .map((c) => `
      <tr>
        <td>${esc(c.criterio)}</td>
        <td>${c.promedio ? `${c.promedio} / ${c.maximo}` : "-"}</td>
        <td>${c.promedio ? esc(etiquetaNota((c.promedio / c.maximo) * 100)) : "Sin puntaje"}</td>
      </tr>`)
    .join("");
}

/* ===================== Perfil ===================== */

function setupProfileMenu(session) {
  const chip = document.querySelector(".user-chip");
  if (!chip) return;

  const usuario = session.usuario || {};
  const nombre = usuario.nombre || session.correo;
  const iniciales = String(nombre).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  chip.textContent = `${nombre} | Estudiante${usuario.cedula ? ` · CC ${usuario.cedula}` : ""}`;

  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "0");
  chip.classList.add("user-chip--clickable");

  const overlay = document.createElement("div");
  overlay.className = "profile-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="profile-modal card" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
      <button class="profile-modal__close" type="button" aria-label="Cerrar">&times;</button>
      <div class="profile-modal__avatar" aria-hidden="true">${esc(iniciales || "ES")}</div>
      <h2 class="profile-modal__title" id="profileModalTitle">${esc(nombre)}</h2>
      <p class="profile-modal__status">Sesión iniciada como ${esc(session.correo)}</p>
      <button class="btn btn--primary profile-modal__logout" type="button">Cerrar sesión</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const openModal = () => { overlay.hidden = false; };
  const closeModal = () => { overlay.hidden = true; };

  chip.addEventListener("click", openModal);
  chip.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openModal();
    }
  });
  overlay.querySelector(".profile-modal__close").addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeModal();
  });
  overlay.querySelector(".profile-modal__logout").addEventListener("click", logout);
}
