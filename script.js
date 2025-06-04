let model;
let isStreaming = false;
let totalSenales = 0;
let precisionTotal = 0;
let predicciones = 0;
let ultimaSenalDetectada = null;
let webcam;
let isCameraOn = false;
let currentCamera = 'environment'; // Por defecto cámara trasera

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
const navButtons = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.screen');
const cameraSelect = document.getElementById('camera-select');

// Mostrar/ocultar historial de señales
const toggleHistorialBtn = document.getElementById('toggle-historial');
const historialSenalesDiv = document.getElementById('historial-senales');

const labels = [
  "Alto",
  "Límite de velocidad",
  "Vuelta prohibida",
  "Cruce escolar",
  "Cruce peatonal",
  "Cruce de bicicletas"
];

// Ajustes de robustez
const FILTRO_FRAMES = 3; // Reducido de 5 a 3 frames para confirmar detección
let historialDeteccion = [];
let ultimaSenalConfirmada = null;

// Configuración del modelo
const MODEL_CONFIG = {
  threshold: 0.55, // Reducido de 0.70 a 0.55 para máxima sensibilidad
  updateInterval: 100, // ms
  maxHistory: 100,
  detectionBox: {
    minSize: 30, // Reducido de 40 a 30 para detectar señales aún más pequeñas
    maxSize: 300
  },
  inputSize: 224 // Tamaño de entrada esperado por el modelo
};
const MIN_DIFERENCIA = 0.2; // Reducido de 0.3 a 0.2 para máxima sensibilidad

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
  tiempo = obtenerTiempoPorNivel();
  labelsNivel = obtenerLabelsPorNivel();
  senalObjetivo = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
  actualizarVisualJuego();
  mostrarRanking(nivelActual);
  if (juegoActivo && isCameraOnJuego) {
    startDetectFrameJuegoLoop();
  }
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
  if (nivelActual === 'facil') return 60;
  if (nivelActual === 'medio') return 40;
  if (nivelActual === 'dificil') return 30;
  return 30;
}

async function cargarModelo() {
  try {
    model = await tf.loadLayersModel('tensorflowjs-model/model.json');
    console.log("Modelo cargado exitosamente");
    resultado.innerHTML = '<i class="fas fa-check-circle"></i> Modelo cargado, listo para iniciar';
    return true;
  } catch (error) {
    console.error("Error al cargar el modelo:", error);
    resultado.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error al cargar el modelo';
    return false;
  }
}

