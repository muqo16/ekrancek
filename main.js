const { app, BrowserWindow, Tray, Menu, shell, dialog, ipcMain, nativeImage, screen, Notification, desktopCapturer, globalShortcut, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Tesseract = require("tesseract.js");

let tray = null;
let overlayWindow = null;
let shortcutWindow = null;
let galleryWindow = null;
const oldSaveDir = path.join(os.homedir(), "Pictures", "ScreenshotTool");
let saveDir = path.join(os.homedir(), "Pictures", "OmniSnap Pro");
if (fs.existsSync(oldSaveDir) && !fs.existsSync(saveDir)) {
  saveDir = oldSaveDir;
}
const settingsPath = path.join(app.getPath("userData"), "settings.json");
const logPath = path.join(app.getPath("userData"), "screenshot-tool.log");

const defaultSelectionShortcut = "CommandOrControl+Shift+S";
const defaultFullscreenShortcut = "CommandOrControl+Shift+F";
const defaultOcrShortcut = "CommandOrControl+Shift+T";

let appSettings = loadSettings();
let shortcutStatus = {
  selection: false,
  fullscreen: false,
  ocr: false
};

ensureDirectory(saveDir);

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function logLine(level, message) {
  try {
    ensureDirectory(path.dirname(logPath));
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch (_error) {
  }
}

function logInfo(message) {
  logLine("INFO", message);
}

function logError(message) {
  logLine("ERROR", message);
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, "assets", "tray_icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  return process.platform === "win32" ? icon.resize({ width: 20, height: 20 }) : icon;
}

function buildTrayMenu() {
  const selectionLabel = shortcutStatus.selection ? appSettings.selectionShortcut : `${appSettings.selectionShortcut} - pasif`;
  const fullscreenLabel = shortcutStatus.fullscreen ? appSettings.fullscreenShortcut : `${appSettings.fullscreenShortcut} - pasif`;
  const ocrLabel = shortcutStatus.ocr ? appSettings.ocrShortcut : `${appSettings.ocrShortcut} - pasif`;

  return Menu.buildFromTemplate([
    { label: "Ekran Görüntüsü Al (Seçim)", click: () => openSelectWindow(false) },
    { label: "Ekran Görüntüsü Al (Tam Ekran)", click: captureFullScreen },
    { label: `Metin Oku / OCR (${ocrLabel})`, click: () => openSelectWindow(true) },
    { type: "separator" },
    { label: "Galeriyi ve Düzenleyiciyi Aç", click: () => openGalleryWindow() },
    { label: "Çekimden Sonra Galeriyi Aç", type: "checkbox", checked: appSettings.autoOpenGallery, click: (menuItem) => setAutoOpenGallery(menuItem.checked) },
    { type: "separator" },
    { label: `Kısayol Ayarları (Kesit: ${selectionLabel})`, click: openShortcutWindow },
    { label: `Tam Ekran Kısayolu: ${fullscreenLabel}`, click: openShortcutWindow },
    { label: `OCR Kısayolu: ${ocrLabel}`, click: openShortcutWindow },
    { type: "separator" },
    { label: "Windows ile Başlat", type: "checkbox", checked: appSettings.launchAtStartup, click: (menuItem) => setLaunchAtStartup(menuItem.checked) },
    { label: "Kayıt Klasörünü Aç", click: () => shell.openPath(saveDir) },
    { label: "Kayıt Klasörü Seç", click: chooseSaveDir },
    { label: "Log Dosyasını Aç", click: () => shell.openPath(logPath) },
    { type: "separator" },
    { label: "Çıkış", click: () => app.quit() }
  ]);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("OmniSnap Pro");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => openGalleryWindow());
  tray.on("click", () => tray.popUpContextMenu());
}

function showCaptureNotification(body) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: "OmniSnap Pro",
    body,
    icon: path.join(__dirname, "assets", "tray_icon.png"),
    silent: true
  });
  notif.show();
}

