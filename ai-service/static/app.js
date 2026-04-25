const input = document.getElementById("imageInput");
const button = document.getElementById("predictButton");
const image = document.getElementById("previewImage");
const canvas = document.getElementById("overlayCanvas");
const emptyState = document.getElementById("emptyState");
const statusBadge = document.getElementById("statusBadge");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const providerValue = document.getElementById("providerValue");
const confidenceValue = document.getElementById("confidenceValue");
const predictionList = document.getElementById("predictionList");

let selectedFile = null;
let lastPredictions = [];

function setStatus(text, type) {
  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${type}`;
}

function clearCanvas() {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function syncCanvas() {
  const rect = image.getBoundingClientRect();
  const frameRect = image.parentElement.getBoundingClientRect();
  canvas.width = frameRect.width;
  canvas.height = frameRect.height;
  drawPredictions(lastPredictions);
}

function drawPredictions(predictions) {
  clearCanvas();
  if (!image.naturalWidth || !image.naturalHeight) return;

  const context = canvas.getContext("2d");
  const imageRect = image.getBoundingClientRect();
  const frameRect = image.parentElement.getBoundingClientRect();
  const offsetX = imageRect.left - frameRect.left;
  const offsetY = imageRect.top - frameRect.top;
  const scaleX = imageRect.width / image.naturalWidth;
  const scaleY = imageRect.height / image.naturalHeight;

  predictions.forEach((prediction) => {
    const [x1, y1, x2, y2] = prediction.box;
    const isAccident = prediction.label === "vehicle-accident";
    const color = isAccident ? "#ef4444" : "#22c55e";
    const left = offsetX + x1 * scaleX;
    const top = offsetY + y1 * scaleY;
    const width = (x2 - x1) * scaleX;
    const height = (y2 - y1) * scaleY;

    context.strokeStyle = color;
    context.lineWidth = 3;
    context.strokeRect(left, top, width, height);

    const label = `${prediction.label} ${(prediction.confidence * 100).toFixed(1)}%`;
    context.font = "700 14px Segoe UI, sans-serif";
    const labelWidth = context.measureText(label).width + 14;
    const labelY = Math.max(top - 28, 0);
    context.fillStyle = color;
    context.fillRect(left, labelY, labelWidth, 24);
    context.fillStyle = "#ffffff";
    context.fillText(label, left + 7, labelY + 17);
  });
}

function renderPredictions(predictions) {
  predictionList.innerHTML = "";

  if (!predictions.length) {
    predictionList.innerHTML = '<div class="prediction-item"><strong>No objects found</strong><span>The model returned no detections.</span></div>';
    return;
  }

  predictions.forEach((prediction) => {
    const item = document.createElement("div");
    item.className = "prediction-item";
    item.innerHTML = `
      <strong>${prediction.label}</strong>
      <span>${(prediction.confidence * 100).toFixed(1)}% confidence</span>
    `;
    predictionList.appendChild(item);
  });
}

input.addEventListener("change", () => {
  const [file] = input.files;
  selectedFile = file || null;
  button.disabled = !selectedFile;
  lastPredictions = [];
  clearCanvas();
  renderPredictions([]);
  providerValue.textContent = "-";
  confidenceValue.textContent = "-";

  if (!selectedFile) return;

  image.src = URL.createObjectURL(selectedFile);
  image.style.display = "block";
  emptyState.style.display = "none";
  setStatus("Ready", "idle");
  resultTitle.textContent = "Image selected";
  resultText.textContent = selectedFile.name;
});

image.addEventListener("load", syncCanvas);
window.addEventListener("resize", syncCanvas);

button.addEventListener("click", async () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("file", selectedFile);

  button.disabled = true;
  setStatus("Analyzing", "loading");
  resultTitle.textContent = "Checking image";
  resultText.textContent = "Sending the image to the configured model.";

  try {
    const response = await fetch("/predict/image", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Prediction request failed.");
    }

    const result = await response.json();
    lastPredictions = result.predictions || [];
    providerValue.textContent = result.provider || "-";
    confidenceValue.textContent = `${((result.accidentConfidence || 0) * 100).toFixed(1)}%`;
    renderPredictions(lastPredictions);
    drawPredictions(lastPredictions);

    if (result.accidentDetected) {
      setStatus("Accident", "danger");
      resultTitle.textContent = "Accident detected";
      resultText.textContent = "The model found the accident class in this image.";
    } else {
      setStatus("No Accident", "safe");
      resultTitle.textContent = "No accident detected";
      resultText.textContent = lastPredictions.length
        ? "The model found objects, but not the accident class."
        : "The model did not return any detections.";
    }
  } catch (error) {
    setStatus("Error", "danger");
    resultTitle.textContent = "Prediction failed";
    resultText.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
