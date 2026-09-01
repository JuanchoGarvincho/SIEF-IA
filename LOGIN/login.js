document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("rol");
  const note = document.getElementById("loginNote");
  const form = document.getElementById("loginForm");

  if (!roleSelect || !note || !form) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get("rol");

  if (roleParam === "jurado" || roleParam === "estudiantes") {
    roleSelect.value = roleParam;
  }

  const updateNote = () => {
    note.textContent = roleSelect.value === "jurado"
      ? "Solo jurados y coordinadores autorizados pueden ingresar a este modulo."
      : "Solo estudiantes y docentes autorizados pueden ingresar a este modulo.";
  };

  updateNote();
  roleSelect.addEventListener("change", updateNote);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const role = roleSelect.value;
    if (role === "jurado") {
      window.location.href = "../Parte_Jurado/panel/index.html";
      return;
    }

    window.location.href = "../Parte_Estudiantes/INSCRIPCION/index.html";
  });
});