function showStartupNotification() {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title: "OmniSnap Pro Hazır",
    body: "Uygulama sistem tepsisinde çalışıyor. Saat yanındaki gizli simgeler alanını da kontrol et.",
    icon: path.join(__dirname, "assets", "tray_icon.png"),
    silent: true
  });

  notification.show();
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        selectionShortcut: parsed.selectionShortcut || parsed.shortcut || defaultSelectionShortcut,
        fullscreenShortcut: parsed.fullscreenShortcut || defaultFullscreenShortcut,
        ocrShortcut: parsed.ocrShortcut || defaultOcrShortcut,
        autoOpenGallery: parsed.autoOpenGallery === true, // Varsayılan: false (fotoğraflar sessizce kaydedilip panoya atılır)
        launchAtStartup: parsed.launchAtStartup !== false
      };
    }
  } catch (_error) {
  }

  return {
    selectionShortcut: defaultSelectionShortcut,
    fullscreenShortcut: defaultFullscreenShortcut,
    ocrShortcut: defaultOcrShortcut,
    autoOpenGallery: false,
    launchAtStartup: true
  };
}

function saveSettings() {
  ensureDirectory(path.dirname(settingsPath));
  fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(buildTrayMenu());
}

function applyLaunchAtStartup(enabled) {
  const exePath = app.getPath("exe");
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: exePath,
    args: ["--hidden"]
  });
  logInfo(`Windows ile baslat ayari uygulandi: ${enabled}`);
}

function setLaunchAtStartup(enabled) {
  appSettings.launchAtStartup = enabled;
  saveSettings();
  applyLaunchAtStartup(enabled);
  refreshTrayMenu();
}

function setAutoOpenGallery(enabled) {
  appSettings.autoOpenGallery = enabled;
  saveSettings();
  refreshTrayMenu();
  logInfo(`Cekimden sonra galeri ac ayari: ${enabled}`);
}

function registerShortcuts(settings) {
  globalShortcut.unregisterAll();
  shortcutStatus = {
    selection: false,
    fullscreen: false,
    ocr: false
  };

  logInfo(`Secim kisayol kayit denemesi: ${settings.selectionShortcut}`);
  const selectionRegistered = globalShortcut.register(settings.selectionShortcut, () => {
    openSelectWindow(false);
  });
  if (selectionRegistered) {
    shortcutStatus.selection = true;
    logInfo(`Secim kisayolu kaydedildi: ${settings.selectionShortcut}`);
  }

  logInfo(`Tam ekran kisayol kayit denemesi: ${settings.fullscreenShortcut}`);
  const fullscreenRegistered = globalShortcut.register(settings.fullscreenShortcut, () => {
    captureFullScreen();
  });
  if (fullscreenRegistered) {
    shortcutStatus.fullscreen = true;
    logInfo(`Tam ekran kisayolu kaydedildi: ${settings.fullscreenShortcut}`);
  }

  const ocrKey = settings.ocrShortcut || defaultOcrShortcut;
  logInfo(`OCR kisayol kayit denemesi: ${ocrKey}`);
  const ocrRegistered = globalShortcut.register(ocrKey, () => {
    handleGlobalOcrShortcut();
  });
  if (ocrRegistered) {
    shortcutStatus.ocr = true;
    logInfo(`OCR kisayolu kaydedildi: ${ocrKey}`);
  }
}

function handleGlobalOcrShortcut() {
  if (galleryWindow && !galleryWindow.isDestroyed() && galleryWindow.isVisible()) {
    galleryWindow.focus();
    galleryWindow.webContents.send("trigger-ocr");
  } else {
    // Doğrudan ekrandan metin seçmek için seçim penceresini OCR modunda aç
    openSelectWindow(true);
  }
}

function tryRegisterShortcuts(settings, showWarning = false) {
  try {
    registerShortcuts(settings);
    refreshTrayMenu();
    return true;
  } catch (error) {
    refreshTrayMenu();

    if (showWarning) {
      logError(`Kisayollar aktif degil | ${error.message}`);
      dialog.showErrorBox("Kisayol ayarlanamadi", error.message);
    }

    return false;
  }
}

