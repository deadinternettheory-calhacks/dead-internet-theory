import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, HelpCircle } from 'lucide-react';
import { getCapabilities } from '../api/client';
import type { CapabilityResponse } from '../api/contract';
import { PLATFORMS, PLATFORM_LABEL } from '../platforms';

/** Public capability hints describe actual enablement; link validation remains independent. */
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
  return <ul className="platform-availability" aria-label="Platform availability" aria-live="polite">
    {PLATFORMS.map(platform => {
      const capability = capabilities?.platforms?.find(item => item.platform === platform);
      const live = capability?.liveEnabled === true;
      const status = failed || (capabilities && capability?.liveEnabled === undefined) ? 'Unknown' : !capabilities ? 'Checking' : live ? 'Live' : 'In setup';
      const Icon = live ? CheckCircle2 : status === 'Unknown' ? HelpCircle : Circle;
      return <li key={platform} className={live ? 'is-live' : ''}><Icon size={12} aria-hidden="true"/><span>{PLATFORM_LABEL[platform]}<small>{status}</small></span></li>;
    })}
  </ul>;
}
