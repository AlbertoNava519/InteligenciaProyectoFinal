let model;
let isStreaming = false;
let totalSenales = 0;
let precisionTotal = 0;
let predicciones = 0;
let ultimaSenalDetectada = null;

// Elementos del DOM
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resultado = document.getElementById('resultado');
const totalSenalesElement = document.getElementById('total-senales');
const precisionPromedioElement = document.getElementById('precision-promedio');
const ultimaSenalElement = document.getElementById('ultima-senal');
const toggleCameraBtn = document.getElementById('toggle-camera');
const captureBtn = document.getElementById('capture');
const detectionBox = document.getElementById('detection-box');
const detectionLabel = detectionBox.querySelector('.detection-label');
const historialSenales = document.getElementById('historial-senales');

const labels = [
  "Alto",
  "Límite de velocidad",
  "Vuelta prohibida",
  "Cruce escolar",
  "Cruce peatonal",
  "Cruce de bicicletas"
];

// Configuración del modelo
const MODEL_CONFIG = {
  threshold: 0.80,
  updateInterval: 100, // ms
  maxHistory: 100,
  detectionBox: {
    minSize: 50, // tamaño mínimo del recuadro en píxeles
    maxSize: 300 // tamaño máximo del recuadro en píxeles
  }
};

// Historial de predicciones
let predictionHistory = [];

// Datos educativos de señales
const infoSenales = {
  "Alto": "Indica que el conductor debe detenerse completamente antes de continuar.",
  "Límite de velocidad": "Señala la velocidad máxima permitida en la vía.",
  "Vuelta prohibida": "Prohíbe realizar vueltas en la dirección indicada (izquierda, derecha o U).",
  "Cruce escolar": "Advierte la proximidad de una zona escolar, se debe extremar precaución.",
  "Cruce peatonal": "Indica la presencia de un paso peatonal, ceda el paso a los peatones.",
  "Cruce de bicicletas": "Advierte sobre la presencia de ciclistas cruzando la vía."
};

// Efectos de sonido
const audioAcierto = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7b7e.mp3');
const audioFallo = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7b7e.mp3');
const audioRecord = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7b7e.mp3');
const audioFin = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7b7e.mp3');

// Modo juego
let juegoActivo = false;
let puntaje = 0;
let tiempo = 30;
let senalObjetivo = null;
let timerInterval = null;

const btnIniciarJuego = document.getElementById('iniciar-juego');
const juegoInfo = document.getElementById('juego-info');
const senalABuscar = document.getElementById('senal-a-buscar');
const puntajeSpan = document.getElementById('puntaje');
const tiempoSpan = document.getElementById('tiempo');
const juegoMensaje = document.getElementById('juego-mensaje');
const infoSenalDiv = document.getElementById('info-senal');

const nivelSelect = document.getElementById('nivel-juego');
let nivelActual = 'facil';
let labelsNivel = labels;

nivelSelect.addEventListener('change', () => {
  nivelActual = nivelSelect.value;
  mostrarRanking(nivelActual);
});

function obtenerLabelsPorNivel() {
  if (nivelActual === 'facil') {
    return ["Alto", "Límite de velocidad", "Cruce escolar"];
  } else if (nivelActual === 'medio') {
    return labels;
  } else if (nivelActual === 'dificil') {
    return labels;
  }
  return labels;
}

function obtenerTiempoPorNivel() {
  if (nivelActual === 'facil') return 40;
  if (nivelActual === 'medio') return 30;
  if (nivelActual === 'dificil') return 15;
  return 30;
}

async function cargarModelo() {
  try {
    model = await tf.loadLayersModel('tensorflowjs-model/model.json');
    console.log("Modelo cargado exitosamente");
    resultado.innerHTML = '<i class="fas fa-check-circle"></i> Modelo cargado, iniciando cámara...';
  } catch (error) {
    console.error("Error al cargar el modelo:", error);
    resultado.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error al cargar el modelo';
  }
}

async function iniciarCamara() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    video.srcObject = stream;
    isStreaming = true;
    video.addEventListener("loadeddata", predecir);
    toggleCameraBtn.innerHTML = '<i class="fas fa-stop"></i> Detener Cámara';
  } catch (error) {
    console.error("Error al acceder a la cámara:", error);
    resultado.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error al acceder a la cámara';
  }
}

function detenerCamara() {
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    isStreaming = false;
    toggleCameraBtn.innerHTML = '<i class="fas fa-camera"></i> Iniciar Cámara';
  }
}