async function initCamera() {
  if (!model) {
    const modeloCargado = await cargarModelo();
    if (!modeloCargado) return;
  }

  try {
    const constraints = {
      video: {
        facingMode: currentCamera,
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    isCameraOn = true;
    toggleCameraBtn.innerHTML = '<i class="fas fa-stop"></i> Detener Cámara';
    resultado.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando cámara...';
    
    // Esperar a que el video esté listo
    video.onloadedmetadata = () => {
      resultado.innerHTML = '<i class="fas fa-check-circle"></i> Cámara lista';
    };
    // Iniciar detección
    detectFrame();
  } catch (error) {
    console.error('Error al iniciar la cámara:', error);
    resultado.innerHTML = 'Error al iniciar la cámara. Por favor, verifica los permisos.';
  }
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  isCameraOn = false;
  toggleCameraBtn.innerHTML = '<i class="fas fa-camera"></i> Iniciar Cámara';
  resultado.innerHTML = 'Cámara detenida';
  detectionBox.style.display = 'none';
  if (detectFrameId) {
    cancelAnimationFrame(detectFrameId);
    detectFrameId = null;
  }
  detectFrameRunning = false;
}

let cv;
let isOpenCvReady = false;

function onOpenCvReady() {
    cv = window.cv;
    isOpenCvReady = true;
    console.log('OpenCV.js está listo');
}

// Función para procesar el frame con OpenCV
function processFrameWithOpenCV(src, dst) {
    if (!isOpenCvReady) return;

    // Convertir el frame a escala de grises
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
    
    // Aumentar nitidez usando filtro Laplaciano
    let sharp = new cv.Mat();
    cv.Laplacian(dst, sharp, cv.CV_8U, 3, 1, 0, cv.BORDER_DEFAULT);
    cv.addWeighted(dst, 1.2, sharp, 0.3, 0, dst);
    sharp.delete();
    
    // Ajustar contraste y brillo
    cv.convertScaleAbs(dst, dst, 1.4, 20);
    
    // Aplicar suavizado para reducir ruido
    cv.GaussianBlur(dst, dst, new cv.Size(3, 3), 0);
    
    // Volver a convertir a color
    cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA);
}

// Función para agregar overlay de dashcam
function addDashcamOverlay(ctx) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const dateStr = now.toLocaleDateString();
    
    // Agregar timestamp
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 200, 60);
    ctx.font = '16px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(`Fecha: ${dateStr}`, 20, 30);
    ctx.fillText(`Hora: ${timeStr}`, 20, 55);
    
    // Agregar velocidad simulada
    const velocidad = Math.floor(Math.random() * 60) + 40;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width - 120, 10, 110, 40);
    ctx.fillStyle = 'white';
    ctx.fillText(`Velocidad: ${velocidad} km/h`, canvas.width - 110, 35);

    // Agregar coordenadas GPS simuladas
    const lat = (19.4326 + (Math.random() - 0.5) * 0.01).toFixed(4);
    const lon = (-99.1332 + (Math.random() - 0.5) * 0.01).toFixed(4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, canvas.height - 40, 200, 30);
    ctx.fillStyle = 'white';
    ctx.fillText(`GPS: ${lat}°N, ${lon}°W`, 20, canvas.height - 20);

    // Agregar indicador de batería
    const bateria = Math.floor(Math.random() * 30) + 70;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width - 80, canvas.height - 40, 70, 30);
    ctx.fillStyle = bateria > 20 ? 'white' : '#ff4444';
    ctx.fillText(`Batería: ${bateria}%`, canvas.width - 70, canvas.height - 20);
}

// --- Filtro de color rojo usando OpenCV ---
function hayRojoEnImagen(src) {
    if (!isOpenCvReady) return true; // Si OpenCV no está listo, no filtrar
    let hsv, low1, high1, mask1, low2, high2, mask2, mask;
    try {
        hsv = new cv.Mat();
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        // Rango para rojo (dos rangos por el ciclo del color)
        low1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 100, 100, 0]);
        high1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [10, 255, 255, 255]);
        mask1 = new cv.Mat();
        cv.inRange(hsv, low1, high1, mask1);

        low2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [160, 100, 100, 0]);
        high2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [179, 255, 255, 255]);
        mask2 = new cv.Mat();
        cv.inRange(hsv, low2, high2, mask2);

        mask = new cv.Mat();
        cv.add(mask1, mask2, mask);

        // Calcular porcentaje de píxeles rojos
        let rojo = cv.countNonZero(mask);
        let total = mask.rows * mask.cols;
        let porcentaje = rojo / total;

        // Si hay más de 0.2% de rojo, consideramos que hay una señal
        return porcentaje > 0.002;
    } catch (e) {
        console.error('Error en filtro de color:', e);
        return true; // Si hay error, no filtrar
    } finally {
        if (hsv) hsv.delete();
        if (low1) low1.delete();
        if (high1) high1.delete();
        if (mask1) mask1.delete();
        if (low2) low2.delete();
        if (high2) high2.delete();
        if (mask2) mask2.delete();
        if (mask) mask.delete();
    }
}

// --- MEJORAS DE ROBUSTEZ Y MANEJO DE ERRORES ---
// Función para verificar si el modelo está cargado y recargar si es necesario
async function asegurarModeloCargado() {
  if (!model) {
    resultado.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando modelo...';
    await cargarModelo();
  }
}

// Reiniciar cámara si el stream se detiene
video.addEventListener('error', () => {
  resultado.innerHTML = '<b>Error en la cámara. Intentando reiniciar...</b>';
  stopCamera();
  setTimeout(() => initCamera(), 1500);
});
video.addEventListener('ended', () => {
  resultado.innerHTML = '<b>La cámara se detuvo. Intentando reiniciar...</b>';
  stopCamera();
  setTimeout(() => initCamera(), 1500);
});