function openShortcutWindow() {
  if (shortcutWindow && !shortcutWindow.isDestroyed()) {
    shortcutWindow.focus();
    return;
  }

  shortcutWindow = new BrowserWindow({
    width: 480,
    height: 720,
    resizable: true,
    maximizable: false,
    minimizable: true,
    title: "Kısayol ve Davranış Ayarları",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  shortcutWindow.loadFile(path.join(__dirname, "renderer", "shortcut.html"));
  logInfo("Kisayol penceresi acildi");
  shortcutWindow.on("closed", () => {
    shortcutWindow = null;
  });
}

function openGalleryWindow(initialFilePath = null) {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    if (galleryWindow.isMinimized()) {
      galleryWindow.restore();
    }
    galleryWindow.show();
    galleryWindow.focus();
    if (initialFilePath) {
      galleryWindow.webContents.send("select-image", initialFilePath);
    }
    return galleryWindow;
  }

  galleryWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 850,
    minHeight: 600,
    title: "Ekran Görüntüsü Galerisi ve Düzenleyici",
    icon: path.join(__dirname, "assets", "tray_icon.png"),
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  galleryWindow.loadFile(path.join(__dirname, "renderer", "gallery.html"));

  galleryWindow.webContents.on("did-finish-load", () => {
    if (initialFilePath) {
      galleryWindow.webContents.send("select-image", initialFilePath);
    }
  });

  galleryWindow.on("closed", () => {
    galleryWindow = null;
  });

  return galleryWindow;
}

function openSelectWindow(isOcr = false) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: { isOcr: isOcr ? "1" : "0" }
  });

  logInfo(`Secim penceresi acildi (isOcr: ${isOcr})`);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

async function captureFullScreen() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const image = await captureDisplay(primaryDisplay);

    if (!image) {
      return;
    }

    const filePath = path.join(saveDir, `full_${Date.now()}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    logInfo(`Tum ekran kaydedildi: ${filePath}`);

    // Panoya otomatik kopyala
    clipboard.writeImage(image);
    logInfo("Panoya kopyalandı");

    // Kullanıcı ayarına göre galeriyi aç veya sessizce bildir
    if (appSettings.autoOpenGallery) {
      openGalleryWindow(filePath);
    } else {
      showCaptureNotification("Tam ekran kaydedildi ve panoya kopyalandı.");
    }
  } catch (error) {
    logError(`Tum ekran hatasi: ${error.message}`);
    dialog.showErrorBox("Ekran goruntusu alinamadi", error.message);
  }
}

async function captureDisplay(display) {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: display.size.width,
      height: display.size.height
    }
  });

  const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
  if (!source) {
    logError("Ekran kaynagi bulunamadi");
    return null;
  }

  return source.thumbnail;
}

function chooseSaveDir() {
  const result = dialog.showOpenDialogSync({
    properties: ["openDirectory"],
    defaultPath: saveDir
  });

  if (result && result[0]) {
    saveDir = result[0];
    ensureDirectory(saveDir);
    logInfo(`Kayit klasoru degisti: ${saveDir}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("capture-selection", async (_event, rect) => {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
      await wait(120);
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const image = await captureDisplay(primaryDisplay);

    if (!image) {
      throw new Error("Goruntu kaynagi bulunamadi.");
    }

    const cropped = image.crop({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });

    const filePath = path.join(saveDir, `select_${Date.now()}.png`);
    fs.writeFileSync(filePath, cropped.toPNG());
    logInfo(`Secim kaydedildi: ${filePath}`);

    // Panoya otomatik kopyala
    clipboard.writeImage(cropped);
    logInfo("Panoya kopyalandı");

    if (appSettings.autoOpenGallery) {
      openGalleryWindow(filePath);
    } else {
      showCaptureNotification("Ekran görüntüsü kaydedildi ve panoya kopyalandı.");
    }

    return { ok: true, filePath };
  } catch (error) {
    logError(`Secim alma hatasi: ${error.message}`);
    return { ok: false, error: error.message };
  } finally {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  }
});

