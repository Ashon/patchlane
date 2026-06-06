import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('patchlaneDesktop', {
  apiBaseUrl: process.env.PATCHLANE_API_URL || 'http://localhost:8787',
  dataDir: process.env.PATCHLANE_DATA_DIR,
  platform: process.platform,
})