// --- ROBUSTEZ AVANZADA ---
let detectFrameRunning = false;
let reinicioIntentos = 0;
const REINICIO_MAX = 5;
let reinicioTimeout = null;
let detectFrameId = null;

// Pausar detección si la pestaña está inactiva
let paginaActiva = true;
document.addEventListener('visibilitychange', () => {
  paginaActiva = !document.hidden;
  if (paginaActiva && isCameraOn) {
    if (!detectFrameRunning) detectFrame();
  }
});

// Detectar si el video se queda en negro (sin frames)
function checkVideoAlive() {
  if (isCameraOn && video.readyState >= 2) {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      reiniciarCamaraSeguro('No se detecta señal de cámara. Intentando reiniciar...');
    }
  }
  setTimeout(checkVideoAlive, 3500);
}
setTimeout(checkVideoAlive, 3500);

// Mejorar la función detectFrame para máxima robustez
async function detectFrame() {
  if (!isCameraOn || detectFrameRunning || !paginaActiva) return;
  detectFrameRunning = true;
  await asegurarModeloCargado();
  if (!model) {
    reiniciarCamaraSeguro('Error: Modelo no cargado.');
    detectFrameRunning = false;
    return;
  }
  let src, dst;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (isOpenCvReady) {
      src = cv.imread(canvas);
      dst = new cv.Mat();
      processFrameWithOpenCV(src, dst);
      cv.imshow(canvas, dst);
    }
    // Filtro de color rojo
    let hayRojo = true;
    if (isOpenCvReady && src) {
      hayRojo = hayRojoEnImagen(src);
    }
    if (!hayRojo) {
      detectionBox.style.display = 'none';
      historialDeteccion = [];
      ultimaSenalConfirmada = null;
      ultimaSenalDetectada = null;
      resultado.innerHTML = '<b>No se detecta señal (filtro de color)</b>';
      detectFrameRunning = false;
      detectFrameId = requestAnimationFrame(detectFrame);
      return;
    }
    addDashcamOverlay(ctx);
    const img = tf.browser.fromPixels(canvas)
      .resizeBilinear([MODEL_CONFIG.inputSize, MODEL_CONFIG.inputSize])
      .toFloat()
      .div(255.0)
      .expandDims(0);
    const pred = model.predict(img);
    const predData = pred.dataSync();
    const index = predData.indexOf(Math.max(...predData));
    const confianza = predData[index];
    const sorted = [...predData].sort((a, b) => b - a);
    const segundaConfianza = sorted[1] || 0;
    const diferencia = confianza - segundaConfianza;
    tf.dispose([img, pred]);
    if (src) src.delete && src.delete();
    if (dst) dst.delete && dst.delete();
    let debugText = '<b>Probabilidades:</b><br>';
    labels.forEach((label, i) => {
      debugText += `${label}: ${(predData[i] * 100).toFixed(2)}%<br>`;
    });
    // Mostrar confianza principal en grande
    debugText = `<div style='font-size:2.2rem;color:#1976d2;font-weight:bold;margin-bottom:8px;'>Confianza: ${(confianza*100).toFixed(1)}%</div>` + debugText;
    resultado.innerHTML = debugText;
    if (confianza > MODEL_CONFIG.threshold && diferencia >= MIN_DIFERENCIA) {
      const senalActual = labels[index];
      historialDeteccion.push(senalActual);
      if (historialDeteccion.length > FILTRO_FRAMES) historialDeteccion.shift();
      const todasIguales = historialDeteccion.every(s => s === senalActual);
      if (todasIguales && historialDeteccion.length === FILTRO_FRAMES) {
        const boxSize = Math.min(
          MODEL_CONFIG.detectionBox.maxSize,
          Math.max(
            MODEL_CONFIG.detectionBox.minSize,
            confianza * MODEL_CONFIG.detectionBox.maxSize
          )
        );
        const boxLeft = (canvas.width - boxSize) / 2;
        const boxTop = (canvas.height - boxSize) / 2;
        detectionBox.style.transition = 'all 0.3s ease-out';
        detectionBox.style.display = 'block';
        detectionBox.style.left = `${boxLeft}px`;
        detectionBox.style.top = `${boxTop}px`;
        detectionBox.style.width = `${boxSize}px`;
        detectionBox.style.height = `${boxSize}px`;
        detectionBox.style.border = `3px solid rgba(0, 255, 0, ${confianza})`;
        detectionBox.style.boxShadow = `0 0 10px rgba(0, 255, 0, ${confianza * 0.5})`;
        detectionLabel.textContent = `${senalActual} (${(confianza * 100).toFixed(1)}%)`;
        detectionLabel.style.backgroundColor = `rgba(0, 0, 0, ${0.7 + confianza * 0.3})`;
        if (senalActual !== ultimaSenalConfirmada) {
          hablar(senalActual);
          ultimaSenalConfirmada = senalActual;
          ultimaSenalDetectada = senalActual;
          totalSenales++;
          precisionTotal += confianza;
          predicciones++;
          totalSenalesElement.textContent = totalSenales;
          precisionPromedioElement.textContent = `${((precisionTotal / predicciones) * 100).toFixed(1)}%`;
          ultimaSenalElement.textContent = senalActual;
          const item = document.createElement('div');
          item.className = 'historial-item';
          item.style.opacity = '0';
          item.textContent = senalActual;
          historialSenales.prepend(item);
          setTimeout(() => {
            item.style.transition = 'opacity 0.5s ease-in';
            item.style.opacity = '1';
          }, 50);
          if (historialSenales.childElementCount > 10) {
            historialSenales.removeChild(historialSenales.lastChild);
          }
          if (juegoActivo) {
            if (senalActual === senalObjetivo) {
              puntaje++;
              puntajeSpan.textContent = puntaje;
              audioAcierto.play();
              juegoMensaje.textContent = '¡Correcto! Nueva señal a buscar...';
              juegoMensaje.className = '';
              mostrarConfeti();
              let nueva;
              do {
                nueva = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
              } while (nueva === senalObjetivo);
              senalObjetivo = nueva;
              senalABuscar.textContent = '';
              mostrarSenalNombre(senalObjetivo, senalABuscar);
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
        }
      }
    } else {
      detectionBox.style.display = 'none';
      historialDeteccion = [];
      ultimaSenalConfirmada = null;
      ultimaSenalDetectada = null;
      resultado.innerHTML = '<b>No se detecta señal clara.</b>';
    }
    detectFrameRunning = false;
    detectFrameId = requestAnimationFrame(detectFrame);
  } catch (error) {
    console.error('Error en la detección:', error);
    resultado.innerHTML = '<b>Error en la detección. Intentando continuar...</b>';
    if (src) src.delete && src.delete();
    if (dst) dst.delete && dst.delete();
    detectFrameRunning = false;
    setTimeout(detectFrame, 1800);
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
  if (isCameraOn) {
    stopCamera();
  } else {
    initCamera();
  }
});

captureBtn.addEventListener('click', capturarImagen);

btnIniciarJuego.addEventListener('click', async () => {
  await asegurarModeloCargado();
  juegoActivo = true;
  puntaje = 0;
  labelsNivel = obtenerLabelsPorNivel();
  tiempo = obtenerTiempoPorNivel();
  senalObjetivo = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
  actualizarVisualJuego();
  juegoMensajeVisual.textContent = '';
  juegoMensajeVisual.className = 'juego-mensaje-visual';
  btnIniciarJuego.disabled = true;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    tiempo--;
    actualizarVisualJuego();
    if (tiempo <= 0) finalizarJuego();
  }, 1000);
  if (isCameraOnJuego) {
    startDetectFrameJuegoLoop();
  }
});

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
  cargarModelo();
  mostrarRanking(nivelActual);

  // FAQ acordeón
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', function() {
      const item = this.parentElement;
      item.classList.toggle('active');
    });
  });
});

