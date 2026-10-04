// Set to your deployed relay URL to enable contributions on GitHub Pages.
// Example: https://lyrics-publish.<your-account>.workers.dev/api/lrclib
export const PUBLISH_RELAY_URL='https://lyrics-publish.hunkyard-dog.workers.dev/api/lrclib';
export function relayUrl() {
  if(PUBLISH_RELAY_URL)return PUBLISH_RELAY_URL.replace(/\/$/,'');
  if(typeof location!=='undefined' && ['127.0.0.1','localhost'].includes(location.hostname))return `${location.origin}/api/lrclib`;
  return '';
}
