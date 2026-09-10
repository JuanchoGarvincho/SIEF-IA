document.addEventListener("DOMContentLoaded", () => {
  setActiveNavLink();
  animateProgressBars();
  setupInscripcionDraft();
  setupProfileMenu();
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

function setupProfileMenu() {
  const chip = document.querySelector(".user-chip");
  if (!chip) {
    return;
  }

  const studentText = chip.textContent.trim();
  const loginUrl = "../../LOGIN/index.html?rol=estudiantes";

  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "0");
  chip.classList.add("user-chip--clickable");

  const overlay = document.createElement("div");
  overlay.className = "profile-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="profile-modal card" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
      <button class="profile-modal__close" type="button" aria-label="Cerrar">&times;</button>
      <div class="profile-modal__avatar" aria-hidden="true">ES</div>
      <h2 class="profile-modal__title" id="profileModalTitle">${studentText}</h2>
      <p class="profile-modal__status"></p>
      <a class="btn btn--primary profile-modal__action" href="${loginUrl}">Iniciar sesion</a>
      <button class="btn btn--ghost profile-modal__logout" type="button" hidden>Cerrar sesion</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const statusText = overlay.querySelector(".profile-modal__status");
  const loginAction = overlay.querySelector(".profile-modal__action");
  const logoutButton = overlay.querySelector(".profile-modal__logout");
  const closeButton = overlay.querySelector(".profile-modal__close");

  const refreshSessionState = () => {
    let session = null;
    try {
      session = JSON.parse(localStorage.getItem("etitc-session") || "null");
    } catch (error) {
      localStorage.removeItem("etitc-session");
    }

    if (session?.correo) {
      statusText.textContent = `Sesion iniciada como ${session.correo}`;
      loginAction.hidden = true;
      logoutButton.hidden = false;
    } else {
      statusText.textContent = "Aun no has iniciado sesion.";
      loginAction.hidden = false;
      logoutButton.hidden = true;
    }
  };

  const openModal = () => {
    refreshSessionState();
    overlay.hidden = false;
  };

  const closeModal = () => {
    overlay.hidden = true;
  };

  chip.addEventListener("click", openModal);
  chip.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openModal();
    }
  });

  closeButton.addEventListener("click", closeModal);
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

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("etitc-session");
    window.location.href = loginUrl;
  });
}