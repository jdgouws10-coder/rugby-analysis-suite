const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectVideo: () => ipcRenderer.invoke("select-video"),
  cloudStorageStatus: () => ipcRenderer.invoke("cloud-storage-status"),
  configureCloudStorage: (data) => ipcRenderer.invoke("configure-cloud-storage", data),
  uploadVideoToCloud: (data) => ipcRenderer.invoke("upload-video-to-cloud", data),
  onCloudUploadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("cloud-upload-progress", listener);
    return () => ipcRenderer.removeListener("cloud-upload-progress", listener);
  },
  optimiseVideoForPlayback: (data) => ipcRenderer.invoke("optimise-video-for-playback", data),
  generateTestClip: (data) => ipcRenderer.invoke("generate-test-clip", data),
  generateCompilations: (data) => ipcRenderer.invoke("generate-compilations", data),
  buildTrainingDataset: (data) => ipcRenderer.invoke("build-training-dataset", data),
  listTrainingDatasets: () => ipcRenderer.invoke("list-training-datasets"),
  updateTrainingExample: (data) => ipcRenderer.invoke("update-training-example", data),
  runAIScan: (data) => ipcRenderer.invoke("run-ai-scan", data),
  retrainAIModel: () => ipcRenderer.invoke("retrain-ai-model"),
  exportCoachPackage: (data) => ipcRenderer.invoke("export-coach-package", data),
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("update-progress", listener);
    return () => ipcRenderer.removeListener("update-progress", listener);
  },
  onCompilationProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("compilation-progress", listener);
    return () => ipcRenderer.removeListener("compilation-progress", listener);
  },
  onTrainingProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("training-progress", listener);
    return () => ipcRenderer.removeListener("training-progress", listener);
  },
  onAIScanProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("ai-scan-progress", listener);
    return () => ipcRenderer.removeListener("ai-scan-progress", listener);
  },
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
});
