'use client';
/**
 * ServiceWorkerUpdater
 *
 * A zero-UI client component that handles automatic PWA updates silently:
 *
 * 1. Polls `registration.update()` every 10 minutes so the browser checks
 *    for a new service worker even when the tab is left open indefinitely.
 *
 * 2. Listens for the `controllerchange` event — fired when a new service
 *    worker (with skipWaiting + clientsClaim) takes over — and silently
 *    reloads the page so the user always sees the latest app shell without
 *    any manual intervention.
 *
 * Mount this once in layout.tsx inside <body> so it runs on every page.
 */
import { useEffect } from 'react';

export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let reloading = false;

    // Silent reload when the new SW (skipWaiting + clientsClaim) takes over
    const handleControllerChange = () => {
      // Guard against double-reload race (can fire more than once)
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Poll for SW updates every 10 minutes.
    // Without this, an open tab would never pick up a new SW until it's closed/reopened.
    const pollUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      } catch {
        // Silently ignore — device is likely offline
      }
    };

    const intervalMs = 10 * 60 * 1000; // 10 minutes
    const interval = setInterval(pollUpdate, intervalMs);

    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // Renders nothing — purely a side-effect component
  return null;
}
