const { ipcRenderer } = require("electron");

const box = document.getElementById("selectionBox");
const hint = document.getElementById("hint");
const urlParams = new URLSearchParams(window.location.search);
const isOcrMode = urlParams.get("isOcr") === "1";

if (isOcrMode && hint) {
  hint.textContent = "🔍 Metin okumak (OCR) için alan seçin. Vazgeçmek için ESC.";
  hint.style.background = "rgba(79, 70, 229, 0.9)";
}

let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;
let isSelecting = false;

document.addEventListener("mousedown", (event) => {
  isSelecting = true;
  startX = event.clientX;
  startY = event.clientY;
  endX = event.clientX;
  endY = event.clientY;
  drawSelection();
});

document.addEventListener("mousemove", (event) => {
  if (!isSelecting) {
    return;
  }

  endX = event.clientX;
  endY = event.clientY;
  drawSelection();
});

document.addEventListener("mouseup", async () => {
  if (!isSelecting) {
    return;
  }

  isSelecting = false;
  const rect = normalizeRect();

  if (rect.width < 10 || rect.height < 10) {
    resetSelection();
    return;
  }

  const channel = isOcrMode ? "capture-selection-ocr" : "capture-selection";
  const result = await ipcRenderer.invoke(channel, rect);
  if (!result.ok && result.error) {
    alert(result.error);
  }
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    await ipcRenderer.invoke("cancel-selection");
  }
});

function normalizeRect() {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
}

function drawSelection() {
  const rect = normalizeRect();
  box.style.left = `${rect.x}px`;
  box.style.top = `${rect.y}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.hidden = false;
}

function resetSelection() {
  box.hidden = true;
  box.style.width = "0";
  box.style.height = "0";
}
