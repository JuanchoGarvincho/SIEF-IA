function statusLabel(status, score) {
  if (status === "completado") {
    return `${score} / 100`;
  }
  return "Pendiente";
}

function statusClass(status) {
  return status === "completado" ? "jury-status--ok" : "jury-status--pending";
}

export function assignedCardTemplate(project) {
  return `
    <a class="jury-item card" href="../evaluacion/index.html?stand=${encodeURIComponent(project.stand)}">
      <div class="jury-item__top">
        <span class="jury-stand">Stand ${project.stand}</span>
        <span class="jury-status ${statusClass(project.status)}">${statusLabel(project.status, project.score)}</span>
      </div>
      <div class="jury-item__title">${project.title}</div>
      <div class="jury-item__meta">Categoria: ${project.category}</div>
    </a>
  `;
}

export function resultCardTemplate(project) {
  return `
    <article class="jury-item card jury-result-item" data-score="${project.score}">
      <div class="jury-item__top">
        <span class="jury-stand">Stand ${project.stand}</span>
        <span class="jury-status jury-status--ok">${project.score} / 100</span>
      </div>
      <div class="jury-item__title">${project.title}</div>
      <div class="jury-item__meta">Categoria: ${project.category}</div>
    </article>
  `;
}

export function questionsTemplate(project) {
  return (project.aiQuestions || []).map((question) => `<li>${question}</li>`).join("");
}
