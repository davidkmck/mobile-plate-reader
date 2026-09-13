let carDetector = null;
let ocrWorker = null;

function debugLog(msg) {
  const logDiv = document.getElementById('debug-log');
  if (logDiv) logDiv.innerHTML += `<br>> ${msg}`;
  console.log(msg);
}

async function initModels() {
  try {
    debugLog("Initializing TF backend...");
    await tf.ready(); // Explicitly wait for mobile GPU

    debugLog("Loading COCO-SSD object detector...");
    carDetector = await cocoSsd.load();

    debugLog("Loading Tesseract OCR...");
    ocrWorker = await Tesseract.createWorker('eng');
    await ocrWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: '7',
    });
    
    debugLog("AI Models fully loaded and ready.");
    return true;
  } catch (err) {
    debugLog(`Init Error: ${err.message}`);
    throw err;
  }
}

async function startCamera() {
  const video = document.getElementById('camera');
  try {
    debugLog("Requesting environment camera...");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' } }
    });
    video.srcObject = stream;
  } catch (err) {
    debugLog("Environment camera failed. Using fallback...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
    } catch (fallbackErr) {
      debugLog(`Camera Error: ${fallbackErr.message}`);
    }
  }
}

function captureFrame() {
  const video = document.getElementById('camera');
  const canvas = document.getElementById('snapshot');
  
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

async function processImage(canvasElement) {
  if (!carDetector || !ocrWorker) {
    throw new Error('AI Models are still loading.');
  }

  const predictions = await carDetector.detect(canvasElement);
  const vehicleClasses = ['car', 'truck', 'bus'];
  const cars = predictions.filter(p => vehicleClasses.includes(p.class) && p.score > 0.4);

  if (cars.length === 0) return [];

  const results = [];

  for (const car of cars) {
    const [x, y, width, height] = car.bbox;

    // Crop Plate ROI (Lower center)
    const plateCrop = {
      x: Math.max(0, x + width * 0.15),
      y: Math.max(0, y + height * 0.5),
      width: Math.min(canvasElement.width, width * 0.7),
      height: Math.min(canvasElement.height, height * 0.45)
    };

    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = Math.max(1, plateCrop.width);
    plateCanvas.height = Math.max(1, plateCrop.height);
    const ctx = plateCanvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(
      canvasElement,
      plateCrop.x, plateCrop.y, plateCrop.width, plateCrop.height,
      0, 0, plateCanvas.width, plateCanvas.height
    );

    preprocessPlateImage(ctx, plateCanvas.width, plateCanvas.height);

    const { data: { text, confidence } } = await ocrWorker.recognize(plateCanvas);
    const cleanPlateText = text.replace(/[^A-Z0-9]/g, '').trim();

    results.push({
      vehicleType: car.class,
      licensePlate: cleanPlateText.length >= 3 ? cleanPlateText : 'Unreadable',
      textConfidence: confidence
    });
  }

  return results;
}

function preprocessPlateImage(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = max - min || 1;
  for (let i = 0; i < d.length; i += 4) {
    const binarized = (((d[i] - min) / range) * 255) > 128 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = binarized;
  }

  ctx.putImageData(imgData, 0, 0);
}