// Mejorar la función hablar para que sea inmediata y sin delay
function hablar(texto) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new window.SpeechSynthesisUtterance(texto);
    utter.lang = 'es-MX';
    window.speechSynthesis.speak(utter);
  }
}

const timerVisual = document.getElementById('timer-visual');

function actualizarTimerVisual() {
  timerVisual.textContent = tiempo + 's';
  if (tiempo <= 5) {
    timerVisual.classList.add('critico');
  } else {
    timerVisual.classList.remove('critico');
  }
}

const puntajeVisual = document.getElementById('puntaje-visual');
const senalABuscarVisual = document.getElementById('senal-a-buscar-visual');
const juegoMensajeVisual = document.getElementById('juego-mensaje-visual');

function actualizarVisualJuego() {
  puntajeVisual.textContent = `Puntaje: ${puntaje}`;
  senalABuscarVisual.textContent = senalObjetivo || '';
  actualizarTimerVisual();
}

function finalizarJuego() {
  juegoActivo = false;
  clearInterval(timerInterval);
  actualizarVisualJuego();
  btnIniciarJuego.disabled = false;
  if (detectFrameJuegoId) {
    cancelAnimationFrame(detectFrameJuegoId);
    detectFrameJuegoId = null;
  }
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
    juegoMensajeVisual.textContent = `🎉 ¡Nuevo récord! Puntaje final: ${puntaje}`;
    juegoMensajeVisual.className = 'juego-mensaje-visual acierto';
  } else {
    audioFin.play();
    juegoMensaje.textContent = `¡Juego terminado! Puntaje final: ${puntaje}`;
    juegoMensaje.className = '';
    juegoMensajeVisual.textContent = `¡Juego terminado! Puntaje final: ${puntaje}`;
    juegoMensajeVisual.className = 'juego-mensaje-visual';
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

// Navegación entre pantallas
navButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetScreen = button.dataset.screen;
    
    // Actualizar botones
    navButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    // Actualizar pantallas
    screens.forEach(screen => {
      screen.classList.remove('active');
      if (screen.id === `${targetScreen}-screen`) {
        screen.classList.add('active');
      }
    });

    // Ya NO iniciar la cámara automáticamente al cambiar a dashcam
    // if (targetScreen === 'dashcam' && !isCameraOn) {
    //   initCamera();
    // }
  });
});

