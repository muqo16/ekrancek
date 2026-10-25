const { ipcRenderer } = require("electron");

const selectionShortcutValue = document.getElementById("selectionShortcutValue");
const fullscreenShortcutValue = document.getElementById("fullscreenShortcutValue");
const ocrShortcutValue = document.getElementById("ocrShortcutValue");
const autoOpenGalleryCheck = document.getElementById("autoOpenGalleryCheck");

const shortcutStatus = document.getElementById("shortcutStatus");
const saveButton = document.getElementById("saveButton");
const resetButton = document.getElementById("resetButton");
const cancelButton = document.getElementById("cancelButton");

const selectionModCtrl = document.getElementById("selectionModCtrl");
const selectionModShift = document.getElementById("selectionModShift");
const selectionModAlt = document.getElementById("selectionModAlt");
const selectionModSuper = document.getElementById("selectionModSuper");
const selectionMainKey = document.getElementById("selectionMainKey");

const fullscreenModCtrl = document.getElementById("fullscreenModCtrl");
const fullscreenModShift = document.getElementById("fullscreenModShift");
const fullscreenModAlt = document.getElementById("fullscreenModAlt");
const fullscreenModSuper = document.getElementById("fullscreenModSuper");
const fullscreenMainKey = document.getElementById("fullscreenMainKey");

const ocrModCtrl = document.getElementById("ocrModCtrl");
const ocrModShift = document.getElementById("ocrModShift");
const ocrModAlt = document.getElementById("ocrModAlt");
const ocrModSuper = document.getElementById("ocrModSuper");
const ocrMainKey = document.getElementById("ocrMainKey");

let currentShortcuts = null;
let pendingShortcuts = null;
let defaultSelectionShortcut = "CommandOrControl+Shift+S";
let defaultFullscreenShortcut = "CommandOrControl+Shift+F";
let defaultOcrShortcut = "CommandOrControl+Shift+T";

const keyOptions = [
  ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)),
  ...Array.from({ length: 10 }, (_, index) => String(index)),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
  "Space",
  "Tab",
  "Enter",
  "Escape",
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Up",
  "Down",
  "Left",
  "Right",
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/"
];

for (const key of keyOptions) {
  const sOption = document.createElement("option");
  sOption.value = key;
  sOption.textContent = key;
  selectionMainKey.appendChild(sOption);

  const fOption = document.createElement("option");
  fOption.value = key;
  fOption.textContent = key;
  fullscreenMainKey.appendChild(fOption);

  const oOption = document.createElement("option");
  oOption.value = key;
  oOption.textContent = key;
  ocrMainKey.appendChild(oOption);
}

ipcRenderer.invoke("get-shortcut").then((payload) => {
  currentShortcuts = {
    selectionShortcut: payload.selectionShortcut,
    fullscreenShortcut: payload.fullscreenShortcut,
    ocrShortcut: payload.ocrShortcut || defaultOcrShortcut,
    autoOpenGallery: payload.autoOpenGallery === true
  };
  pendingShortcuts = { ...currentShortcuts };
  defaultSelectionShortcut = payload.defaultSelectionShortcut;
  defaultFullscreenShortcut = payload.defaultFullscreenShortcut;
  defaultOcrShortcut = payload.defaultOcrShortcut || "CommandOrControl+Shift+T";

  applyShortcutToForm("selection", payload.selectionShortcut);
  applyShortcutToForm("fullscreen", payload.fullscreenShortcut);
  applyShortcutToForm("ocr", payload.ocrShortcut || defaultOcrShortcut);
  autoOpenGalleryCheck.checked = payload.autoOpenGallery === true;

  updatePreview();
});

[
  selectionModCtrl, selectionModShift, selectionModAlt, selectionModSuper, selectionMainKey,
  fullscreenModCtrl, fullscreenModShift, fullscreenModAlt, fullscreenModSuper, fullscreenMainKey,
  ocrModCtrl, ocrModShift, ocrModAlt, ocrModSuper, ocrMainKey,
  autoOpenGalleryCheck
].forEach((element) => {
  element.addEventListener("change", () => {
    updatePreview();
  });
});

saveButton.addEventListener("click", async () => {
  updatePreview();

  if (!pendingShortcuts || !isValidShortcut("selection") || !isValidShortcut("fullscreen") || !isValidShortcut("ocr")) {
    shortcutStatus.textContent = "Her kısayol için en az bir yardımcı tuş ve bir ana tuş seçin.";
    return;
  }

  const list = [pendingShortcuts.selectionShortcut, pendingShortcuts.fullscreenShortcut, pendingShortcuts.ocrShortcut];
  const uniqueList = new Set(list);
  if (uniqueList.size !== list.length) {
    shortcutStatus.textContent = "Kısayollar birbirinden farklı olmalıdır.";
    return;
  }

  const result = await ipcRenderer.invoke("save-shortcut", pendingShortcuts);
  if (!result.ok) {
    shortcutStatus.textContent = result.error;
    return;
  }

  window.close();
});

