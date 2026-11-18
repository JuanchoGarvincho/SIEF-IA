export const LOGIN_URL = "../../LOGIN/index.html?rol=jurado";
const API_BASE = window.localStorage.getItem("etitc-api-base") || "https://sief-ia-backend.onrender.com";

export function readSession() {
  try {
    return JSON.parse(window.localStorage.getItem("etitc-session") || "null");
  } catch {
    window.localStorage.removeItem("etitc-session");
    return null;
  }
}

export function logout() {
  window.localStorage.removeItem("etitc-session");
  window.location.href = LOGIN_URL;
}

// Llama al backend con el token del jurado. Si la sesión venció, vuelve al login.
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${readSession()?.token || ""}`,
      ...(options.headers || {})
    }
  });
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error("Sesión vencida");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }
  return data;
}

export function getAssignedProjects() {
  return request("/jurado/proyectos/asignados");
}

export function getProjectByStand(stand) {
  return request(`/jurado/proyectos/${encodeURIComponent(stand)}`);
}

export function saveEvaluation(payload) {
  return request("/jurado/evaluaciones", { method: "POST", body: JSON.stringify(payload) });
}

export function getRankedResults() {
  return request("/jurado/resultados?sort=score_desc");
}