// Selección de cámara
cameraSelect.addEventListener('change', (e) => {
  currentCamera = e.target.value;
  if (isCameraOn) {
    stopCamera();
    initCamera();
  }
});

// Mostrar/ocultar historial de señales
if (toggleHistorialBtn && historialSenalesDiv) {
  toggleHistorialBtn.addEventListener('click', () => {
    if (historialSenalesDiv.style.display === 'none' || historialSenalesDiv.style.display === '') {
      historialSenalesDiv.style.display = 'flex';
      toggleHistorialBtn.innerHTML = '<i class="fas fa-history"></i> Ocultar historial';
    } else {
      historialSenalesDiv.style.display = 'none';
      toggleHistorialBtn.innerHTML = '<i class="fas fa-history"></i> Mostrar historial';
    }
  });
}

// Funcionalidad de pantalla completa
const fullscreenBtn = document.getElementById('fullscreen');
const videoContainer = document.querySelector('.video-container');

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    if (videoContainer.requestFullscreen) {
      videoContainer.requestFullscreen();
    } else if (videoContainer.webkitRequestFullscreen) { // Safari
      videoContainer.webkitRequestFullscreen();
    } else if (videoContainer.msRequestFullscreen) { // IE11
      videoContainer.msRequestFullscreen();
    }
    fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Salir Pantalla Completa';
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { // Safari
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { // IE11
      document.msExitFullscreen();
    }
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Pantalla Completa';
  }
});

// Escuchar cambios en el estado de pantalla completa
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('mozfullscreenchange', updateFullscreenButton);
document.addEventListener('MSFullscreenChange', updateFullscreenButton);

function updateFullscreenButton() {
  if (document.fullscreenElement) {
    fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Salir Pantalla Completa';
  } else {
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Pantalla Completa';
  }
}