// Doğrudan ekrandan metin seçip anında OCR yapan kanal
ipcMain.handle("capture-selection-ocr", async (_event, rect) => {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
      await wait(120);
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const image = await captureDisplay(primaryDisplay);
    if (!image) throw new Error("Görüntü kaynağı bulunamadı.");

    const cropped = image.crop({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });

    const filePath = path.join(saveDir, `ocr_${Date.now()}.png`);
    const pngBuffer = cropped.toPNG();
    fs.writeFileSync(filePath, pngBuffer);

    // OCR çalıştır
    logInfo("Doğrudan ekrandan OCR başlatılıyor...");
    const worker = await getOcrWorker();
    const { data: { text } } = await worker.recognize(pngBuffer);
    const cleanText = text ? text.trim() : "";

    if (cleanText) {
      clipboard.writeText(cleanText);
      showCaptureNotification(`Metin panoya kopyalandı:\n"${cleanText.slice(0, 60)}..."`);
    } else {
      showCaptureNotification("Seçilen alanda okunabilir metin bulunamadı.");
    }

    // Galeriyi aç ve OCR sonucunu göster
    const gw = openGalleryWindow(filePath);
    if (gw && !gw.isDestroyed()) {
      gw.webContents.on("did-finish-load", () => {
        gw.webContents.send("show-ocr-result", cleanText);
      });
      if (!gw.webContents.isLoading()) {
        gw.webContents.send("show-ocr-result", cleanText);
      }
    }

    return { ok: true, text: cleanText };
  } catch (error) {
    logError(`capture-selection-ocr hatası: ${error.message}`);
    return { ok: false, error: error.message };
  } finally {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  }
});

