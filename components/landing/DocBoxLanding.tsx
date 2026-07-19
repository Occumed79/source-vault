'use client';

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

const LIGHTS = [
  [8, 14, 4, 0, 9], [12, 73, 6, -4, 12], [19, 35, 3, -7, 11], [24, 89, 5, -2, 14],
  [31, 8, 7, -9, 15], [36, 62, 4, -5, 10], [43, 46, 6, -1, 13], [48, 95, 3, -8, 12],
  [55, 20, 5, -3, 16], [61, 79, 7, -10, 14], [68, 39, 3, -6, 11], [73, 91, 5, -2, 15],
  [80, 11, 6, -7, 13], [84, 58, 4, -4, 12], [91, 31, 5, -9, 14], [94, 85, 3, -1, 10],
] as const;

export default function DocBoxLanding() {
  const router = useRouter();
  const [artLoaded, setArtLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(true);
  const lights = useMemo(() => LIGHTS, []);

  useEffect(() => {
    router.prefetch('/vault');
  }, [router]);

  const enterVault = () => router.push('/vault');

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      enterVault();
    }
  };

  return (
    <main
      className="docbox-landing"
      role="button"
      tabIndex={0}
      aria-label="Enter Occu-Med DocBox"
      onClick={enterVault}
      onKeyDown={handleKeyDown}
    >
      <img
        className={artLoaded ? 'docbox-landing-art loaded' : 'docbox-landing-art'}
        src="/docbox-landing.png"
        alt=""
        aria-hidden="true"
        onLoad={() => setArtLoaded(true)}
        onError={() => setArtLoaded(false)}
      />

      <div className="docbox-landing-fallback" aria-hidden={artLoaded}>
        {logoLoaded && (
          <img
            className="docbox-landing-logo"
            src="/occu-med-logo.png"
            alt=""
            onError={() => setLogoLoaded(false)}
          />
        )}
        {!logoLoaded && <span className="docbox-landing-wordmark">OCCU-MED</span>}
        <strong>DocBox</strong>
      </div>

      <div className="landing-circuit-glow circuit-glow-one" aria-hidden="true" />
      <div className="landing-circuit-glow circuit-glow-two" aria-hidden="true" />
      <div className="landing-light-sweep landing-light-sweep-one" aria-hidden="true" />
      <div className="landing-light-sweep landing-light-sweep-two" aria-hidden="true" />
      <div className="landing-particle-field" aria-hidden="true">
        {lights.map(([top, left, size, delay, duration], index) => (
          <span
            key={index}
            className="landing-particle"
            style={{
              '--landing-top': `${top}%`,
              '--landing-left': `${left}%`,
              '--landing-size': `${size}px`,
              '--landing-delay': `${delay}s`,
              '--landing-duration': `${duration}s`,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className="landing-enter-hint" aria-hidden="true">
        <span>Click anywhere to enter</span>
        <i />
      </div>
    </main>
  );
}
