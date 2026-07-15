const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1650,
    height: 950,
    minWidth: 1250,
    minHeight: 780,
    backgroundColor: "#020617",
    title: "Rugby Analysis Suite",
    icon: path.join(__dirname, "../build/icon.ico"),
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#02070d",
      symbolColor: "#ffffff",
      height: 36,
    },
    webPreferences: {
  preload: path.join(__dirname, "preload.cjs"),
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: false,
  allowRunningInsecureContent: false,
},
  });

  mainWindow.setMenuBarVisibility(false);

  if (app.isPackaged) {
    mainWindow.webContents.once("did-finish-load", () => showPatchNotesOnFirstLaunch());
  }

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
}

async function showPatchNotesOnFirstLaunch() {
  const currentVersion = app.getVersion();
  const notesByVersion = {
    "1.3.9": [
      "Redesigned the customer report cover as a premium, team-colour-driven match dossier.",
      "Reordered reports around coaching priority: key takeaways, set piece, kicking, attack, Gold Zone, defence, discipline and territory.",
      "Added numbered, match-specific contributing-factor explanations linked directly to each statistical takeaway.",
      "Expanded attack breakdowns with Scrum, Lineout, Maul and detailed lineout-launch attempts and successful outcomes.",
      "Removed redundant opposition-won controls and the standalone maul launcher while retaining opposition lineout and scrum steals.",
      "Merged missed-tackle clips logged within two seconds to avoid duplicate sequences.",
      "Preserved compilation videos generated with different timing presets inside the same Coach Package.",
      "Improved report heatmaps, Gold Zone evidence, ball-security analysis and video-review flow.",
    ],
    "1.3.6": [
      "Redesigned the Rugby Performance Report with evidence-led priorities and a Statistical Match Evaluation.",
      "Added clickable compilation-video links to exported reports.",
      "Added final-score tracking and result-based statistical summaries.",
      "Added automatic possession-based Attack and Defence panel switching for set pieces.",
      "Added a required field-position checkpoint for every attacking phase.",
      "Fixed the Match Analysis dashboard layout and independent scrolling.",
    ],
    "1.3.5": [
      "Restored the official Rugby Analysis Suite desktop and installer icon.",
      "Removed the redundant standalone kicking menu; kicks remain inside the attack workflow and statistics.",
      "Improved automated release publishing and updater-file delivery.",
    ],
    "1.3.4": [
      "Restored the official Rugby Analysis Suite desktop and installer icon.",
      "Improved automated release publishing for future updates.",
    ],
    "1.3.3": [
      "Added genuine per-clip compilation rendering progress.",
      "Added export quality checks before client PDF generation.",
      "Added a dynamic keyboard shortcut cheat sheet.",
      "Added visible autosave recovery with Restore and Discard options.",
      "Added an in-app Update Centre with manual update checks.",
      "Added automated GitHub release builds for safer updater assets.",
      "Improved Electron renderer sandboxing and blocked insecure remote content.",
      "Removed analyst identity from client-facing PDF reports.",
    ],
    "1.3.2": [
      "Added separate JD Gouws and Gabrie Gouws analyst profiles.",
      "Keybinds, appearance, contact details and sessions now save per analyst.",
      "Added fully customisable keyboard shortcuts and conflict warnings.",
      "Added statistical 3 Strengths and 3 Work-ons to coach reports.",
      "Added appearance controls for colour, motion, density and visual intensity.",
      "Added automatic session recovery and a Welcome Back experience.",
      "Added animated notifications, compilation rendering stages and update progress.",
      "Removed analysis levels in favour of one complete analyst workflow.",
    ],
    "1.3.1": [
      "Gainline tracking added to every attacking phase.",
      "Quick, average and slow ruck-speed tracking added.",
      "Gainline and quick-ball metrics added to PDF reports.",
      "Coach Summary now uses gainline and ruck-speed insights.",
      "Exit, contestable and clearance kick workflows added.",
      "Kickoff and 22m dropout restart tracking added.",
      "Penalty Tap, Try Scored and 3 Points Taken workflows added.",
      "Gold Zone entries now follow possession instead of counting every event.",
      "Analysis workspace streamlined for faster tagging.",
    ],
  };

  const notes = notesByVersion[currentVersion];
  if (!notes || !mainWindow) return;

  const statePath = path.join(app.getPath("userData"), "patch-notes-state.json");
  let lastShownVersion = "";

  try {
    lastShownVersion = JSON.parse(fs.readFileSync(statePath, "utf8")).lastShownVersion || "";
  } catch (_) {}

  if (lastShownVersion === currentVersion) return;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  let logoData = "";
  try {
    const logoBuffer = fs.readFileSync(path.join(app.getAppPath(), "dist", "ras-logo.png"));
    logoData = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch (_) {}

  const patchWindow = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 760,
    height: 720,
    minWidth: 620,
    minHeight: 620,
    resizable: true,
    frame: false,
    show: false,
    backgroundColor: "#02070d",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const noteCards = notes.map((note, index) => `<article style="--delay:${index * 85}ms"><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(note)}</p><i>NEW</i></article>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 5%,rgba(126,217,87,.16),transparent 31%),#02070d;color:#fff;font-family:Inter,Segoe UI,Arial,sans-serif;overflow:hidden}.shell{height:100vh;display:grid;grid-template-rows:auto 1fr auto;position:relative}.grid{position:absolute;inset:0;opacity:.18;background-image:linear-gradient(rgba(126,217,87,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(126,217,87,.12) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent 72%);pointer-events:none}.hero{position:relative;padding:30px 34px 24px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:18px;animation:reveal .55s cubic-bezier(.2,.8,.2,1)}.hero img{width:64px;height:64px;object-fit:contain;border-radius:16px;filter:drop-shadow(0 0 20px rgba(126,217,87,.2))}.eyebrow{margin:0 0 6px;color:#7ed957;font-size:11px;font-weight:950;letter-spacing:.25em;text-transform:uppercase}.hero h1{margin:0;font-size:34px;letter-spacing:-.04em}.hero h1 b{color:#7ed957}.version{margin-left:auto;padding:10px 14px;border:1px solid rgba(126,217,87,.28);border-radius:999px;background:rgba(126,217,87,.09);color:#bdf7a5;font-weight:900}.progress{position:absolute;left:0;bottom:-1px;width:100%;height:2px;background:rgba(255,255,255,.05);overflow:hidden}.progress i{display:block;width:100%;height:100%;background:linear-gradient(90deg,transparent,#7ed957,transparent);animation:sweep 2.3s ease-in-out infinite}.content{position:relative;overflow:auto;padding:24px 34px 18px}.content::-webkit-scrollbar{width:8px}.content::-webkit-scrollbar-thumb{background:rgba(126,217,87,.24);border-radius:99px}.intro{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:16px}.intro h2{margin:0;font-size:20px}.intro p{margin:0;color:#91a39a;font-size:12px}.cards{display:grid;gap:10px}.cards article{opacity:0;transform:translateY(16px);display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:13px;padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:linear-gradient(135deg,rgba(126,217,87,.075),rgba(255,255,255,.025));animation:cardIn .45s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(350ms + var(--delay));transition:.2s}.cards article:hover{transform:translateX(4px)!important;border-color:rgba(126,217,87,.3);background:rgba(126,217,87,.09)}.cards span{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:rgba(126,217,87,.14);color:#7ed957;font-size:11px;font-weight:950}.cards p{margin:0;color:#dfe9e3;font-size:13px;line-height:1.45}.cards i{font-style:normal;color:#7ed957;font-size:8px;font-weight:950;letter-spacing:.14em}.footer{position:relative;padding:18px 34px 24px;border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:16px;background:rgba(2,7,13,.92)}.footer p{margin:0;color:#91a39a;font-size:11px;line-height:1.5;flex:1}.footer button{border:0;border-radius:15px;padding:15px 25px;background:linear-gradient(135deg,#7ed957,#5cb338);color:#061109;font-weight:950;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;box-shadow:0 12px 35px rgba(92,179,56,.25);transition:.2s}.footer button:hover{transform:translateY(-2px);box-shadow:0 17px 42px rgba(92,179,56,.35)}@keyframes reveal{from{opacity:0;transform:translateY(-15px)}to{opacity:1;transform:none}}@keyframes cardIn{to{opacity:1;transform:none}}@keyframes sweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}@media(max-width:650px){.hero,.content,.footer{padding-left:20px;padding-right:20px}.hero h1{font-size:26px}.version{display:none}}
  </style></head><body><div class="shell"><div class="grid"></div><header class="hero">${logoData ? `<img src="${logoData}" alt="">` : ""}<div><p class="eyebrow">Update Installed Successfully</p><h1>What’s new in <b>v${escapeHtml(currentVersion)}</b></h1></div><span class="version">v${escapeHtml(currentVersion)}</span><div class="progress"><i></i></div></header><main class="content"><div class="intro"><div><p class="eyebrow">Release Highlights</p><h2>Your analysis workspace just levelled up.</h2></div><p>${notes.length} improvements ready</p></div><section class="cards">${noteCards}</section></main><footer class="footer"><p>These notes appear once after each update.<br>Everything is ready when you are.</p><button onclick="window.close()">Enter the Suite →</button></footer></div></body></html>`;

  patchWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  patchWindow.once("ready-to-show", () => patchWindow.show());
  patchWindow.on("closed", () => {
    try {
      fs.writeFileSync(statePath, JSON.stringify({ lastShownVersion: currentVersion }, null, 2));
    } catch (error) {
      console.error("Could not save patch notes state:", error);
    }
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  const sendUpdateStatus = (state, message, version) => mainWindow?.webContents.send("update-status", { state, message, version });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("downloading", `Downloading update… ${Math.round(progress.percent)}%`);
    if (!mainWindow) return;
    mainWindow.setProgressBar(Math.max(0, Math.min(1, progress.percent / 100)));
    mainWindow.webContents.send("update-progress", { percent: progress.percent, transferred: progress.transferred, total: progress.total });
  });

  autoUpdater.on("update-available", async (info) => {
    sendUpdateStatus("available", `Version ${info.version} is available.`, info.version);
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `Rugby Analysis Suite v${info.version} is available.`,
      detail: "Do you want to download the update now?",
      buttons: ["Download Update", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-not-available", (info) => sendUpdateStatus("up-to-date", `You are running the latest version (${info.version}).`, info.version));

  autoUpdater.on("update-downloaded", async () => {
    sendUpdateStatus("ready", "Update downloaded and ready to install.");
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
      mainWindow.webContents.send("update-progress", { percent: 100 });
    }
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: "The update has been downloaded.",
      detail: "Restart Rugby Analysis Suite now to install it?",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.on("error", (error) => {
    sendUpdateStatus("error", error.message || "Update check failed.");
    if (mainWindow) mainWindow.setProgressBar(-1);
    console.error("Auto updater error:", error);
  });

  setTimeout(() => {
    sendUpdateStatus("checking", "Checking for updates…");
    autoUpdater.checkForUpdates().catch((error) => console.error("Update check failed:", error));
  }, 3000);
}

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) return { success: false, message: "Update checks are available in the installed app." };
  try { await autoUpdater.checkForUpdates(); return { success: true }; } catch (error) { return { success: false, message: error.message }; }
});

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function safeFileName(value) {
  return String(value || "compilation")
    .trim()
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function escapeDrawText(value) {
  return String(value || "COMPILATION")
    .toUpperCase()
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function quoteConcatPath(filePath) {
  return `file '${String(filePath).replace(/'/g, "'\\''")}'`;
}

function buildTitleFilter(groupType) {
  const title = escapeDrawText(groupType);
  return [
    "pad=iw:ih+88:0:88:black",
    `drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='${title}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=19`,
  ].join(",");
}

ipcMain.handle("select-video", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Match Footage",
    properties: ["openFile"],
    filters: [
      {
        name: "Video Files",
        extensions: ["mov", "mp4", "m4v", "avi", "mkv"],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];

  return {
    path: filePath,
    name: path.basename(filePath),
    url: pathToFileURL(filePath).toString(),
  };
});


ipcMain.handle("optimise-video-for-playback", async (_event, data) => {
  const { videoPath } = data || {};

  if (!videoPath) {
    return { success: false, message: "No video path provided." };
  }

  if (!fs.existsSync(videoPath)) {
    return { success: false, message: "Selected video file could not be found." };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ras-playback-"));
  const baseName = safeFileName(path.basename(videoPath, path.extname(videoPath)));
  const outputPath = path.join(tempRoot, `${baseName || "match-footage"}-playback.mp4`);

  try {
    await runFFmpeg([
      "-y",
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return {
      success: true,
      path: outputPath,
      url: pathToFileURL(outputPath).toString(),
      name: path.basename(outputPath),
    };
  } catch (error) {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}

    return {
      success: false,
      message: error.message || "Could not optimise this video for playback.",
    };
  }
});

ipcMain.handle("generate-test-clip", async (_event, data) => {
  const { videoPath, start, duration } = data;

  const saveResult = await dialog.showSaveDialog({
    title: "Save Test Clip",
    defaultPath: "test-clip.mp4",
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, message: "Save cancelled." };
  }

  try {
    await runFFmpeg([
      "-y",
      "-ss",
      String(start),
      "-i",
      videoPath,
      "-t",
      String(duration),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      saveResult.filePath,
    ]);

    return { success: true, outputPath: saveResult.filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle("export-coach-package", async (_event, data) => {
  try {
    const folderResult = await dialog.showOpenDialog({ title: "Choose Folder For Coach Package", properties: ["openDirectory", "createDirectory"] });
    if (folderResult.canceled || !folderResult.filePaths.length) return { success: false, message: "Coach Package export cancelled." };
    const selectedFolder = folderResult.filePaths[0];
    const packageName = `${safeFileName(data.suggestedName || "Rugby-Analysis")}-Coach-Package`;
    const packageFolder = path.join(selectedFolder, packageName);
    const videoFolder = path.join(packageFolder, "Video Clips");
    const legacyVideoFolder = path.join(packageFolder, "videos");
    const videoLibraryPath = path.join(packageFolder, "Open-Video-Library.html");
    const legacyCoachPage = path.join(packageFolder, "Open-Coach-Package.html");
    const redundantSourceFiles = [];
    fs.mkdirSync(videoFolder, { recursive: true });
    fs.writeFileSync(path.join(packageFolder, "Match-Report.pdf"), Buffer.from(data.pdfBase64, "base64"));
    fs.writeFileSync(videoLibraryPath, String(data.html || ""), "utf8");
    for (const sourcePath of data.videoPaths || []) {
      if (!fs.existsSync(sourcePath)) throw new Error(`Compilation video not found: ${path.basename(sourcePath)}`);
      const destinationPath = path.join(videoFolder, path.basename(sourcePath));
      if (path.resolve(sourcePath) !== path.resolve(destinationPath)) fs.copyFileSync(sourcePath, destinationPath);
      // Compilation files generated directly into the chosen customer-export
      // folder are staging files. Remove those only after every copy succeeds.
      if (path.resolve(path.dirname(sourcePath)) === path.resolve(selectedFolder)) redundantSourceFiles.push(sourcePath);
    }
    if (fs.existsSync(legacyVideoFolder) && path.resolve(legacyVideoFolder) !== path.resolve(videoFolder)) fs.rmSync(legacyVideoFolder, { recursive: true, force: true });
    if (fs.existsSync(legacyCoachPage) && path.resolve(legacyCoachPage) !== path.resolve(videoLibraryPath)) fs.unlinkSync(legacyCoachPage);
    redundantSourceFiles.forEach((sourcePath) => { if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath); });
    return { success: true, folder: packageFolder };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle("generate-compilations", async (_event, data) => {
  const { videoPath, groups, variant } = data;

  if (!videoPath) return { success: false, message: "No raw video selected." };
  if (!groups || groups.length === 0) return { success: false, message: "No compilation groups available." };

  const folderResult = await dialog.showOpenDialog({
    title: "Choose Folder For Compilations",
    properties: ["openDirectory", "createDirectory"],
  });

  if (folderResult.canceled || folderResult.filePaths.length === 0) {
    return { success: false, message: "Output folder selection cancelled." };
  }

  const outputFolder = folderResult.filePaths[0];
  const outputs = [];
  const totalClips = groups.reduce((total, group) => total + group.clips.length, 0);
  let completedClips = 0;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rugby-compilation-"));

  try {
    for (const group of groups) {
      const sortedClips = [...group.clips].sort((a, b) => Number(a.rawStart) - Number(b.rawStart));
      const groupSlug = safeFileName(group.type);
      const variantSlug = safeFileName(variant || "coach");
      const groupTempDir = path.join(tempRoot, groupSlug);
      fs.mkdirSync(groupTempDir, { recursive: true });

      const clipPaths = [];

      for (let i = 0; i < sortedClips.length; i += 1) {
        _event.sender.send("compilation-progress", { group: group.type, clip: i + 1, groupClips: sortedClips.length, completed: completedClips, total: totalClips, percent: totalClips ? (completedClips / totalClips) * 100 : 0 });
        const clip = sortedClips[i];
        const duration = Math.max(1, Number(clip.rawEnd) - Number(clip.rawStart));
        const segmentPath = path.join(groupTempDir, `segment-${String(i + 1).padStart(3, "0")}.mp4`);

        await runFFmpeg([
          "-y",
          "-ss",
          String(clip.rawStart),
          "-i",
          videoPath,
          "-t",
          String(duration),
          "-vf",
          buildTitleFilter(group.type),
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "22",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-ac",
          "2",
          segmentPath,
        ]);

        clipPaths.push(segmentPath);
        completedClips += 1;
        _event.sender.send("compilation-progress", { group: group.type, clip: i + 1, groupClips: sortedClips.length, completed: completedClips, total: totalClips, percent: totalClips ? (completedClips / totalClips) * 100 : 100 });
      }

      const listPath = path.join(groupTempDir, "concat-list.txt");
      fs.writeFileSync(listPath, clipPaths.map(quoteConcatPath).join("\n"));

      const outputPath = path.join(outputFolder, `${groupSlug}-${variantSlug}-compilation.mp4`);

      await runFFmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
      outputs.push(outputPath);
    }

    _event.sender.send("compilation-progress", { completed: totalClips, total: totalClips, percent: 100, done: true });

    return { success: true, outputs };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}
  }
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
