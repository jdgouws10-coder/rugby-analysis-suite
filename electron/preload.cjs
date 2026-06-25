const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectVideo: () => ipcRenderer.invoke("select-video"),
  generateTestClip: (data) => ipcRenderer.invoke("generate-test-clip", data),
  generateCompilations: (data) => ipcRenderer.invoke("generate-compilations", data),
});