ipcMain.handle("cancel-selection", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

ipcMain.handle("get-shortcut", () => {
  return {
    selectionShortcut: appSettings.selectionShortcut,
    fullscreenShortcut: appSettings.fullscreenShortcut,
    ocrShortcut: appSettings.ocrShortcut || defaultOcrShortcut,
    autoOpenGallery: appSettings.autoOpenGallery === true,
    defaultSelectionShortcut,
    defaultFullscreenShortcut,
    defaultOcrShortcut
  };
});

ipcMain.handle("save-shortcut", (_event, shortcuts) => {
  const previousSettings = { ...appSettings };

  try {
    const nextSettings = {
      selectionShortcut: shortcuts.selectionShortcut,
      fullscreenShortcut: shortcuts.fullscreenShortcut,
      ocrShortcut: shortcuts.ocrShortcut || defaultOcrShortcut,
      autoOpenGallery: shortcuts.autoOpenGallery === true,
      launchAtStartup: appSettings.launchAtStartup
    };
    registerShortcuts(nextSettings);
    appSettings = nextSettings;
    saveSettings();
    logInfo(`Ayarlar kaydedildi: secim=${appSettings.selectionShortcut}, tamEkran=${appSettings.fullscreenShortcut}, ocr=${appSettings.ocrShortcut}, galeriAc=${appSettings.autoOpenGallery}`);
    refreshTrayMenu();
    return { ok: true, shortcuts: nextSettings };
  } catch (error) {
    tryRegisterShortcuts(previousSettings, false);
    return { ok: false, error: error.message };
  }
});

// ==========================================
// GALERİ & DÜZENLEYİCİ & OCR IPC İŞLEYİCİLERİ
// ==========================================
ipcMain.handle("get-screenshots", async () => {
  try {
    ensureDirectory(saveDir);
    const files = fs.readdirSync(saveDir);
    const list = [];
    for (const file of files) {
      if (/\.(png|jpe?g|webp|bmp)$/i.test(file)) {
        const fullPath = path.join(saveDir, file);
        try {
          const stats = fs.statSync(fullPath);
          list.push({
            name: file,
            path: fullPath,
            size: stats.size,
            mtime: stats.mtimeMs,
            created: stats.birthtimeMs || stats.mtimeMs
          });
        } catch (_e) {}
      }
    }
    list.sort((a, b) => b.mtime - a.mtime);
    return { ok: true, list, saveDir };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("delete-screenshot", async (_event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo(`Dosya silindi: ${filePath}`);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("copy-image-to-clipboard", async (_event, { filePath, dataUrl }) => {
  try {
    if (dataUrl) {
      const img = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(img);
    } else if (filePath && fs.existsSync(filePath)) {
      const img = nativeImage.createFromPath(filePath);
      clipboard.writeImage(img);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("copy-text-to-clipboard", async (_event, text) => {
  clipboard.writeText(text || "");
  return { ok: true };
});

ipcMain.handle("save-annotated-image", async (_event, { filePath, dataUrl, overwrite }) => {
  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    let targetPath = filePath;
    if (!overwrite) {
      const parsed = path.parse(filePath);
      let candidate = path.join(parsed.dir, `${parsed.name}_duzenlendi.png`);
      let counter = 1;
      while (fs.existsSync(candidate)) {
        counter++;
        candidate = path.join(parsed.dir, `${parsed.name}_duzenlendi_${counter}.png`);
      }
      targetPath = candidate;
    }

    fs.writeFileSync(targetPath, buffer);
    const img = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(img);
    logInfo(`Orijinal korundu. Duzenlenen yeni kopya kaydedildi: ${targetPath}`);

    return { ok: true, targetPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

let ocrWorker = null;

function getTessdataPath() {
  if (app.isPackaged && process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, "tur.traineddata"))) {
    return process.resourcesPath;
  }
  if (fs.existsSync(path.join(__dirname, "tur.traineddata"))) {
    return __dirname;
  }
  const userTessPath = path.join(app.getPath("userData"), "tessdata");
  ensureDirectory(userTessPath);
  return userTessPath;
}

function getWorkerPath() {
  const unpackedPath = path.join(__dirname, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js").replace("app.asar", "app.asar.unpacked");
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }
  return undefined;
}

async function getOcrWorker() {
  if (!ocrWorker) {
    const tessDir = getTessdataPath();
    const workerPath = getWorkerPath();
    logInfo(`OCR worker baslatiliyor. tessDir: ${tessDir}, workerPath: ${workerPath}`);

    const options = {
      cachePath: tessDir,
      cacheMethod: "readOnly",
      logger: (m) => {
        if (galleryWindow && !galleryWindow.isDestroyed() && m.status === "recognizing text") {
          galleryWindow.webContents.send("ocr-progress", Math.round((m.progress || 0) * 100));
        }
      }
    };
    if (workerPath) {
      options.workerPath = workerPath;
    }

    ocrWorker = await Tesseract.createWorker("tur+eng", 1, options);
  }
  return ocrWorker;
}

ipcMain.handle("perform-ocr", async (_event, payload) => {
  try {
    let input = null;
    if (typeof payload === "string") {
      if (payload.startsWith("data:image/")) {
        const base64Data = payload.replace(/^data:image\/[a-z]+;base64,/, "");
        input = Buffer.from(base64Data, "base64");
      } else if (fs.existsSync(payload)) {
        input = payload;
      }
    } else if (payload && payload.dataUrl) {
      const base64Data = payload.dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
      input = Buffer.from(base64Data, "base64");
    } else if (payload && payload.filePath && fs.existsSync(payload.filePath)) {
      input = payload.filePath;
    }

    if (!input) {
      throw new Error("Goruntu verisi okunamadi.");
    }

    logInfo("OCR islemi baslatiliyor...");
    const worker = await getOcrWorker();
    const { data: { text } } = await worker.recognize(input);
    logInfo(`OCR tamamlandi. Metin uzunlugu: ${text ? text.length : 0}`);
    return { ok: true, text: text ? text.trim() : "" };
  } catch (error) {
    logError(`OCR hatasi: ${error.message}`);
    if (ocrWorker) {
      try { await ocrWorker.terminate(); } catch (_e) {}
      ocrWorker = null;
    }
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("show-item-in-folder", async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    shell.openPath(saveDir);
  }
  return { ok: true };
});

ipcMain.handle("open-save-folder", async () => {
  shell.openPath(saveDir);
  return { ok: true };
});

app.whenReady().then(() => {
  logInfo("Uygulama basladi");
  app.setAppUserModelId("com.example.screenshot");
  applyLaunchAtStartup(appSettings.launchAtStartup);
  createTray();
  refreshTrayMenu();
  tryRegisterShortcuts(appSettings, true);
  showStartupNotification();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

process.on("uncaughtException", (error) => {
  logError(`uncaughtException: ${error.message}`);
  dialog.showErrorBox("OmniSnap Pro Hatası", error.message);
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`unhandledRejection: ${message}`);
  dialog.showErrorBox("OmniSnap Pro Hatası", message);
});
