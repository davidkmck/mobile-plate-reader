let carDetector;
let ocrWorker;

// Initialize ML models locally
async function initModels() {
  // 1. Load object detector (COCO-SSD)
  carDetector = await cocoSsd.load();

  // 2. Load Tesseract worker (v5 string parameter format)
  ocrWorker = await Tesseract.createWorker('eng');
  await ocrWorker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: '7', // Mode 7 = Single text line
  });
}

// Main execution pipeline
async function processImage(canvasElement) {
  if (!carDetector || !ocrWorker) {
    throw new Error('Models not initialized. Call initModels() first.');
  }

  // Step 1: Detect Vehicles
  const predictions = await carDetector.detect(canvasElement);
  const vehicleClasses = ['car', 'truck', 'bus'];
  const cars = predictions.filter(p => vehicleClasses.includes(p.class) && p.score > 0.45);

  const results = [];

  for (const car of cars) {
    const [x, y, width, height] = car.bbox;

    // Step 2: Estimate License Plate Region (Lower center of vehicle)
    const plateCrop = {
      x: Math.max(0, x + width * 0.2),
      y: Math.max(0, y + height * 0.55),
      width: Math.min(canvasElement.width, width * 0.6),
      height: Math.min(canvasElement.height, height * 0.35)
    };

    // Step 3: Crop Plate ROI to Offscreen Canvas
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = Math.max(1, plateCrop.width);
    plateCanvas.height = Math.max(1, plateCrop.height);
    const ctx = plateCanvas.getContext('2d');

    ctx.drawImage(
      canvasElement,
      plateCrop.x, plateCrop.y, plateCrop.width, plateCrop.height,
      0, 0, plateCanvas.width, plateCanvas.height
    );

    // Pre-process for OCR
    preprocessPlateImage(ctx, plateCanvas.width, plateCanvas.height);

    // Step 4: Run Targeted OCR
    const { data: { text, confidence } } = await ocrWorker.recognize(plateCanvas);
    const cleanPlateText = text.replace(/[^A-Z0-9]/g, '').trim();

    results.push({
      vehicleType: car.class,
      vehicleBbox: car.bbox,
      confidence: car.score,
      licensePlate: cleanPlateText.length >= 3 ? cleanPlateText : 'Unreadable',
      textConfidence: confidence
    });
  }

  return results;
}

// Image preprocessing for OCR
function preprocessPlateImage(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = max - min || 1;
  for (let i = 0; i < d.length; i += 4) {
    const normalized = ((d[i] - min) / range) * 255;
    const binarized = normalized > 128 ? 255 : 0;
    d[i] = binarized;
    d[i + 1] = binarized;
    d[i + 2] = binarized;
  }

  ctx.putImageData(imgData, 0, 0);
}

// Camera Control
const video = document.getElementById('camera');
const canvas = document.getElementById('snapshot');

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
  } catch (err) {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
  }
}

function captureFrame() {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}
