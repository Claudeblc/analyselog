// Service worker minimal : rend l'application installable (PWA), sans cache hors ligne des données privées.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
