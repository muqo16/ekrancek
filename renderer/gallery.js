const { ipcRenderer } = require("electron");

// DOM Elementleri
const thumbnailsList = document.getElementById("thumbnailsList");
const imageCountBadge = document.getElementById("imageCountBadge");
const btnOpenFolder = document.getElementById("btnOpenFolder");
const mainCanvas = document.getElementById("mainCanvas");
const ctx = mainCanvas.getContext("2d", { willReadFrequently: true });
const emptyState = document.getElementById("emptyState");
const currentFileName = document.getElementById("currentFileName");
const currentImageDim = document.getElementById("currentImageDim");
const toastMessage = document.getElementById("toastMessage");

// Araç Butonları
const toolBtns = {
  pointer: document.getElementById("toolPointer"),
  arrow: document.getElementById("toolArrow"),
  rect: document.getElementById("toolRect"),
  pen: document.getElementById("toolPen"),
  highlight: document.getElementById("toolHighlight"),
  text: document.getElementById("toolText"),
  blur: document.getElementById("toolBlur")
};

const colorDots = document.querySelectorAll(".color-dot");
const lineWidthSelect = document.getElementById("lineWidthSelect");
const fontSizeSelect = document.getElementById("fontSizeSelect");
const btnUndo = document.getElementById("btnUndo");
const btnOCR = document.getElementById("btnOCR");
const btnCopy = document.getElementById("btnCopy");
const btnSave = document.getElementById("btnSave");
const btnShowInFolder = document.getElementById("btnShowInFolder");
const btnDelete = document.getElementById("btnDelete");

// Sidebar & Popup & Görünüm Elementleri
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const btnToggleSidebar = document.getElementById("btnToggleSidebar");
const btnCloseSidebar = document.getElementById("btnCloseSidebar");
const toolbarImageBadge = document.getElementById("toolbarImageBadge");
const btnFitScreen = document.getElementById("btnFitScreen");
let isFitScreen = true; // Varsayılan: Görseli ekrana tam sığdır (tam görünüm)

// Metin Katmanı ve Konumlandırma
const canvasContainer = document.getElementById("canvasContainer");
let activeInlineInput = null;
let selectedTextItem = null;
let activeFontSize = 36;

// OCR Modal
const ocrModal = document.getElementById("ocrModal");
const btnCloseOcr = document.getElementById("btnCloseOcr");
const btnCloseOcrFooter = document.getElementById("btnCloseOcrFooter");
const btnCopyOcrText = document.getElementById("btnCopyOcrText");
const ocrLoading = document.getElementById("ocrLoading");
const ocrProgressText = document.getElementById("ocrProgressText");
const ocrResultText = document.getElementById("ocrResultText");

// Uygulama Durumu (State)
let screenshots = [];
let activeFile = null;
let activeTool = "pointer";
let activeColor = "#ef4444";
let activeLineWidth = 4;
let undoStack = [];
const MAX_UNDO = 20;

let isDrawing = false;
let startX = 0;
let startY = 0;
let dragSnapshot = null;
let pendingTextPos = null;

// ==========================================
// BAŞLANGIÇ & LİSTELEME
// ==========================================
async function init() {
  closeOcrModal();
  setFitScreen(true);
  setupEventListeners();
  await loadScreenshots();
}

function openSidebar() {
  if (sidebar) sidebar.classList.add("active");
  if (sidebarBackdrop) sidebarBackdrop.classList.add("active");
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove("active");
  if (sidebarBackdrop) sidebarBackdrop.classList.remove("active");
}

