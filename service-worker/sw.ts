/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// `SyncEvent` isn't part of the default `webworker` lib types (Background
// Sync isn't universally standardized), so declare the minimal shape used
// below.
declare interface SyncEvent extends ExtendableEvent {
  tag: string
}

// Injected at build time by @vite-pwa/nuxt with the actual list of built
// assets — this is what lets the installed app open with zero
// connectivity instead of needing the PC's server to render anything.
precacheAndRoute(self.__WB_MANIFEST)

// Precaching alone only satisfies requests for exact precached URLs (the
// built JS/CSS/the prerendered document itself). It does NOT make an
// arbitrary navigation request (e.g. a reload while offline, or any route
// other than `/`) resolve to the cached shell — for that, browser
// navigations need to be explicitly routed to the precached document.
//
// The bound URL below MUST match the manifest entry's `url` field exactly,
// or createHandlerBoundToURL throws `non-precached-url` at SW script
// evaluation time (killing the worker outright). Nitro's `prerender: true`
// writes the file to `.output/public/index.html`, but the injectManifest
// glob records it under the route path `/`, not `/index.html` — verified
// against this project's built .output/public/sw.js manifest.
//
// Denylist `/api/*` so offline navigation fallback doesn't swallow data
// requests that should genuinely fail/queue instead of returning HTML.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/'), {
    denylist: [/^\/api\//]
  })
)

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

// Kept in sync manually with the identical constant in
// app/composables/useTodos.ts — the app bundle and the service worker are
// built separately and can't share a runtime import across that boundary,
// so if you change this, change it there too.
const SYNC_TAG = 'offline-queue-drain'

self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent
  if (syncEvent.tag !== SYNC_TAG) return
  syncEvent.waitUntil(
    self.clients.matchAll().then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'background-sync-drain' })
      }
    })
  )
})