async function predecir() {
  if (!isStreaming) return;

  try {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const containerWidth = video.offsetWidth;
    const containerHeight = video.offsetHeight;

    ctx.drawImage(video, 0, 0, 320, 320);
    const imagen = tf.browser.fromPixels(canvas)
      .toFloat()
      .div(255.0)
      .expandDims(0);

    const pred = model.predict(imagen);
    const index = pred.argMax(1).dataSync()[0];
    const confianza = pred.max().dataSync()[0];

    // Actualizar historial
    predictionHistory.push({
      label: labels[index],
      confidence: confianza,
      timestamp: Date.now()
    });

    // Mantener solo las últimas predicciones
    if (predictionHistory.length > MODEL_CONFIG.maxHistory) {
      predictionHistory.shift();
    }

    // Actualizar estadísticas y mostrar recuadro
    if (confianza > MODEL_CONFIG.threshold) {
      const senalActual = labels[index];
      if (senalActual !== ultimaSenalDetectada) {
        ultimaSenalDetectada = senalActual;
        totalSenales++;
        precisionTotal += confianza;
        predicciones++;
        
        // Calcular tamaño del recuadro basado en la confianza
        const boxSize = Math.min(
          Math.max(
            MODEL_CONFIG.detectionBox.minSize,
            confianza * MODEL_CONFIG.detectionBox.maxSize
          ),
          MODEL_CONFIG.detectionBox.maxSize
        );

        // Calcular posición del recuadro
        const boxLeft = (containerWidth - boxSize) / 2;
        const boxTop = (containerHeight - boxSize) / 2;

        // Actualizar posición y tamaño del recuadro
        detectionBox.style.display = 'block';
        detectionBox.style.left = `${boxLeft}px`;
        detectionBox.style.top = `${boxTop}px`;
        detectionBox.style.width = `${boxSize}px`;
        detectionBox.style.height = `${boxSize}px`;

        // Actualizar etiqueta
        detectionLabel.textContent = `${senalActual} (${(confianza * 100).toFixed(1)}%)`;
        detectionLabel.style.left = `${boxSize / 2}px`;

        // Historial visual
        const item = document.createElement('div');
        item.className = 'historial-item';
        item.textContent = `${senalActual}`;
        item.onclick = () => mostrarInfoSenal(senalActual);
        historialSenales.prepend(item);
        if (historialSenales.childElementCount > 10) historialSenales.removeChild(historialSenales.lastChild);

        // Voz
        hablar(senalActual);

        // Juego
        if (juegoActivo) {
          if (senalActual === senalObjetivo) {
            puntaje++;
            puntajeSpan.textContent = puntaje;
            audioAcierto.play();
            juegoMensaje.textContent = '¡Correcto! Nueva señal a buscar...';
            juegoMensaje.className = '';
            mostrarConfeti();
            // Nueva señal objetivo
            let nueva;
            do {
              nueva = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
            } while (nueva === senalObjetivo);
            senalObjetivo = nueva;
            senalABuscar.textContent = '';
            mostrarSenalNombre(senalObjetivo, senalABuscar);
            // En difícil, cambia objetivo cada 5 aciertos
            if (nivelActual === 'dificil' && puntaje % 5 === 0 && puntaje > 0) {
              tiempo = Math.max(5, tiempo - 2);
              tiempoSpan.textContent = tiempo;
            }
          } else {
            audioFallo.play();
            juegoMensaje.textContent = '¡Esa no es la señal buscada!';
            juegoMensaje.className = 'error';
          }
        }

        resultado.innerHTML = `<i class="fas fa-traffic-light"></i> Señal: ${senalActual} (${(confianza * 100).toFixed(2)}%)`;
        ultimaSenalElement.textContent = senalActual;
        totalSenalesElement.textContent = totalSenales;
        precisionPromedioElement.textContent = `${((precisionTotal / predicciones) * 100).toFixed(1)}%`;
      }
    } else {
      detectionBox.style.display = 'none';
      resultado.innerHTML = '<i class="fas fa-search"></i> Sin señal clara';
    }

    // Liberar memoria
    tf.dispose([imagen, pred]);

    if (isStreaming) {
      setTimeout(() => requestAnimationFrame(predecir), MODEL_CONFIG.updateInterval);
    }
  } catch (error) {
    console.error("Error en la predicción:", error);
    resultado.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error en la predicción';
    detectionBox.style.display = 'none';
  }
}

function capturarImagen() {
  const link = document.createElement('a');
  link.download = `senal_${Date.now()}.png`;
  link.href = canvas.toDataURL();
  link.click();
}

// Event Listeners
toggleCameraBtn.addEventListener('click', () => {
  if (isStreaming) {
    detenerCamara();
  } else {
    iniciarCamara();
  }
});