function toggleSidebar() {
  if (sidebar && sidebar.classList.contains("active")) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function setFitScreen(fit) {
  isFitScreen = fit;
  if (btnFitScreen) {
    btnFitScreen.classList.toggle("active", fit);
  }
  if (mainCanvas) mainCanvas.classList.toggle("fit-screen", fit);
  if (canvasContainer) canvasContainer.classList.toggle("fit-screen", fit);
}

async function loadScreenshots(selectFilePath = null) {
  const result = await ipcRenderer.invoke("get-screenshots");
  if (!result.ok) return;

  screenshots = result.list || [];
  imageCountBadge.textContent = screenshots.length;
  if (toolbarImageBadge) toolbarImageBadge.textContent = screenshots.length;

  renderThumbnails();

  if (screenshots.length === 0) {
    showEmptyState(true);
    return;
  }

  showEmptyState(false);

  // Belirli dosya seçildiyse onu, yoksa en sonuncuyu (listenin ilkini) aç
  let target = screenshots[0];
  if (selectFilePath) {
    const found = screenshots.find((s) => s.path === selectFilePath);
    if (found) target = found;
  }

  selectScreenshot(target);
}

function renderThumbnails() {
  thumbnailsList.innerHTML = "";

  screenshots.forEach((item) => {
    const div = document.createElement("div");
    div.className = `thumbnail-item ${activeFile && activeFile.path === item.path ? "active" : ""}`;
    div.dataset.path = item.path;

    const dateStr = formatDateTime(item.mtime);

    div.innerHTML = `
      <div class="thumbnail-img-wrap">
        <img src="file://${item.path.replace(/\\/g, "/")}" loading="lazy" alt="thumb">
      </div>
      <div class="thumbnail-info">
        <div class="thumbnail-name" title="${item.name}">${item.name}</div>
        <div class="thumbnail-date">${dateStr}</div>
      </div>
    `;

    div.addEventListener("click", () => {
      selectScreenshot(item);
    });

    thumbnailsList.appendChild(div);
  });
}

function selectScreenshot(item) {
  if (!item) return;
  activeFile = item;

  // Aktif sınıfını güncelle
  document.querySelectorAll(".thumbnail-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.path === item.path);
  });

  currentFileName.textContent = item.name;

  // Resmi Canvas'a yükle
  const img = new Image();
  img.onload = () => {
    mainCanvas.width = img.naturalWidth;
    mainCanvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    ctx.drawImage(img, 0, 0);

    currentImageDim.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;

    // Undo stack'i sıfırla ve ilk durumu kaydet
    undoStack = [];
    saveUndoState();
    
    // Açık veya eklenmiş metinleri temizle
    document.querySelectorAll(".canvas-text-item, .canvas-inline-text-input").forEach((el) => el.remove());
    selectedTextItem = null;
    activeInlineInput = null;
  };
  img.src = `file://${item.path.replace(/\\/g, "/")}`;
}

function showEmptyState(isEmpty) {
  emptyState.hidden = !isEmpty;
  mainCanvas.hidden = isEmpty;
  if (isEmpty) {
    currentFileName.textContent = "Ekran görüntüsü bulunamadı";
    currentImageDim.textContent = "";
  }
}

// ==========================================
// ÇİZİM VE ARAÇ MANTIĞI
// ==========================================
function getCanvasCoords(event) {
  const rect = mainCanvas.getBoundingClientRect();
  const scaleX = mainCanvas.width / rect.width;
  const scaleY = mainCanvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function saveUndoState() {
  if (undoStack.length >= MAX_UNDO) {
    undoStack.shift();
  }
  undoStack.push(ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height));
}

function undo() {
  const textItems = document.querySelectorAll(".canvas-text-item");
  if (textItems.length > 0) {
    const lastItem = textItems[textItems.length - 1];
    if (selectedTextItem === lastItem) selectedTextItem = null;
    lastItem.remove();
    showToast("Eklenen metin geri alındı.");
    return;
  }
  if (undoStack.length <= 1) {
    showToast("Geri alınacak işlem yok.");
    return;
  }
  undoStack.pop(); // Son durumu çıkar
  const prevState = undoStack[undoStack.length - 1];
  ctx.putImageData(prevState, 0, 0);
  showToast("İşlem geri alındı.");
}

// Fare Olayları
mainCanvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    selectTextItem(null);
    finishActiveInlineInput();
  }

  if (!activeFile || activeTool === "pointer") return;

  const coords = getCanvasCoords(e);
  startX = coords.x;
  startY = coords.y;
  isDrawing = true;

  // Sürükleme esnasında önizleme için anlık görüntüyü sakla
  dragSnapshot = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

  if (activeTool === "pen") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = activeLineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  } else if (activeTool === "highlight") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.strokeStyle = hexToRgba(activeColor, 0.4);
    ctx.lineWidth = activeLineWidth * 3.5;
    ctx.lineCap = "square";
  } else if (activeTool === "text") {
    openInlineTextInput(e.clientX, e.clientY);
    isDrawing = false;
  }
});

mainCanvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const coords = getCanvasCoords(e);

  if (activeTool === "pen" || activeTool === "highlight") {
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    return;
  }

  // Şekil önizlemesi için önceki duruma geri dön
  if (dragSnapshot) {
    ctx.putImageData(dragSnapshot, 0, 0);
  }

  if (activeTool === "rect") {
    drawRect(startX, startY, coords.x, coords.y, activeColor, activeLineWidth);
  } else if (activeTool === "arrow") {
    drawArrow(startX, startY, coords.x, coords.y, activeColor, activeLineWidth);
  } else if (activeTool === "blur") {
    drawBlurPreview(startX, startY, coords.x, coords.y);
  }
});

mainCanvas.addEventListener("mouseup", (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  const coords = getCanvasCoords(e);

  if (activeTool === "pen" || activeTool === "highlight") {
    ctx.closePath();
    saveUndoState();
  } else if (activeTool === "rect") {
    if (dragSnapshot) ctx.putImageData(dragSnapshot, 0, 0);
    drawRect(startX, startY, coords.x, coords.y, activeColor, activeLineWidth);
    saveUndoState();
  } else if (activeTool === "arrow") {
    if (dragSnapshot) ctx.putImageData(dragSnapshot, 0, 0);
    drawArrow(startX, startY, coords.x, coords.y, activeColor, activeLineWidth);
    saveUndoState();
  } else if (activeTool === "blur") {
    if (dragSnapshot) ctx.putImageData(dragSnapshot, 0, 0);
    applyMosaic(startX, startY, coords.x, coords.y, 10);
    saveUndoState();
  }

  dragSnapshot = null;
});

// Çizim Fonksiyonları
function drawRect(x1, y1, x2, y2, color, width) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(x, y, w, h);
}

