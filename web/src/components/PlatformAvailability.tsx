import { useEffect, useState } from 'react';
import { getCapabilities } from '../api/client';
import type { CapabilityResponse } from '../api/contract';
import { PLATFORMS, PLATFORM_LABEL } from '../platforms';

/** Public capability hints describe actual enablement; link validation remains independent. */
function PlatformLogo({ platform }: { platform: typeof PLATFORMS[number] }) {
  if (platform === 'x') return <svg className="platform-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3.2l3.8 5.1L16.4 4H19l-5.8 6.7L19.5 20h-3.2l-4.4-5.9L6.8 20H4.2l6.1-7.1z"/></svg>;
  if (platform === 'reddit') return <svg className="platform-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 12.3c0-2.5 2.4-4.5 5.4-4.5s5.4 2 5.4 4.5-2.4 4.6-5.4 4.6-5.4-2.1-5.4-4.6Z"/><path d="m14.9 7.1 1.4-2.3 2 .6M16.3 4.8a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0Z"/><circle cx="9.4" cy="11.7" r=".95" fill="currentColor" stroke="none"/><circle cx="14.6" cy="11.7" r=".95" fill="currentColor" stroke="none"/><path d="M9.2 14.1c1.5 1 4.1 1 5.6 0M5.8 9.4l1.4.5M18.2 9.4l-1.4.5"/></svg>;
  if (platform === 'tiktok') return <svg className="platform-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4v9.1a3.7 3.7 0 1 1-3.1-3.6v2.3a1.5 1.5 0 1 0 .9 1.4V4zM15 4c.6 2.2 1.9 3.5 4 3.8v2.3c-1.6-.1-3-.7-4-1.6"/></svg>;
  return <svg className="platform-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 7.1a2.7 2.7 0 0 0-1.9-1.9C16.7 4.7 12 4.7 12 4.7s-4.7 0-6.4.5A2.7 2.7 0 0 0 3.7 7.1C3.2 8.8 3.2 12 3.2 12s0 3.2.5 4.9a2.7 2.7 0 0 0 1.9 1.9c1.7.5 6.4.5 6.4.5s4.7 0 6.4-.5a2.7 2.7 0 0 0 1.9-1.9c.5-1.7.5-4.9.5-4.9s0-3.2-.5-4.9"/><path d="m10 15.2 5-3.2-5-3.2z" fill="currentColor"/></svg>;
}

export function PlatformAvailability() {
  const [capabilities, setCapabilities] = useState<CapabilityResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getCapabilities(controller.signal).then(value => {
      if (!controller.signal.aborted) setCapabilities(value);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  return <div className="platform-status-group"><ul className="platform-availability" aria-label="Platform availability" aria-live="polite">
    {PLATFORMS.map(platform => {
      const capability = capabilities?.platforms?.find(item => item.platform === platform);
      const live = capability?.liveEnabled === true;
      const status = failed || (capabilities && capability?.liveEnabled === undefined) ? 'Unknown' : !capabilities ? 'Checking' : live ? capability?.demoLimited ? 'Demo' : 'Live' : 'In setup';
      const className = live && !capability?.demoLimited ? 'is-live' : capability?.demoLimited ? 'is-demo' : '';
      return <li key={platform} className={className}><PlatformLogo platform={platform}/><span>{PLATFORM_LABEL[platform]}<small>{status}</small></span></li>;
    })}
  </ul></div>;
}
