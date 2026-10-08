export {}

declare global {
  interface Window {
    patchlaneDesktop?: {
      apiBaseUrl?: string
      localApi?: boolean
      dataDir?: string
      platform?: string
    }
  }
}
