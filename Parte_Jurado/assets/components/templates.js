// Todo texto que viene de la base de datos o de la IA se escapa antes de ponerlo en el HTML
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// En la base los stands ya vienen como "Stand A01"; se evita mostrar "Stand Stand A01"
export function standLabel(stand) {
  const text = String(stand ?? "");
  return /^stand\b/i.test(text) ? text : `Stand ${text}`;
}

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
        <span class="jury-stand">${esc(standLabel(project.stand))}</span>
        <span class="jury-status ${statusClass(project.status)}">${statusLabel(project.status, project.score)}</span>
      </div>
      <div class="jury-item__title">${esc(project.title)}</div>
      <div class="jury-item__meta">Categoria: ${esc(project.category)}</div>
    </a>
  `;
}

export function resultCardTemplate(project) {
  return `
    <article class="jury-item card jury-result-item" data-score="${project.score}">
      <div class="jury-item__top">
        <span class="jury-stand">${esc(standLabel(project.stand))}</span>
        <span class="jury-status jury-status--ok">${project.score} / 100</span>
      </div>
      <div class="jury-item__title">${esc(project.title)}</div>
      <div class="jury-item__meta">Categoria: ${esc(project.category)}</div>
      ${project.feedbackIA ? `<p class="jury-item__meta jury-feedback"><strong>IA:</strong> ${esc(project.feedbackIA)}</p>` : ""}
    </article>
  `;
}

export function questionsTemplate(project) {
  const questions = project.aiQuestions || [];
  if (!questions.length) {
    return "<li>El estudiante aún no tiene preguntas generadas por IA.</li>";
  }
  return questions.map((question) => `<li>${esc(question)}</li>`).join("");
}
