/**
 * Google Analytics 4, loaded only when a measurement ID is configured.
 *
 * Set VITE_GA_ID in `.env` (or in the Vercel/Netlify dashboard) to switch it on:
 *
 *   VITE_GA_ID=G-XXXXXXXXXX
 *
 * With no ID the tag is never fetched, so local development and any fork stay
 * free of third-party requests.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID = import.meta.env.VITE_GA_ID as string | undefined;

let enabled = false;

export function initAnalytics() {
  if (!MEASUREMENT_ID) return;
  // Respect an explicit Do Not Track signal rather than tracking anyway.
  if (navigator.doNotTrack === '1') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.append(script);

  enabled = true;
}

/** Milestones worth knowing about: did anyone actually boot the machine? */
export function track(event: string, params: Record<string, unknown> = {}) {
  if (!enabled || !window.gtag) return;
  window.gtag('event', event, params);
}
