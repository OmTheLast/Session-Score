const {contextBridge, ipcRenderer} = require("electron");

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("sessionScore", {
    available: () => ipcRenderer.invoke("score:available"),
    visualizer: () => ipcRenderer.invoke("score:visualizer"),
    link: () => ipcRenderer.invoke("score:link"),
    read: () => ipcRenderer.invoke("score:read"),
    unlink: () => ipcRenderer.invoke("score:unlink")
  });
}
