import { MOCK_PROJECTS } from "../data/mockData.js";

const STORAGE_KEY = "etitc-jurado-evaluations-v1";
const API_BASE = window.localStorage.getItem("etitc-api-base") || "";
const USE_MOCK = API_BASE === "";

function readEvaluations() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeEvaluations(data) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function buildScore(scores) {
  const total = Number(scores.innovacion || 0) + Number(scores.viabilidad || 0) + Number(scores.sustentacion || 0);
  return Math.round((total / 15) * 100);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json();
}

function mergeWithEvaluations(project) {
  const evaluations = readEvaluations();
  const saved = evaluations[project.stand];
  const score = saved?.score ?? (project.status === "completado" ? (project.seedScore ?? 0) : 0);
  const status = saved ? "completado" : project.status;

  return {
    ...project,
    status,
    score,
    note: saved?.note || "",
    scores: saved?.scores || null,
    updatedAt: saved?.updatedAt || null
  };
}

export async function getAssignedProjects() {
  if (!USE_MOCK) {
    return request("/jurado/proyectos/asignados");
  }

  return MOCK_PROJECTS.map(mergeWithEvaluations);
}

export async function getProjectByStand(stand) {
  if (!USE_MOCK) {
    return request(`/jurado/proyectos/${encodeURIComponent(stand)}`);
  }

  const projects = await getAssignedProjects();
  return projects.find((project) => project.stand === stand) || projects[0] || null;
}

export async function saveEvaluation(payload) {
  if (!USE_MOCK) {
    return request("/jurado/evaluaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  const evaluations = readEvaluations();
  const score = buildScore(payload.scores || {});

  evaluations[payload.stand] = {
    stand: payload.stand,
    status: "completado",
    scores: payload.scores,
    note: payload.note || "",
    score,
    updatedAt: new Date().toISOString()
  };

  writeEvaluations(evaluations);
  return evaluations[payload.stand];
}

export async function getRankedResults() {
  if (!USE_MOCK) {
    return request("/jurado/resultados?sort=score_desc");
  }

  const projects = await getAssignedProjects();
  return projects
    .filter((project) => project.status === "completado" && Number(project.score) > 0)
    .sort((a, b) => Number(b.score) - Number(a.score));
}
