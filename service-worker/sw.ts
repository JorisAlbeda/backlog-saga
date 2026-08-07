/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

// Injected at build time by @vite-pwa/nuxt with the actual list of built
// assets — this is what lets the installed app open with zero
// connectivity instead of needing the PC's server to render anything.
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())