// Limitar reinicios automáticos
function reiniciarCamaraSeguro(mensaje) {
  stopCamera();
  reinicioIntentos++;
  resultado.innerHTML = `<b>${mensaje} (Intento ${reinicioIntentos}/${REINICIO_MAX})</b>`;
  if (reinicioIntentos <= REINICIO_MAX) {
    clearTimeout(reinicioTimeout);
    reinicioTimeout = setTimeout(() => initCamera(), 1800);
  } else {
    resultado.innerHTML = '<b>No se pudo recuperar la cámara/modelo. Recarga la página.</b>';
  }
}

// --- CÁMARA PARA EL JUEGO EDUCATIVO ---
let isCameraOnJuego = false;
let streamJuego = null;
const videoJuego = document.getElementById('webcam-juego');
const canvasJuego = document.getElementById('canvas-juego');
const resultadoJuego = document.getElementById('resultado-juego');
const toggleCameraJuegoBtn = document.getElementById('toggle-camera-juego');

async function initCameraJuego() {
  if (isCameraOnJuego) return;
  try {
    const constraints = {
      video: {
        facingMode: 'user',
        width: { ideal: 600 },
        height: { ideal: 400 }
      }
    };
    streamJuego = await navigator.mediaDevices.getUserMedia(constraints);
    videoJuego.srcObject = streamJuego;
    isCameraOnJuego = true;
    toggleCameraJuegoBtn.innerHTML = '<i class="fas fa-stop"></i> Detener Cámara';
    resultadoJuego.innerHTML = '<i class="fas fa-check-circle"></i> Cámara lista';
    // Aquí puedes agregar la función de detección para el juego si lo deseas
  } catch (error) {
    console.error('Error al iniciar la cámara del juego:', error);
    resultadoJuego.innerHTML = 'Error al iniciar la cámara. Verifica los permisos.';
  }
}

function stopCameraJuego() {
  if (streamJuego) {
    streamJuego.getTracks().forEach(track => track.stop());
    videoJuego.srcObject = null;
  }
  isCameraOnJuego = false;
  toggleCameraJuegoBtn.innerHTML = '<i class="fas fa-camera"></i> Iniciar Cámara';
  resultadoJuego.innerHTML = 'Cámara detenida';
}

toggleCameraJuegoBtn.addEventListener('click', () => {
  if (isCameraOnJuego) {
    stopCameraJuego();
  } else {
    initCameraJuego();
  }
});

// --- DETECCIÓN EN EL JUEGO EDUCATIVO ---
let historialDeteccionJuego = [];
let ultimaSenalConfirmadaJuego = null;
let detectFrameJuegoId = null;
let detectFrameJuegoBusy = false;

function startDetectFrameJuegoLoop() {
  if (detectFrameJuegoId) {
    cancelAnimationFrame(detectFrameJuegoId);
    detectFrameJuegoId = null;
  }
  function loop() {
    if (isCameraOnJuego && juegoActivo) {
      if (!detectFrameJuegoBusy) {
        detectFrameJuego();
      }
      detectFrameJuegoId = requestAnimationFrame(loop);
    } else {
      detectFrameJuegoId = null;
    }
  }
  loop();
}