function drawArrow(fromx, fromy, tox, toy, color, width) {
  const headlen = Math.max(12, width * 3.5);
  const dx = tox - fromx;
  const dy = toy - fromy;
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";

  // Gövde çizgisi
  ctx.beginPath();
  ctx.moveTo(fromx, fromy);
  ctx.lineTo(tox, toy);
  ctx.stroke();

  // Ok ucu (Üçgen)
  ctx.beginPath();
  ctx.moveTo(tox, toy);
  ctx.lineTo(
    tox - headlen * Math.cos(angle - Math.PI / 6),
    toy - headlen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    tox - headlen * Math.cos(angle + Math.PI / 6),
    toy - headlen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBlurPreview(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
  ctx.fillRect(x, y, w, h);
  ctx.setLineDash([]);
}

function applyMosaic(x1, y1, x2, y2, blockSize = 10) {
  const x = Math.round(Math.min(x1, x2));
  const y = Math.round(Math.min(y1, y2));
  const width = Math.round(Math.abs(x2 - x1));
  const height = Math.round(Math.abs(y2 - y1));

  if (width < 3 || height < 3) return;

  const imgData = ctx.getImageData(x, y, width, height);
  const data = imgData.data;

  for (let py = 0; py < height; py += blockSize) {
    for (let px = 0; px < width; px += blockSize) {
      const pIndex = (py * width + px) * 4;
      const r = data[pIndex];
      const g = data[pIndex + 1];
      const b = data[pIndex + 2];
      const a = data[pIndex + 3];

      for (let dy = 0; dy < blockSize && py + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && px + dx < width; dx++) {
          const idx = ((py + dy) * width + (px + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }

  ctx.putImageData(imgData, x, y);
}

// ==========================================
// DOĞRUDAN METNİ TAŞIMA (SÜRÜKLE & BIRAK) VE SATIR İÇİ YAZMA
// ==========================================

function applyTextContrast(element, color) {
  let isDark = false;
  if (color) {
    let c = color.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    isDark = brightness < 110;
  }

  element.style.color = color;
  if (isDark) {
    // Siyah ve koyu renkler için belirgin beyaz kontur
    element.style.textShadow = "-1.5px -1.5px 0 #ffffff, 1.5px -1.5px 0 #ffffff, -1.5px 1.5px 0 #ffffff, 1.5px 1.5px 0 #ffffff, 0 2px 5px rgba(0,0,0,0.6)";
  } else {
    // Açık ve canlı renkler için belirgin siyah kontur
    element.style.textShadow = "-1.5px -1.5px 0 #000000, 1.5px -1.5px 0 #000000, -1.5px 1.5px 0 #000000, 1.5px 1.5px 0 #000000, 0 2px 5px rgba(0,0,0,0.8)";
  }
}

function finishActiveInlineInput() {
  if (!activeInlineInput) return;
  const input = activeInlineInput;
  activeInlineInput = null;

  const text = input.value.trim();
  const left = parseFloat(input.style.left) || 20;
  const top = parseFloat(input.style.top) || 20;
  const color = input.style.color || activeColor;
  const fontSize = parseInt(input.dataset.fontSize || activeFontSize, 10);
  const targetItem = input._editingItem;

  input.remove();

  if (text) {
    if (targetItem) {
      targetItem.textContent = text;
      targetItem.dataset.rawText = text;
      targetItem.dataset.color = color;
      targetItem.dataset.fontSize = fontSize;
      targetItem.style.fontSize = `${fontSize}px`;
      applyTextContrast(targetItem, color);
      targetItem.style.display = "";
      selectTextItem(targetItem);
    } else {
      const newItem = createTextItemElement(text, left, top, color, fontSize);
      selectTextItem(newItem);
      showToast("💡 Yazdığınız metni sol tık ile istediğiniz yere sürükleyebilirsiniz.");
    }
  } else if (targetItem) {
    targetItem.remove();
  }
}

function cancelActiveInlineInput() {
  if (!activeInlineInput) return;
  const input = activeInlineInput;
  const targetItem = input._editingItem;
  activeInlineInput = null;
  input.remove();
  if (targetItem) {
    targetItem.style.display = "";
  }
}

function openInlineTextInput(clientX, clientY, existingItem = null) {
  if (!activeFile || !canvasContainer) return;
  finishActiveInlineInput();

  const containerRect = canvasContainer.getBoundingClientRect();
  let left = clientX - containerRect.left;
  let top = clientY - containerRect.top;

  if (existingItem) {
    left = existingItem.offsetLeft;
    top = existingItem.offsetTop;
  }

  // Konteyner sınırları içinde tut
  left = Math.max(0, Math.min(containerRect.width - 160, left));
  top = Math.max(0, Math.min(containerRect.height - 50, top));

  const input = document.createElement("textarea");
  input.className = "canvas-inline-text-input";
  input.style.left = `${left}px`;
  input.style.top = `${top}px`;

  const fontSize = existingItem ? parseInt(existingItem.dataset.fontSize, 10) : activeFontSize;
  input.dataset.fontSize = fontSize;
  input.style.fontSize = `${fontSize}px`;
  
  const color = existingItem ? (existingItem.dataset.color || activeColor) : activeColor;
  input.style.color = color;
  if (color === "#ffffff" || color === "white") {
    input.style.textShadow = "0 0 2px #000, 0 0 4px #000";
  } else {
    input.style.textShadow = "none";
  }

  input.value = existingItem ? (existingItem.dataset.rawText || existingItem.textContent) : "";
  input.placeholder = "Metin yazın... (Enter ile onayla)";
  input._editingItem = existingItem;

  if (existingItem) {
    existingItem.style.display = "none";
  }

  canvasContainer.appendChild(input);
  activeInlineInput = input;

  const adjustSize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.max(42, input.scrollHeight)}px`;
    input.style.width = "auto";
    input.style.width = `${Math.max(160, Math.min(containerRect.width - left - 10, input.scrollWidth + 16))}px`;
  };
  adjustSize();

  input.addEventListener("input", adjustSize);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      finishActiveInlineInput();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelActiveInlineInput();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (activeInlineInput === input) {
        finishActiveInlineInput();
      }
    }, 150);
  });

  input.focus();
  input.select();
}

function createTextItemElement(text, left, top, color, fontSize) {
  const item = document.createElement("div");
  item.className = "canvas-text-item";
  item.textContent = text;
  item.dataset.rawText = text;
  item.dataset.color = color;
  item.dataset.fontSize = fontSize;
  item.style.left = `${left}px`;
  item.style.top = `${top}px`;
  item.style.fontSize = `${fontSize}px`;
  applyTextContrast(item, color);
  item.title = "Sol tıkla basılı tutup sürükleyin | Çift tıkla veya sağ tıkla düzenleyin | Delete ile silin";

  // Sol tıkla basılı tutup sürükleme (Drag & Drop)
  item.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // Sadece sol fare tuşu
    e.stopPropagation();
    e.preventDefault();

    finishActiveInlineInput();
    selectTextItem(item);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = item.offsetLeft;
    const startTop = item.offsetTop;
    const containerRect = canvasContainer.getBoundingClientRect();

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;

      newLeft = Math.max(0, Math.min(containerRect.width - item.offsetWidth, newLeft));
      newTop = Math.max(0, Math.min(containerRect.height - item.offsetHeight, newTop));

      item.style.left = `${newLeft}px`;
      item.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  item.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openInlineTextInput(e.clientX, e.clientY, item);
  });

  item.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openInlineTextInput(e.clientX, e.clientY, item);
  });

  canvasContainer.appendChild(item);
  return item;
}

function selectTextItem(item) {
  document.querySelectorAll(".canvas-text-item").forEach((el) => el.classList.remove("selected"));
  selectedTextItem = item;
  if (item) {
    item.classList.add("selected");
    if (item.dataset.fontSize && fontSizeSelect) {
      fontSizeSelect.value = item.dataset.fontSize;
      activeFontSize = parseInt(item.dataset.fontSize, 10);
    }
  }
}

function bakeTextItemsToCanvas() {
  const textItems = document.querySelectorAll(".canvas-text-item");
  if (textItems.length === 0) return false;

  const canvasRect = mainCanvas.getBoundingClientRect();
  const scaleX = mainCanvas.width / canvasRect.width;
  const scaleY = mainCanvas.height / canvasRect.height;

  ctx.save();
  textItems.forEach((item) => {
    const itemRect = item.getBoundingClientRect();
    const canvasX = (itemRect.left - canvasRect.left + 3) * scaleX;
    const canvasY = (itemRect.top - canvasRect.top + 3) * scaleY;
    const baseFontSize = parseFloat(item.dataset.fontSize || activeFontSize);
    const canvasFontSize = Math.round(baseFontSize * scaleY);
    const color = item.dataset.color || activeColor;

    let isDark = false;
    let c = color.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    isDark = brightness < 110;

    const strokeColor = isDark ? "#ffffff" : "#000000";
    const strokeWidth = Math.max(2, Math.round(2.5 * scaleY));

    ctx.font = `bold ${canvasFontSize}px "Segoe UI", -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    const lineHeight = canvasFontSize * 1.25;
    const lines = (item.dataset.rawText || item.textContent).split("\n");
    lines.forEach((line, i) => {
      const y = canvasY + i * lineHeight;
      ctx.strokeText(line, canvasX, y);
      ctx.fillText(line, canvasX, y);
    });

    item.remove();
  });
  ctx.restore();
  saveUndoState();
  selectedTextItem = null;
  return true;
}

// ==========================================
// EYLEMLER (KAYDET, KOPYALA, OCR, SİL)
// ==========================================
btnCopy.addEventListener("click", async () => {
  if (!activeFile) return;
  finishActiveInlineInput();
  bakeTextItemsToCanvas();
  const dataUrl = mainCanvas.toDataURL("image/png");
  await ipcRenderer.invoke("copy-image-to-clipboard", { dataUrl });
  showToast("📋 Resim panoya kopyalandı! (Ctrl + V ile yapıştırabilirsiniz)");
});

btnSave.addEventListener("click", async () => {
  if (!activeFile) return;
  finishActiveInlineInput();
  bakeTextItemsToCanvas();
  const dataUrl = mainCanvas.toDataURL("image/png");
  const res = await ipcRenderer.invoke("save-annotated-image", {
    filePath: activeFile.path,
    dataUrl,
    overwrite: false // Orijinal resmi koru, hemen yanına yeni kopya olarak kaydet!
  });

  if (res.ok) {
    showToast("💾 Düzenlenen kopya kaydedildi ve sol listeye eklendi!");
    await loadScreenshots(res.targetPath);
  }
});

btnDelete.addEventListener("click", async () => {
  if (!activeFile) return;
  const confirmed = confirm(`"${activeFile.name}" silinsin mi?`);
  if (!confirmed) return;

  const res = await ipcRenderer.invoke("delete-screenshot", activeFile.path);
  if (res.ok) {
    showToast("🗑️ Dosya silindi.");
    await loadScreenshots();
  }
});

btnShowInFolder.addEventListener("click", () => {
  if (activeFile) {
    ipcRenderer.invoke("show-item-in-folder", activeFile.path);
  } else {
    ipcRenderer.invoke("open-save-folder");
  }
});

btnOpenFolder.addEventListener("click", () => {
  ipcRenderer.invoke("open-save-folder");
});

btnUndo.addEventListener("click", undo);

// OCR İŞLEMİ
function openOcrModal() {
  ocrModal.hidden = false;
  ocrModal.classList.add("active");
  ocrLoading.hidden = false;
  ocrLoading.classList.add("active");
  ocrProgressText.textContent = "Resim taranıyor ve metinler çıkarılıyor...";
  ocrResultText.value = "";
}

function closeOcrModal() {
  ocrModal.hidden = true;
  ocrModal.classList.remove("active");
  ocrLoading.hidden = true;
  ocrLoading.classList.remove("active");
}

function preprocessCanvasForOCR(sourceCanvas) {
  const offscreen = document.createElement("canvas");
  const scale = 2.2;
  offscreen.width = Math.round(sourceCanvas.width * scale);
  offscreen.height = Math.round(sourceCanvas.height * scale);

  const octx = offscreen.getContext("2d", { willReadFrequently: true });
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(sourceCanvas, 0, 0, offscreen.width, offscreen.height);

  const imgData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imgData.data;

  // Parlaklık hesabı ile koyu tema kontrolü
  let totalBrightness = 0;
  const step = 4 * 16;
  let count = 0;
  for (let i = 0; i < data.length; i += step) {
    totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    count++;
  }
  const avgBrightness = totalBrightness / Math.max(1, count);
  const isDarkMode = avgBrightness < 128;

  // Gri tonlama, koyu modda renk tersine çevirme ve netlik artırma
  for (let i = 0; i < data.length; i += 4) {
    let gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (isDarkMode) {
      gray = 255 - gray; // Koyu arkaplanı beyaza, beyaz yazıyı siyaha çevir (Tesseract için en ideal format)
    }
    // Kontrast artırımı
    gray = (gray - 128) * 1.35 + 128;
    gray = Math.max(0, Math.min(255, gray));

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  octx.putImageData(imgData, 0, 0);
  return offscreen.toDataURL("image/png");
}

async function triggerOCR() {
  if (!activeFile && !mainCanvas.width) return;

  openOcrModal();

  // Görüntüyü OCR için optimize et (2.2x büyütme, koyu mod düzeltme ve kontrast netleştirme)
  const processedDataUrl = preprocessCanvasForOCR(mainCanvas);
  const res = await ipcRenderer.invoke("perform-ocr", {
    dataUrl: processedDataUrl,
    filePath: activeFile ? activeFile.path : null
  });
  
  ocrLoading.hidden = true;
  ocrLoading.classList.remove("active");

  if (res.ok) {
    ocrResultText.value = res.text || "(Resimde okunabilir metin bulunamadı)";
    if (res.text) {
      await ipcRenderer.invoke("copy-text-to-clipboard", res.text);
      showToast("🔍 Metin çıkarıldı ve doğrudan panoya kopyalandı!");
      btnCopyOcrText.textContent = "✅ Panoya Kopyalandı";
      setTimeout(() => {
        btnCopyOcrText.textContent = "📋 Metni Kopyala";
      }, 3000);
    }
  } else {
    ocrResultText.value = `Hata: ${res.error}`;
  }
}

btnOCR.addEventListener("click", triggerOCR);

btnCloseOcr.addEventListener("click", closeOcrModal);
btnCloseOcrFooter.addEventListener("click", closeOcrModal);

btnCopyOcrText.addEventListener("click", async () => {
  const text = ocrResultText.value;
  if (!text) return;

  await ipcRenderer.invoke("copy-text-to-clipboard", text);
  btnCopyOcrText.textContent = "✅ Kopyalandı!";
  setTimeout(() => {
    btnCopyOcrText.textContent = "📋 Metni Kopyala";
  }, 2000);
});

// ==========================================
// ARAÇ ÇUBUĞU ETKİLEŞİMLERİ
// ==========================================
function setupEventListeners() {
  // Araç seçimleri
  Object.keys(toolBtns).forEach((toolName) => {
    const btn = toolBtns[toolName];
    btn.addEventListener("click", () => {
      Object.values(toolBtns).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTool = toolName;

      if (activeTool === "pointer") {
        mainCanvas.style.cursor = "default";
      } else if (activeTool === "text") {
        mainCanvas.style.cursor = "text";
        showToast("💡 Resmin üzerine tıklayarak veya doğrudan SAĞ TIKLAYARAK metin ekleyebilirsiniz.");
      } else {
        mainCanvas.style.cursor = "crosshair";
      }
    });
  });

  // Sağ tık ile doğrudan metin ekleme
  canvasContainer.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (e.target === canvasContainer || e.target === mainCanvas) {
      openInlineTextInput(e.clientX, e.clientY);
    }
  });

  // Renk seçimleri
  colorDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      colorDots.forEach((d) => d.classList.remove("active"));
      dot.classList.add("active");
      activeColor = dot.dataset.color;
      if (selectedTextItem) {
        selectedTextItem.dataset.color = activeColor;
        applyTextContrast(selectedTextItem, activeColor);
      }
      if (activeInlineInput) {
        activeInlineInput.style.color = activeColor;
        if (activeColor === "#ffffff" || activeColor === "white") {
          activeInlineInput.style.textShadow = "0 0 2px #000, 0 0 4px #000";
        } else {
          activeInlineInput.style.textShadow = "none";
        }
      }
    });
  });

  // Sidebar Popup Aç/Kapat Butonları
  if (btnToggleSidebar) btnToggleSidebar.addEventListener("click", toggleSidebar);
  if (btnCloseSidebar) btnCloseSidebar.addEventListener("click", closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeSidebar);

  // Ekrana Sığdır / %100 Boyut Butonu
  if (btnFitScreen) {
    btnFitScreen.addEventListener("click", () => {
      setFitScreen(!isFitScreen);
      showToast(isFitScreen ? "🔍 Görsel ekrana tam sığdırıldı" : "🔍 Orijinal piksel boyutu (%100)");
    });
  }

  // Kalınlık seçimi
  lineWidthSelect.addEventListener("change", (e) => {
    activeLineWidth = parseInt(e.target.value, 10);
  });

  // Yazı boyutu seçimi
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener("change", (e) => {
      activeFontSize = parseInt(e.target.value, 10);
      if (selectedTextItem) {
        selectedTextItem.dataset.fontSize = activeFontSize;
        selectedTextItem.style.fontSize = `${activeFontSize}px`;
      }
      if (activeInlineInput) {
        activeInlineInput.dataset.fontSize = activeFontSize;
        activeInlineInput.style.fontSize = `${activeFontSize}px`;
      }
    });
  }

  // Kısayol Tuşları (Ctrl+Z, Ctrl+C, Ctrl+S, Ctrl+T, Ctrl+O, G, Delete, Escape)
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "t" || e.key === "T" || e.key === "o" || e.key === "O") {
        e.preventDefault();
        triggerOCR();
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        undo();
      } else if (e.key === "c" || e.key === "C") {
        if (!ocrModal.hidden) return;
        btnCopy.click();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        btnSave.click();
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        toggleSidebar();
      }
    } else if (e.key === "Escape") {
      if (sidebar && sidebar.classList.contains("active")) {
        closeSidebar();
        return;
      }
      closeOcrModal();
      cancelActiveInlineInput();
      selectTextItem(null);
    } else if ((e.key === "g" || e.key === "G") && !activeInlineInput) {
      toggleSidebar();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selectedTextItem && !activeInlineInput) {
      e.preventDefault();
      selectedTextItem.remove();
      selectedTextItem = null;
      showToast("🗑️ Metin silindi.");
    }
  });

  // Yeni ekran görüntüsü IPC bildirimi
  ipcRenderer.on("select-image", (_event, filePath) => {
    loadScreenshots(filePath);
    showToast("📸 Yeni ekran görüntüsü panoya kopyalandı ve açıldı!");
  });

  ipcRenderer.on("show-ocr-result", (_event, text) => {
    ocrModal.hidden = false;
    ocrModal.classList.add("active");
    ocrLoading.hidden = true;
    ocrLoading.classList.remove("active");
    ocrResultText.value = text || "(Metin bulunamadı)";
    btnCopyOcrText.textContent = "✅ Panoya Kopyalandı";
  });

  ipcRenderer.on("trigger-ocr", () => {
    triggerOCR();
  });

  ipcRenderer.on("ocr-progress", (_event, progress) => {
    ocrProgressText.textContent = `Metin taranıyor... (%${progress})`;
  });
}

// ==========================================
// YARDIMCI FONKSİYONLAR
// ==========================================
function hexToRgba(hex, alpha) {
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((x) => x + x).join("");
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hours}:${minutes}:${seconds}`;
}

let toastTimer = null;
function showToast(msg) {
  toastMessage.textContent = msg;
  toastMessage.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.style.opacity = "0";
  }, 4000);
}

// Uygulamayı başlat
init();