captureBtn.addEventListener('click', capturarImagen);

btnIniciarJuego.addEventListener('click', iniciarJuego);

// Iniciar la aplicación
cargarModelo().then(() => {
  toggleCameraBtn.disabled = false;
  captureBtn.disabled = false;
});

function hablar(texto) {
  if ('speechSynthesis' in window) {
    const utter = new window.SpeechSynthesisUtterance(texto);
    utter.lang = 'es-MX';
    window.speechSynthesis.cancel(); // Detener cualquier voz anterior
    window.speechSynthesis.speak(utter);
  }
}

function iniciarJuego() {
  juegoActivo = true;
  puntaje = 0;
  labelsNivel = obtenerLabelsPorNivel();
  tiempo = obtenerTiempoPorNivel();
  senalObjetivo = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
  puntajeSpan.textContent = puntaje;
  tiempoSpan.textContent = tiempo;
  tiempoSpan.style.color = '#1976d2';
  senalABuscar.textContent = '';
  mostrarSenalNombre(senalObjetivo, senalABuscar);
  juegoInfo.style.display = '';
  juegoMensaje.textContent = '';
  juegoMensaje.className = '';
  btnIniciarJuego.disabled = true;
  infoSenalDiv.style.display = 'none';
  timerInterval = setInterval(() => {
    tiempo--;
    tiempoSpan.textContent = tiempo;
    if (tiempo <= 5) tiempoSpan.style.color = '#d84315';
    else tiempoSpan.style.color = '#1976d2';
    if (tiempo <= 0) finalizarJuego();
  }, 1000);
}

function finalizarJuego() {
  juegoActivo = false;
  clearInterval(timerInterval);
  let esRecord = false;
  let ranking = JSON.parse(localStorage.getItem(`ranking_${nivelActual}`) || '[]');
  if (ranking.length === 0 || puntaje > ranking[0].puntaje) {
    esRecord = true;
  }
  guardarPuntajeRanking(puntaje, nivelActual);
  mostrarRanking(nivelActual);
  if (esRecord && puntaje > 0) {
    audioRecord.play();
    for (let i = 0; i < 8; i++) setTimeout(mostrarConfeti, i * 120);
    juegoMensaje.innerHTML = `🎉 <b>¡Nuevo récord!</b> Puntaje final: ${puntaje}`;
    juegoMensaje.className = 'top';
  } else {
    audioFin.play();
    juegoMensaje.textContent = `¡Juego terminado! Puntaje final: ${puntaje}`;
    juegoMensaje.className = '';
  }
  btnIniciarJuego.disabled = false;
  juegoInfo.style.display = 'none';
}

function mostrarInfoSenal(nombre) {
  infoSenalDiv.textContent = infoSenales[nombre] || 'Sin información.';
  infoSenalDiv.style.display = '';
  setTimeout(() => { infoSenalDiv.style.display = 'none'; }, 6000);
}

function mostrarConfeti() {
  // Confeti simple usando emojis (puedes cambiar por una librería si quieres más efectos)
  const confeti = document.createElement('div');
  confeti.textContent = '🎉';
  confeti.style.position = 'fixed';
  confeti.style.left = Math.random() * 90 + '%';
  confeti.style.top = Math.random() * 60 + 20 + '%';
  confeti.style.fontSize = '2.5rem';
  confeti.style.zIndex = 9999;
  confeti.style.pointerEvents = 'none';
  confeti.style.transition = 'opacity 1.2s';
  document.body.appendChild(confeti);
  setTimeout(() => { confeti.style.opacity = 0; }, 900);
  setTimeout(() => { confeti.remove(); }, 1300);
}

function mostrarSenalNombre(nombre, contenedor) {
  contenedor.innerHTML = '';
  const label = document.createElement('div');
  label.textContent = nombre;
  label.style.fontWeight = 'bold';
  label.style.marginTop = '4px';
  label.style.fontSize = '2.1rem';
  label.style.letterSpacing = '1px';
  label.style.textAlign = 'center';
  label.style.color = '#1976d2';
  contenedor.appendChild(label);
}

// Ranking de puntajes (LocalStorage)
function guardarPuntajeRanking(puntaje, nivel) {
  const key = `ranking_${nivel}`;
  let ranking = JSON.parse(localStorage.getItem(key) || '[]');
  ranking.push({ puntaje, fecha: new Date().toLocaleString() });
  ranking = ranking.sort((a, b) => b.puntaje - a.puntaje).slice(0, 5);
  localStorage.setItem(key, JSON.stringify(ranking));
}

