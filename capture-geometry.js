'use strict';

// Electron bounds are DIPs; capture thumbnails are pixels, independently scaled
// on each monitor. Return the intersection without ever cropping outside a bitmap.
function capturePart(windowBounds, displayBounds, bitmapSize) {
  const left = Math.max(windowBounds.x, displayBounds.x);
  const top = Math.max(windowBounds.y, displayBounds.y);
  const right = Math.min(windowBounds.x + windowBounds.width, displayBounds.x + displayBounds.width);
  const bottom = Math.min(windowBounds.y + windowBounds.height, displayBounds.y + displayBounds.height);
  if (right <= left || bottom <= top) return null;
  const kx = bitmapSize.width / displayBounds.width;
  const ky = bitmapSize.height / displayBounds.height;
  const x = Math.max(0, Math.floor((left - displayBounds.x) * kx));
  const y = Math.max(0, Math.floor((top - displayBounds.y) * ky));
  const endX = Math.min(bitmapSize.width, Math.ceil((right - displayBounds.x) * kx));
  const endY = Math.min(bitmapSize.height, Math.ceil((bottom - displayBounds.y) * ky));
  return {
    crop: { x, y, width: endX - x, height: endY - y },
    // Use the rounded pixel edges to preserve alignment at fractional DPI.
    x: displayBounds.x + x / kx - windowBounds.x,
    y: displayBounds.y + y / ky - windowBounds.y,
    width: (endX - x) / kx, height: (endY - y) / ky,
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { capturePart };
else window.FlintCaptureGeometry = { capturePart };
