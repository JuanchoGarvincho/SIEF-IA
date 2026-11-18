// Los 3 criterios de la pantalla de evaluación.
// En la BD se guarda el nombre largo (así venían los datos de SQL Server);
// el frontend usa la clave corta.
const CRITERIOS = {
  innovacion: 'Innovación y Originalidad',
  viabilidad: 'Viabilidad Técnica',
  sustentacion: 'Dominio del Tema en Sustentación',
};

const CLAVES = Object.keys(CRITERIOS);

// 'Viabilidad Técnica' -> 'viabilidad' (también acepta la clave corta)
function claveDe(criterio) {
  if (CRITERIOS[criterio]) return criterio;
  return CLAVES.find((k) => CRITERIOS[k] === criterio) || null;
}

module.exports = { CRITERIOS, CLAVES, claveDe };