function mostrarRanking(nivel) {
  const key = `ranking_${nivel}`;
  let ranking = JSON.parse(localStorage.getItem(key) || '[]');
  const rankingList = document.getElementById('ranking-list');
  rankingList.innerHTML = '';
  ranking.forEach((item, i) => {
    const li = document.createElement('li');
    li.textContent = `${item.puntaje} puntos`;
    if (i === 0) li.classList.add('top');
    const fecha = document.createElement('span');
    fecha.textContent = item.fecha;
    fecha.style.fontWeight = 'normal';
    fecha.style.fontSize = '0.95em';
    fecha.style.color = '#888';
    li.appendChild(fecha);
    rankingList.appendChild(li);
  });
}

// Mostrar ranking al cargar la página y al cambiar de nivel:
document.addEventListener('DOMContentLoaded', () => {
  mostrarRanking(nivelActual);
  renderCatalogoSenales();
});

// Modo Examen
const btnIniciarExamen = document.getElementById('iniciar-examen');
const examenInfo = document.getElementById('examen-info');
const examenSenal = document.getElementById('examen-senal');
const examenOpciones = document.getElementById('examen-opciones');
const examenMensaje = document.getElementById('examen-mensaje');
const examenPuntaje = document.getElementById('examen-puntaje');

let examenPreguntas = [];
let examenActual = 0;
let examenAciertos = 0;
let examenTotal = 5;

btnIniciarExamen.addEventListener('click', iniciarExamen);

function iniciarExamen() {
  examenPreguntas = generarPreguntasExamen(examenTotal);
  examenActual = 0;
  examenAciertos = 0;
  btnIniciarExamen.disabled = true;
  examenInfo.style.display = '';
  examenMensaje.textContent = '';
  examenPuntaje.textContent = '';
  mostrarPreguntaExamen();
}

function generarPreguntasExamen(n) {
  const preguntas = [];
  const labelsCopy = [...labels];
  for (let i = 0; i < n; i++) {
    const correcta = labelsCopy.splice(Math.floor(Math.random() * labelsCopy.length), 1)[0];
    const opciones = [correcta];
    while (opciones.length < 4) {
      const op = labels[Math.floor(Math.random() * labels.length)];
      if (!opciones.includes(op)) opciones.push(op);
    }
    preguntas.push({
      correcta,
      opciones: opciones.sort(() => Math.random() - 0.5)
    });
  }
  return preguntas;
}

function mostrarPreguntaExamen() {
  if (examenActual >= examenPreguntas.length) {
    finalizarExamen();
    return;
  }
  const pregunta = examenPreguntas[examenActual];
  examenSenal.textContent = pregunta.correcta;
  examenOpciones.innerHTML = '';
  pregunta.opciones.forEach(op => {
    const btn = document.createElement('button');
    btn.textContent = op;
    btn.onclick = () => responderExamen(op);
    examenOpciones.appendChild(btn);
  });
  examenMensaje.textContent = '';
  examenPuntaje.textContent = `Pregunta ${examenActual + 1} de ${examenTotal}`;
}

function responderExamen(respuesta) {
  const pregunta = examenPreguntas[examenActual];
  if (respuesta === pregunta.correcta) {
    examenAciertos++;
    examenMensaje.textContent = '¡Correcto!';
    examenMensaje.className = '';
  } else {
    examenMensaje.textContent = 'Incorrecto.';
    examenMensaje.className = 'error';
  }
  examenActual++;
  setTimeout(mostrarPreguntaExamen, 900);
}

function finalizarExamen() {
  examenInfo.style.display = 'none';
  btnIniciarExamen.disabled = false;
  alert(`¡Examen finalizado! Aciertos: ${examenAciertos} de ${examenTotal}`);
}

// Catálogo de señales (modo explorador)
function renderCatalogoSenales() {
  const catalogo = document.getElementById('catalogo-senales');
  catalogo.innerHTML = '';
  labels.forEach(nombre => {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'catalogo-tarjeta';
    const img = document.createElement('img');
    img.src = imagenesSenales[nombre] || '';
    img.alt = nombre;
    const nombreDiv = document.createElement('div');
    nombreDiv.className = 'nombre';
    nombreDiv.textContent = nombre;
    const descDiv = document.createElement('div');
    descDiv.className = 'desc';
    descDiv.textContent = infoSenales[nombre] || '';
    tarjeta.appendChild(img);
    tarjeta.appendChild(nombreDiv);
    tarjeta.appendChild(descDiv);
    catalogo.appendChild(tarjeta);
  });
}