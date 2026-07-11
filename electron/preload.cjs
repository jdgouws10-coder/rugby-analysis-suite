const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectVideo: () => ipcRenderer.invoke("select-video"),
  optimiseVideoForPlayback: (data) => ipcRenderer.invoke("optimise-video-for-playback", data),
  generateTestClip: (data) => ipcRenderer.invoke("generate-test-clip", data),
  generateCompilations: (data) => ipcRenderer.invoke("generate-compilations", data),
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("update-progress", listener);
    return () => ipcRenderer.removeListener("update-progress", listener);
  },
});
