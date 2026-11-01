// Geometry ported directly from Flint/PANE ui/wall.ts.
(() => { const exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wallSvg = wallSvg;
/**
 * The wallpaper: one static SVG whose colours come from CSS custom properties
 * (--wbg1/2, --wa1/2 … per wallpaper and theme), so all ten wallpapers and both
 * themes share the same geometry. Geometry transcribed from the original.
 */
const BUBBLES = [
    [1180, 640, 92],
    [300, 250, 46],
    [1430, 830, 62],
    [930, 330, 28],
    [520, 880, 38],
    [1040, 380, 18],
    [170, 560, 24],
    [1490, 360, 42],
    [905, 705, 14],
    [640, 430, 10],
    [80, 900, 30],
    [1540, 520, 16],
];
const stop = (offset, v) => `<stop offset="${offset}" style="stop-color:var(${v})"/>`;
const linear = (id, a, b, x2 = 1, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stop(0, a)}${stop(1, b)}</linearGradient>`;
function wallSvg(id, cls = "wall__svg") {
    const ref = (k) => `url(#${id}-${k})`;
    const grad = linear;
    return `<svg class="${cls}" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    ${grad(`${id}-bg`, `--wbg1`, `--wbg2`)}
    ${grad(`${id}-a`, `--wa1`, `--wa2`, 0.8, 1)}
    ${grad(`${id}-b`, `--wb1`, `--wb2`, 1, 0.2)}
    ${grad(`${id}-c`, `--wc1`, `--wc2`, 1, 0)}
    ${grad(`${id}-d`, `--wd1`, `--wd2`, 0.2, 1)}
    <radialGradient id="${id}-bub" cx=".38" cy=".32" r=".72"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".68" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity=".42"/></radialGradient>
  </defs>
  <rect width="1600" height="1000" fill="${ref(`bg`)}"/>
  <path d="M0 0H1180C1090 150 900 230 690 270C460 315 230 380 0 520Z" fill="${ref(`a`)}"/>
  <path d="M1600 0V470C1490 520 1330 470 1250 360C1170 250 1210 110 1300 0Z" fill="${ref(`d`)}"/>
  <path d="M0 700C240 560 500 500 800 540C1100 580 1350 470 1600 300V1000H0Z" fill="${ref(`b`)}"/>
  <path d="M0 768C280 648 560 608 840 648C1120 688 1360 598 1600 448V478C1360 628 1120 720 840 684C560 648 280 688 0 808Z" fill="#fff" fill-opacity=".16" style="opacity:var(--wline, 1)"/>
  <path d="M0 860C280 760 600 770 900 840C1180 905 1420 860 1600 760V1000H0Z" fill="${ref(`c`)}"/>
  <g fill="none" stroke="#fff" stroke-linecap="round" style="opacity:var(--wline, 1)">
    <path d="M1180 0C1090 150 900 230 690 270C460 315 230 380 0 520" stroke-opacity=".5" stroke-width="2.5"/>
    <path d="M0 700C240 560 500 500 800 540C1100 580 1350 470 1600 300" stroke-opacity=".62" stroke-width="3"/>
    <path d="M0 860C280 760 600 770 900 840C1180 905 1420 860 1600 760" stroke-opacity=".5" stroke-width="2.5"/>
    <path d="M1600 470C1490 520 1330 470 1250 360C1170 250 1210 110 1300 0" stroke-opacity=".45" stroke-width="2"/>
    <path d="M0 735C260 600 520 552 820 590C1110 628 1360 528 1600 372" stroke-opacity=".22" stroke-width="1.5"/>
  </g>
  <g style="opacity:var(--wbub, 1)">${BUBBLES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ref(`bub`)}" stroke="#fff" stroke-opacity=".55" stroke-width="${r > 30 ? 2 : 1.4}"/><ellipse cx="${x - r * 0.36}" cy="${y - r * 0.42}" rx="${r * 0.3}" ry="${r * 0.13}" transform="rotate(-32 ${x - r * 0.36} ${y - r * 0.42})" fill="#fff" fill-opacity=".75"/>`).join('')}</g>
</svg>`;
}

window.FlintWall = exports.wallSvg; })();
