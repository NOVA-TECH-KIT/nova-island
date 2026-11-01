// Live desktop media uses Chromium's screen-capture backend. Thumbnail snapshots
// can include a protected transparent window on Windows and recursively feed it
// back into its own glass. Never feed those thumbnails into the material.
(() => {
  function create(bridge, canvas, onFrame) {
    const ctx = canvas.getContext('2d');
    const video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true;
    let geometry = null, sourceId = null, stream = null, starting = false;
    let generation = 0, visible = true, frameHandle = null, disposed = false;
    let diagnosticAt = 0;
    function stop() {
      generation++;
      if (frameHandle !== null) video.cancelVideoFrameCallback(frameHandle);
      frameHandle = null;
      stream?.getTracks().forEach(track => track.stop());
      stream = null; sourceId = null; video.srcObject = null;
    }
    function draw() {
      frameHandle = null;
      if (disposed || !visible || !stream || !geometry) return;
      const part = window.FlintCaptureGeometry.capturePart(geometry.bounds, geometry.display.bounds,
        { width: video.videoWidth, height: video.videoHeight });
      if (part && video.readyState >= 2) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sx = canvas.width / geometry.bounds.width, sy = canvas.height / geometry.bounds.height;
        ctx.drawImage(video, part.crop.x, part.crop.y, part.crop.width, part.crop.height,
          part.x * sx, part.y * sy, part.width * sx, part.height * sy);
        onFrame();
        if (geometry.diagnostics && bridge.backdropDiagnostic && performance.now() > diagnosticAt) {
          diagnosticAt = performance.now() + 3000;
          bridge.backdropDiagnostic(canvas.toDataURL());
        }
      }
      frameHandle = video.requestVideoFrameCallback(draw);
    }
    async function start() {
      if (starting || disposed || !visible || !geometry) return;
      starting = true;
      const token = generation;
      try {
        const source = await bridge.backdropSource();
        if (token !== generation || !source) return;
        if (source.displayId !== geometry.display.id) { generation++; return; }
        const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
          chromeMediaSource: 'desktop', chromeMediaSourceId: source.id,
          maxWidth: Math.round(source.bounds.width * source.scaleFactor),
          maxHeight: Math.round(source.bounds.height * source.scaleFactor),
          maxFrameRate: 15,
        } } });
        if (token !== generation || disposed || !visible) { next.getTracks().forEach(t => t.stop()); return; }
        stream = next; sourceId = source.displayId; video.srcObject = stream;
        next.getVideoTracks()[0].onended = () => { if (stream === next) { stop(); if (visible) start(); } };
        await video.play();
        frameHandle = video.requestVideoFrameCallback(draw);
      } catch (err) { console.error('[backdrop-stream]', err.message); }
      finally { starting = false; if (token !== generation && visible && !disposed && !stream) start(); }
    }
    bridge.onBackdropGeometry(next => {
      const changed = geometry && geometry.display.id !== next.display.id;
      geometry = next;
      if (changed) stop();
      if (!stream) start();
    });
    bridge.onVisibility(on => {
      visible = !!on;
      if (!visible) stop(); else if (geometry && !stream) start();
    });
    window.addEventListener('pagehide', () => { disposed = true; stop(); }, { once: true });
  }
  window.DesktopBackdrop = { create };
})();
