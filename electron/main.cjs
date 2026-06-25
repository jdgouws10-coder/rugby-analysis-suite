const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const os = require("os");
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
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for updates...");
  });

  autoUpdater.on("update-available", async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `Rugby Analysis Suite v${info.version} is available.`,
      detail: "Do you want to download the update now?",
      buttons: ["Download Update", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.log("No update available.");
  });

  autoUpdater.on("error", (error) => {
    console.error("Auto updater error:", error);
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`Update download: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: "The update has been downloaded.",
      detail: "Restart Rugby Analysis Suite now to install it?",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
}

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

  return {
    path: result.filePaths[0],
    name: path.basename(result.filePaths[0]),
  };
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

ipcMain.handle("generate-compilations", async (_event, data) => {
  const { videoPath, groups } = data;

  if (!videoPath) return { success: false, message: "No raw video selected." };
  if (!groups || groups.length === 0) {
    return { success: false, message: "No compilation groups available." };
  }

  const folderResult = await dialog.showOpenDialog({
    title: "Choose Folder For Compilations",
    properties: ["openDirectory", "createDirectory"],
  });

  if (folderResult.canceled || folderResult.filePaths.length === 0) {
    return { success: false, message: "Output folder selection cancelled." };
  }

  const outputFolder = folderResult.filePaths[0];
  const outputs = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rugby-compilation-"));

  try {
    for (const group of groups) {
      const sortedClips = [...group.clips].sort((a, b) => Number(a.rawStart) - Number(b.rawStart));
      const groupSlug = safeFileName(group.type);
      const groupTempDir = path.join(tempRoot, groupSlug);
      fs.mkdirSync(groupTempDir, { recursive: true });

      const clipPaths = [];

      for (let i = 0; i < sortedClips.length; i += 1) {
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
      }

      const listPath = path.join(groupTempDir, "concat-list.txt");
      fs.writeFileSync(listPath, clipPaths.map(quoteConcatPath).join("\n"));

      const outputPath = path.join(outputFolder, `${groupSlug}-compilation.mp4`);

      await runFFmpeg([
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        outputPath,
      ]);

      outputs.push(outputPath);
    }

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