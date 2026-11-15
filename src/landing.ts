/**
 * 2D landing overlay: explains the experience, offers "Enter VR", and fails
 * gracefully on browsers without WebXR.
 */
import type { World } from '@iwsdk/core';

export function setupLanding(world: World, onUserGesture: () => void) {
  const overlay = document.getElementById('landing');
  const button = document.getElementById('enter-vr') as HTMLButtonElement | null;
  const status = document.getElementById('xr-status');
  if (!overlay || !button || !status) return;

  const setStatus = (text: string) => (status.textContent = text);

  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) {
    button.disabled = true;
    setStatus('This browser has no WebXR. Open this page in the Meta Quest Browser to play.');
  } else {
    xr.isSessionSupported('immersive-vr')
      .then((ok) => {
        if (!ok) {
          button.disabled = true;
          setStatus('Immersive VR is not available here. Open this page in the Meta Quest Browser to play.');
        } else {
          setStatus('Hands only — put your controllers down. Best played seated.');
        }
      })
      .catch(() => setStatus('Could not check VR support. Try the Meta Quest Browser.'));
  }

  button.addEventListener('click', () => {
    onUserGesture();
    try {
      world.launchXR();
    } catch (err) {
      setStatus(`Could not start VR: ${(err as Error).message}`);
    }
  });

  // Hide the overlay while immersive, bring it back when the session ends.
  const tick = () => {
    overlay.classList.toggle('hidden', !!world.xrSession);
    requestAnimationFrame(tick);
  };
  tick();
}