async function detectFrameJuego() {
  if (!isCameraOnJuego || !juegoActivo || detectFrameJuegoBusy) return;
  detectFrameJuegoBusy = true;
  await asegurarModeloCargado();
  if (!model) {
    resultadoJuego.innerHTML = 'Error: Modelo no cargado.';
    detectFrameJuegoBusy = false;
    return;
  }
  let ctxJuego = canvasJuego.getContext('2d');
  ctxJuego.drawImage(videoJuego, 0, 0, canvasJuego.width, canvasJuego.height);
  const img = tf.browser.fromPixels(canvasJuego)
    .resizeBilinear([MODEL_CONFIG.inputSize, MODEL_CONFIG.inputSize])
    .toFloat()
    .div(255.0)
    .expandDims(0);
  const pred = model.predict(img);
  const predData = pred.dataSync();
  const index = predData.indexOf(Math.max(...predData));
  const confianza = predData[index];
  const sorted = [...predData].sort((a, b) => b - a);
  const segundaConfianza = sorted[1] || 0;
  const diferencia = confianza - segundaConfianza;
  tf.dispose([img, pred]);
  let debugText = `<div style='font-size:1.5rem;color:#1976d2;font-weight:bold;margin-bottom:8px;'>Confianza: ${(confianza*100).toFixed(1)}%</div>`;
  debugText += `<div style='font-size:1.2rem;color:#1976d2;font-weight:bold;margin-bottom:8px;'>${labels[index]}</div>`;
  resultadoJuego.innerHTML = debugText;
  if (confianza > MODEL_CONFIG.threshold && diferencia >= MIN_DIFERENCIA) {
    const senalActual = labels[index];
    historialDeteccionJuego.push(senalActual);
    if (historialDeteccionJuego.length > FILTRO_FRAMES) historialDeteccionJuego.shift();
    const todasIguales = historialDeteccionJuego.every(s => s === senalActual);
    if (todasIguales && historialDeteccionJuego.length === FILTRO_FRAMES) {
      if (senalActual !== ultimaSenalConfirmadaJuego) {
        ultimaSenalConfirmadaJuego = senalActual;
        // Lógica de juego: acierto o fallo
        if (juegoActivo) {
          if (senalActual === senalObjetivo) {
            puntaje++;
            puntajeSpan.textContent = puntaje;
            audioAcierto.play();
            juegoMensaje.textContent = '¡Correcto! Nueva señal a buscar...';
            juegoMensaje.className = '';
            juegoMensajeVisual.textContent = '¡Correcto! Nueva señal a buscar...';
            juegoMensajeVisual.className = 'juego-mensaje-visual acierto';
            mostrarConfeti();
            let nueva;
            do {
              nueva = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
            } while (nueva === senalObjetivo);
            senalObjetivo = nueva;
            senalABuscar.textContent = '';
            mostrarSenalNombre(senalObjetivo, senalABuscar);
            actualizarVisualJuego();
            if (nivelActual === 'dificil' && puntaje % 5 === 0 && puntaje > 0) {
              tiempo = Math.max(5, tiempo - 2);
              tiempoSpan.textContent = tiempo;
              actualizarVisualJuego();
            }
          } else {
            audioFallo.play();
            juegoMensaje.textContent = '¡Esa no es la señal buscada!';
            juegoMensaje.className = 'error';
            juegoMensajeVisual.textContent = '¡Esa no es la señal buscada!';
            juegoMensajeVisual.className = 'juego-mensaje-visual error';
          }
        }
      }
    }
  } else {
    historialDeteccionJuego = [];
    ultimaSenalConfirmadaJuego = null;
  }
  detectFrameJuegoBusy = false;
}

// Iniciar detección cuando la cámara y el juego estén activos
function intentarDetectarJuego() {
  if (isCameraOnJuego && juegoActivo) {
    startDetectFrameJuegoLoop();
  }
}

// Lanzar detección al iniciar cámara o juego
videoJuego.onloadedmetadata = intentarDetectarJuego;
document.getElementById('iniciar-juego').addEventListener('click', intentarDetectarJuego);
toggleCameraJuegoBtn.addEventListener('click', intentarDetectarJuego);

// Reinicio de juego
const reiniciarJuegoBtn = document.getElementById('reiniciar-juego');
reiniciarJuegoBtn.addEventListener('click', async () => {
  finalizarJuego();
  btnIniciarJuego.disabled = false;
  await asegurarModeloCargado();
  tiempo = obtenerTiempoPorNivel();
  labelsNivel = obtenerLabelsPorNivel();
  senalObjetivo = labelsNivel[Math.floor(Math.random() * labelsNivel.length)];
  actualizarVisualJuego();
  juegoMensajeVisual.textContent = '';
  juegoMensajeVisual.className = 'juego-mensaje-visual';
  if (isCameraOnJuego) {
    startDetectFrameJuegoLoop();
  }
});

// Al prender la cámara, si el juego está activo, iniciar reconocimiento
videoJuego.onloadedmetadata = () => {
  if (juegoActivo) startDetectFrameJuegoLoop();
};