// Cliente mínimo de la API de Gemini (Google AI Studio, plan gratuito).
// La clave se crea en https://aistudio.google.com/apikey y va en GEMINI_API_KEY.
const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const disponible = () => Boolean(process.env.GEMINI_API_KEY);

// El plan gratuito a veces responde 503 (saturado) o 429 (límite por minuto).
// Se reintenta y, si sigue fallando, se prueba con el modelo "lite".
const MODELOS = [MODELO, MODELO, 'gemini-flash-lite-latest'];
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Envía un prompt y devuelve el JSON que respondió el modelo
async function pedirJSON(prompt) {
  if (!disponible()) throw new Error('Falta GEMINI_API_KEY en el .env');
  let error;
  for (const [i, modelo] of MODELOS.entries()) {
    try {
      return await llamar(modelo, prompt);
    } catch (e) {
      error = e;
      if (![429, 500, 503].includes(e.status) && e.name !== 'TimeoutError') throw e;
      await esperar(1500 * (i + 1));
    }
  }
  throw error;
}

async function llamar(modelo, prompt) {
  const r = await fetch(`${URL_BASE}/${modelo}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000), // si Gemini no responde en 20 s, se corta y se reintenta
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    }),
  });
  if (!r.ok) {
    const e = new Error(`Gemini (${modelo}) respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
  const data = await r.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

// 3 preguntas técnicas para que el jurado le haga al estudiante en la sustentación
async function generarPreguntas(titulo, resumen) {
  const res = await pedirJSON(
    `Eres jurado de una feria tecnológica universitaria (ETITC, Colombia).
Proyecto: "${titulo}"
Resumen técnico: "${resumen}"
Escribe 3 preguntas técnicas, concretas y en español para la sustentación oral.
Máximo 200 caracteres cada una. Responde SOLO con JSON: {"preguntas": ["...", "...", "..."]}`);
  return (res.preguntas || []).slice(0, 3).map((p) => String(p).slice(0, 255));
}

// Retroalimentación breve para el estudiante a partir de los puntajes y la nota del jurado
async function generarFeedback(titulo, resumen, puntajes, notaJurado) {
  const res = await pedirJSON(
    `Eres un docente que da retroalimentación en una feria tecnológica universitaria.
Proyecto: "${titulo}". Resumen: "${resumen || 'sin resumen'}".
Puntajes del jurado (1 a 5): ${JSON.stringify(puntajes)}.
Comentario del jurado: "${notaJurado || 'sin comentario'}".
Escribe una retroalimentación constructiva en español de 2 a 3 frases para el estudiante.
Responde SOLO con JSON: {"feedback": "..."}`);
  return String(res.feedback || '').slice(0, 2000);
}

module.exports = { disponible, generarPreguntas, generarFeedback };
