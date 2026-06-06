export {}

declare global {
  interface Window {
    patchlaneDesktop?: {
      apiBaseUrl?: string
      dataDir?: string
      platform?: string
    }
  }
}
