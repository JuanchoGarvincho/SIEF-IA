import { assignedCardTemplate, questionsTemplate, resultCardTemplate } from "./components/templates.js";
import { getAssignedProjects, getProjectByStand, getRankedResults, saveEvaluation } from "./services/juradoService.js";

document.addEventListener("DOMContentLoaded", async () => {
  setupProfileModal();

  const page = document.querySelector(".jury-phone")?.dataset.page;

  if (page === "panel") {
    await setupPanelPage();
    return;
  }

  if (page === "evaluacion") {
    await setupEvaluationPage();
    return;
  }

  if (page === "resultados") {
    await setupResultsPage();
  }
});

async function setupPanelPage() {
  const list = document.getElementById("juryList");
  const count = document.getElementById("assignedCount");
  const searchInput = document.getElementById("standSearch");

  if (!list || !count || !searchInput) {
    return;
  }

  const projects = await getAssignedProjects();
  count.textContent = String(projects.length);
  list.innerHTML = projects.map(assignedCardTemplate).join("");

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      const content = `${project.stand} ${project.title} ${project.category}`.toLowerCase();
      return content.includes(query);
    });

    list.innerHTML = filtered.map(assignedCardTemplate).join("");
  });
}

async function setupEvaluationPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedStand = params.get("stand") || "";

  const project = await getProjectByStand(requestedStand);
  if (!project) {
    return;
  }

  const standLabel = document.getElementById("standLabel");
  const projectTitle = document.getElementById("projectTitle");
  const projectCategory = document.getElementById("projectCategory");
  const projectStudent = document.getElementById("projectStudent");
  const aiQuestions = document.getElementById("aiQuestions");

  if (standLabel) {
    standLabel.textContent = `Stand ${project.stand}`;
  }
  if (projectTitle) {
    projectTitle.textContent = project.title;
  }
  if (projectCategory) {
    projectCategory.textContent = `Categoria: ${project.category}`;
  }
  if (projectStudent) {
    projectStudent.textContent = `Estudiante: ${project.student}`;
  }
  if (aiQuestions) {
    aiQuestions.innerHTML = questionsTemplate(project);
  }

  setupScoreButtons();
  hydrateSavedScores(project.scores);

  const noteInput = document.getElementById("notaJurado");
  if (noteInput && project.note) {
    noteInput.value = project.note;
  }

  const submitButton = document.querySelector(".jury-submit");
  if (!submitButton) {
    return;
  }

  submitButton.addEventListener("click", async () => {
    const note = document.getElementById("notaJurado")?.value.trim() || "";
    const scores = {
      innovacion: getSelectedScore("innovacion"),
      viabilidad: getSelectedScore("viabilidad"),
      sustentacion: getSelectedScore("sustentacion")
    };

    await saveEvaluation({
      stand: project.stand,
      scores,
      note
    });

    window.location.href = "../resultados/index.html";
  });
}

function setupScoreButtons() {
  const groups = Array.from(document.querySelectorAll(".jury-score-group"));

  groups.forEach((group) => {
    const buttons = Array.from(group.querySelectorAll("button"));
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((btn) => btn.classList.remove("is-on"));
        button.classList.add("is-on");
      });
    });
  });
}

function getSelectedScore(fieldName) {
  const group = document.querySelector(`.jury-score-group[data-field="${fieldName}"]`);
  if (!group) {
    return 0;
  }

  const active = group.querySelector("button.is-on");
  if (!active) {
    return 0;
  }

  return Number(active.textContent || 0);
}

function hydrateSavedScores(savedScores) {
  if (!savedScores) {
    return;
  }

  Object.entries(savedScores).forEach(([field, value]) => {
    const group = document.querySelector(`.jury-score-group[data-field="${field}"]`);
    if (!group) {
      return;
    }

    const buttons = Array.from(group.querySelectorAll("button"));
    buttons.forEach((button) => {
      button.classList.toggle("is-on", Number(button.textContent) === Number(value));
    });
  });
}

async function setupResultsPage() {
  const list = document.getElementById("resultsList");
  if (!list) {
    return;
  }

  const results = await getRankedResults();
  if (!results.length) {
    list.innerHTML = `
      <article class="card jury-card">
        <div class="card__body">
          <h2>Sin evaluaciones registradas</h2>
          <p class="jury-subline">Cuando califiques proyectos, apareceran aqui ordenados por mejor nota.</p>
        </div>
      </article>
    `;
    return;
  }

  list.innerHTML = results.map(resultCardTemplate).join("");

  const best = results[0];
  if (!best) {
    return;
  }

  const bestName = document.getElementById("bestProjectName");
  const bestStand = document.getElementById("bestProjectStand");
  const bestCategory = document.getElementById("bestProjectCategory");
  const bestScore = document.getElementById("bestProjectScore");

  if (bestName) {
    bestName.textContent = best.title;
  }
  if (bestStand) {
    bestStand.textContent = `Stand ${best.stand}`;
  }
  if (bestCategory) {
    bestCategory.textContent = `Categoria: ${best.category}`;
  }
  if (bestScore) {
    bestScore.textContent = `${best.score} / 100`;
  }
}

function setupProfileModal() {
  const link = document.getElementById("perfilLink");
  const overlay = document.getElementById("perfilOverlay");
  const closeButton = document.getElementById("perfilClose");
  const logoutButton = document.getElementById("perfilLogout");

  if (!link || !overlay) {
    return;
  }

  const correoField = document.getElementById("perfilCorreo");
  if (correoField) {
    try {
      const session = JSON.parse(localStorage.getItem("etitc-session") || "null");
      if (session?.correo) {
        correoField.textContent = session.correo;
      }
    } catch (error) {
      localStorage.removeItem("etitc-session");
    }
  }

  const openModal = () => {
    overlay.hidden = false;
  };

  const closeModal = () => {
    overlay.hidden = true;
  };

  link.addEventListener("click", (event) => {
    event.preventDefault();
    openModal();
  });

  closeButton?.addEventListener("click", closeModal);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeModal();
    }
  });

  logoutButton?.addEventListener("click", () => {
    localStorage.removeItem("etitc-session");
    window.location.href = "../../LOGIN/index.html?rol=jurado";
  });
}
