document.addEventListener("DOMContentLoaded", () => {
  setActiveNavLink();
  animateProgressBars();
  setupInscripcionDraft();
});

function setActiveNavLink() {
  const links = Array.from(document.querySelectorAll(".nav__link"));
  if (!links.length) {
    return;
  }

  const currentPath = decodeURIComponent(window.location.pathname);
  let bestMatch = null;

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) {
      continue;
    }

    const absoluteUrl = new URL(href, window.location.href);
    const linkPath = decodeURIComponent(absoluteUrl.pathname);
    if (currentPath.endsWith(linkPath.split("/").pop())) {
      bestMatch = link;
      break;
    }
  }

  if (bestMatch) {
    links.forEach((link) => link.classList.remove("is-active"));
    bestMatch.classList.add("is-active");
  }
}

function animateProgressBars() {
  const bars = document.querySelectorAll(".progress__bar, .meter__fill");
  bars.forEach((bar) => {
    const targetWidth = bar.style.width || window.getComputedStyle(bar).width;
    if (!targetWidth || targetWidth === "0px") {
      return;
    }

    bar.dataset.targetWidth = targetWidth;
    bar.style.width = "0";
    bar.style.transition = "width 0.9s cubic-bezier(0.16, 1, 0.3, 1)";
  });

  requestAnimationFrame(() => {
    bars.forEach((bar) => {
      if (bar.dataset.targetWidth) {
        bar.style.width = bar.dataset.targetWidth;
      }
    });
  });
}

function setupInscripcionDraft() {
  const form = document.getElementById("inscripcionForm");
  if (!form) {
    return;
  }

  const fields = ["tituloProyecto", "categoria", "resumenTecnico"];
  const storageKey = "etitc-inscripcion-draft";

  const rawDraft = localStorage.getItem(storageKey);
  if (rawDraft) {
    try {
      const draft = JSON.parse(rawDraft);
      fields.forEach((name) => {
        if (draft[name] && form.elements[name]) {
          form.elements[name].value = draft[name];
        }
      });
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const draft = {};
    fields.forEach((name) => {
      draft[name] = form.elements[name].value.trim();
    });
    localStorage.setItem(storageKey, JSON.stringify(draft));
    window.alert("Inscripción guardada localmente como borrador.");
  });

  fields.forEach((name) => {
    const field = form.elements[name];
    if (!field) {
      return;
    }
    field.addEventListener("input", () => {
      const draft = {};
      fields.forEach((fieldName) => {
        const value = form.elements[fieldName]?.value || "";
        draft[fieldName] = value;
      });
      localStorage.setItem(storageKey, JSON.stringify(draft));
    });
  });
}