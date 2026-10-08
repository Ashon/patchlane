import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld(
  'patchlaneDesktop',
  ipcRenderer.sendSync('patchlane:desktop-config'),
)
