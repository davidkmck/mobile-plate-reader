let carDetector = null;
let ocrWorker = null;

// Initialize ML models locally
async function initModels() {
  try {
    // 1. Load object detector (COCO-SSD)
    carDetector = await cocoSsd.load();

    // 2. Load Tesseract worker (v5 string parameter format)
    ocrWorker = await Tesseract.createWorker('eng');
    await ocrWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: '7', // Mode 7 = Single text line
    });
    return true;
  } catch (err) {
    console.error('Model initialization error:', err);
    throw err;
  }
}

// Camera Control
async function startCamera() {
  const video = document.getElementById('camera');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
  } catch (err) {
    // Fallback to default front/back camera if environment constraint fails
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  }
}

function captureFrame() {
  const video = document.getElementById('camera');
  const canvas = document.getElementById('snapshot');
  
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

// Main execution pipeline
async function processImage(canvasElement) {
  if (!carDetector || !ocrWorker) {
    throw new Error('AI Models are still loading. Please wait a moment and try again.');
  }

  // Step 1: Detect Vehicles
  const predictions = await carDetector.detect(canvasElement);
  const vehicleClasses = ['car', 'truck', 'bus'];
  const cars = predictions.filter(p => vehicleClasses.includes(p.class) && p.score > 0.4);

  if (cars.length === 0) return [];

  const results = [];

  for (const car of cars) {
    const [x, y, width, height] = car.bbox;

    // Step 2: Crop Plate Region (Lower center of vehicle)
    const plateCrop = {
      x: Math.max(0, x + width * 0.15),
      y: Math.max(0, y + height * 0.5),
      width: Math.min(canvasElement.width, width * 0.7),
      height: Math.min(canvasElement.height, height * 0.45)
    };

    // Step 3: Crop ROI to Offscreen Canvas
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = Math.max(1, plateCrop.width);
    plateCanvas.height = Math.max(1, plateCrop.height);
    const ctx = plateCanvas.getContext('2d');

    ctx.drawImage(
      canvasElement,
      plateCrop.x, plateCrop.y, plateCrop.width, plateCrop.height,
      0, 0, plateCanvas.width, plateCanvas.height
    );

    // Image preprocessing for OCR
    preprocessPlateImage(ctx, plateCanvas.width, plateCanvas.height);

    // Step 4: Run OCR
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
