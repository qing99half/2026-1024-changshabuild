export async function requestLandscape(screenObject, documentObject, fullscreen = false) {
  if (typeof screenObject?.orientation?.lock !== 'function') return 'unsupported';

  let enteredFullscreen = false;
  if (fullscreen && !documentObject.fullscreenElement && documentObject.documentElement?.requestFullscreen) {
    try {
      await documentObject.documentElement.requestFullscreen();
      enteredFullscreen = true;
    } catch { /* Some mobile browsers allow orientation lock without fullscreen. */ }
  }

  try {
    await screenObject.orientation.lock('landscape');
    return 'locked';
  } catch {
    if (enteredFullscreen) {
      try { await documentObject.exitFullscreen(); } catch { /* The browser may have exited already. */ }
    }
    return 'blocked';
  }
}
