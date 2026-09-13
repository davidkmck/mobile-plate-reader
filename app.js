const video = document.getElementById('camera');
const canvas = document.getElementById('snapshot');

// Start camera stream (prefer high-resolution back camera)
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 } }
    });
    video.srcObject = stream;
  } catch (err) {
    // Fallback if exact environment camera isn't matched
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
  }
}

// Frame capture helper
function captureFrame() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
