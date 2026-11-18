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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const role = roleSelect.value;
    const correo = document.getElementById("correo")?.value.trim() || "";
    const clave = document.getElementById("clave")?.value || "";

    // URL del backend: se puede cambiar con localStorage "etitc-api-base" (ej. la URL de Render)
    const apiBase = localStorage.getItem("etitc-api-base") || "http://localhost:3000";

    let data;
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, clave, rol: role })
      });
      data = await response.json();
      if (!response.ok) {
        note.textContent = data.error || "No se pudo iniciar sesion.";
        return;
      }
    } catch {
      note.textContent = "No hay conexion con el servidor. Revisa que el backend este encendido.";
      return;
    }

    localStorage.setItem("etitc-api-base", apiBase);
    localStorage.setItem("etitc-session", JSON.stringify({ rol: role, correo, token: data.token, usuario: data.usuario }));

    if (role === "jurado") {
      window.location.href = "../Parte_Jurado/panel/index.html";
      return;
    }

    window.location.href = "../Parte_Estudiantes/INSCRIPCION/index.html";
  });
});