resetButton.addEventListener("click", () => {
  applyShortcutToForm("selection", defaultSelectionShortcut);
  applyShortcutToForm("fullscreen", defaultFullscreenShortcut);
  applyShortcutToForm("ocr", defaultOcrShortcut);
  autoOpenGalleryCheck.checked = false;
  updatePreview();
  shortcutStatus.textContent = "Varsayılan ayarlar yüklendi.";
});

cancelButton.addEventListener("click", () => {
  window.close();
});

function updatePreview() {
  const selectionShortcut = readShortcutFromForm("selection");
  const fullscreenShortcut = readShortcutFromForm("fullscreen");
  const ocrShortcut = readShortcutFromForm("ocr");
  const autoOpenGallery = autoOpenGalleryCheck.checked;

  pendingShortcuts = {
    selectionShortcut,
    fullscreenShortcut,
    ocrShortcut,
    autoOpenGallery
  };

  selectionShortcutValue.textContent = selectionShortcut || "Seçim yap";
  fullscreenShortcutValue.textContent = fullscreenShortcut || "Seçim yap";
  ocrShortcutValue.textContent = ocrShortcut || "Seçim yap";

  const allValid = isValidShortcut("selection") && isValidShortcut("fullscreen") && isValidShortcut("ocr");
  const hasDuplicates = selectionShortcut === fullscreenShortcut || selectionShortcut === ocrShortcut || fullscreenShortcut === ocrShortcut;

  saveButton.disabled = !allValid || hasDuplicates;

  if (!allValid) {
    shortcutStatus.textContent = "Tüm kısayollar için en az bir yardımcı tuş seçilmelidir.";
    return;
  }

  if (hasDuplicates) {
    shortcutStatus.textContent = "Kısayollar birbirinin aynısı olamaz.";
    return;
  }

  shortcutStatus.textContent = "Hazır. 'Kaydet' ile onaylayın.";
}

function isValidShortcut(type) {
  const form = getForm(type);
  return Boolean(form.mainKey.value) && (form.modCtrl.checked || form.modShift.checked || form.modAlt.checked || form.modSuper.checked);
}

function readShortcutFromForm(type) {
  const form = getForm(type);
  const parts = [];

  if (form.modCtrl.checked) parts.push("CommandOrControl");
  if (form.modShift.checked) parts.push("Shift");
  if (form.modAlt.checked) parts.push("Alt");
  if (form.modSuper.checked) parts.push("Super");
  if (form.mainKey.value) parts.push(form.mainKey.value);

  return parts.join("+");
}

function getForm(type) {
  if (type === "selection") {
    return {
      modCtrl: selectionModCtrl,
      modShift: selectionModShift,
      modAlt: selectionModAlt,
      modSuper: selectionModSuper,
      mainKey: selectionMainKey
    };
  }
  if (type === "fullscreen") {
    return {
      modCtrl: fullscreenModCtrl,
      modShift: fullscreenModShift,
      modAlt: fullscreenModAlt,
      modSuper: fullscreenModSuper,
      mainKey: fullscreenMainKey
    };
  }
  return {
    modCtrl: ocrModCtrl,
    modShift: ocrModShift,
    modAlt: ocrModAlt,
    modSuper: ocrModSuper,
    mainKey: ocrMainKey
  };
}

function applyShortcutToForm(type, shortcut) {
  const form = getForm(type);
  form.modCtrl.checked = false;
  form.modShift.checked = false;
  form.modAlt.checked = false;
  form.modSuper.checked = false;

  const parts = (shortcut || "").split("+");
  const key = parts[parts.length - 1] || "";

  for (const part of parts.slice(0, -1)) {
    if (part === "Control" || part === "CommandOrControl") form.modCtrl.checked = true;
    else if (part === "Shift") form.modShift.checked = true;
    else if (part === "Alt") form.modAlt.checked = true;
    else if (part === "Super") form.modSuper.checked = true;
  }

  if (keyOptions.includes(key)) {
    form.mainKey.value = key;
  } else {
    form.mainKey.value = type === "selection" ? "S" : (type === "fullscreen" ? "F" : "T");
  }
}
