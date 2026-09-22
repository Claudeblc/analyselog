// Illustrations codées (SVG) : décor tropical au coucher du soleil, paysages de polaroïds, icônes.
// Remplacées automatiquement par les vraies photos de la famille quand elles existent.

const svgUri = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

// Palmier en silhouette
export function palm(x, base, h, lean = 1, color = '#07040a') {
  const tx = x + lean * h * 0.25; const ty = base - h;
  let s = `<path d="M${x} ${base} C ${x + lean * h * 0.05} ${base - h * 0.4}, ${x + lean * h * 0.18} ${base - h * 0.75}, ${tx} ${ty}" stroke="${color}" stroke-width="${h * 0.035}" fill="none" stroke-linecap="round"/>`;
  const fronds = [[-150, 0.55], [-120, 0.62], [-80, 0.6], [-40, 0.58], [-10, 0.5], [20, 0.45], [-175, 0.45]];
  for (const [a, l] of fronds) {
    const r = (a * Math.PI) / 180; const L = h * l;
    const ex = tx + Math.cos(r) * L; const ey = ty + Math.sin(r) * L * 0.55 + L * 0.35;
    const cx = tx + Math.cos(r) * L * 0.5; const cy = ty + Math.sin(r) * L * 0.7 - L * 0.12;
    s += `<path d="M${tx} ${ty} Q ${cx} ${cy} ${ex} ${ey} Q ${cx + 6} ${cy + 14} ${tx} ${ty + 4}" fill="${color}"/>`;
  }
  return s;
}

// Scène complète (fond de l'application)
export function sceneSvg(w = 1920, h = 1080) {
  const hz = h * 0.56;
  let bokeh = '';
  const pts = [[0.08, 0.83, 38], [0.18, 0.9, 22], [0.33, 0.8, 16], [0.62, 0.86, 26], [0.76, 0.8, 18], [0.9, 0.9, 34], [0.97, 0.78, 14], [0.45, 0.94, 20], [0.55, 0.78, 10], [0.26, 0.74, 12]];
  for (const [px, py, r] of pts) bokeh += `<circle cx="${px * w}" cy="${py * h}" r="${r * 2.2}" fill="url(#bk)" opacity=".75"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1030"/><stop offset=".35" stop-color="#4a1f3c"/><stop offset=".62" stop-color="#c2542d"/><stop offset=".75" stop-color="#f09a3e"/><stop offset="1" stop-color="#f7c26b"/></linearGradient>
<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c4"/><stop offset=".25" stop-color="#ffc463" stop-opacity=".95"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b2d3a"/><stop offset=".4" stop-color="#2b1328"/><stop offset="1" stop-color="#0c0710"/></linearGradient>
<radialGradient id="bk" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd18a" stop-opacity=".9"/><stop offset=".45" stop-color="#ffb35c" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>
<linearGradient id="deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b0f12" stop-opacity=".4"/><stop offset="1" stop-color="#07040a"/></linearGradient>
</defs>
<rect width="${w}" height="${hz}" fill="url(#sky)"/>
<circle cx="${w * 0.6}" cy="${hz - 10}" r="${h * 0.22}" fill="url(#sun)"/>
<rect y="${hz}" width="${w}" height="${h - hz}" fill="url(#sea)"/>
${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${w * 0.6 - 90 + i * 11}" y="${hz + 8 + i * 16}" width="${180 - i * 22}" height="3" rx="2" fill="#ffc97a" opacity="${0.6 - i * 0.08}"/>`).join('')}
<path d="M0 ${hz} Q ${w * 0.12} ${hz - 60} ${w * 0.26} ${hz - 8} L ${w * 0.26} ${hz} Z" fill="#2a1226" opacity=".9"/>
<path d="M${w * 0.8} ${hz} Q ${w * 0.9} ${hz - 90} ${w} ${hz - 30} L ${w} ${hz} Z" fill="#2a1226" opacity=".9"/>
${palm(w * 0.04, h * 0.98, h * 0.95, 1)}${palm(w * 0.12, h, h * 0.7, 1.3)}${palm(w * 0.96, h * 0.98, h * 0.9, -1)}${palm(w * 0.87, h, h * 0.62, -1.4)}${palm(w * 0.3, hz + 6, h * 0.22, 0.6, '#1a0b17')}${palm(w * 0.74, hz + 4, h * 0.18, -0.6, '#1a0b17')}
<rect y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="url(#deck)"/>
${bokeh}
</svg>`;
}
export const sceneUri = () => svgUri(sceneSvg());

// Paysages pour polaroïds (en attendant les photos de famille)
const LAND = {
  plage: (w, h) => `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1e4f"/><stop offset=".55" stop-color="#f08a3c"/><stop offset=".7" stop-color="#ffd07a"/></linearGradient>
<rect width="${w}" height="${h * 0.62}" fill="url(#s)"/><circle cx="${w * 0.55}" cy="${h * 0.6}" r="${h * 0.12}" fill="#fff0bd"/>
<rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="#3a1a2e"/>${[0, 1, 2, 3].map((i) => `<rect x="${w * 0.45 + i * 6}" y="${h * 0.64 + i * 9}" width="${w * 0.2 - i * 12}" height="2.5" fill="#ffd28a" opacity=".7"/>`).join('')}
<path d="M0 ${h * 0.86} Q ${w * 0.5} ${h * 0.78} ${w} ${h * 0.88} L ${w} ${h} L 0 ${h} Z" fill="#1b0d17"/>${palm(w * 0.12, h, h * 0.75, 1, '#12080f')}`,
  ile: (w, h) => `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4aa3e0"/><stop offset="1" stop-color="#bfe6ff"/></linearGradient>
<rect width="${w}" height="${h}" fill="url(#s)"/><path d="M${w * 0.18} ${h * 0.62} L ${w * 0.38} ${h * 0.2} L ${w * 0.5} ${h * 0.62} Z" fill="#2f6b3a"/><path d="M${w * 0.42} ${h * 0.62} L ${w * 0.6} ${h * 0.3} L ${w * 0.78} ${h * 0.62} Z" fill="#3d7d45"/>
<rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="#1fa3b8"/><path d="M0 ${h * 0.85} Q ${w * 0.4} ${h * 0.74} ${w} ${h * 0.82} L ${w} ${h} L 0 ${h} Z" fill="#f2dcae"/>${palm(w * 0.86, h * 0.95, h * 0.6, -1, '#2b5a2e')}`,
  soir: (w, h, n = 4) => `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241238"/><stop offset=".6" stop-color="#d0603a"/><stop offset="1" stop-color="#f7b35c"/></linearGradient>
<rect width="${w}" height="${h}" fill="url(#s)"/><rect y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="#2a1424"/>
${Array.from({ length: n }, (_, i) => person(w * (0.5 - (n - 1) * 0.07 + i * 0.14), h * 0.86, h * (i % 3 === 2 ? 0.26 : 0.36))).join('')}${palm(w * 0.9, h, h * 0.8, -1, '#12080f')}`,
};
function person(x, y, s, color = '#12080f') {
  return `<circle cx="${x}" cy="${y - s * 0.82}" r="${s * 0.14}" fill="${color}"/><path d="M${x - s * 0.2} ${y} Q ${x - s * 0.22} ${y - s * 0.62} ${x} ${y - s * 0.66} Q ${x + s * 0.22} ${y - s * 0.62} ${x + s * 0.2} ${y} Z" fill="${color}"/>`;
}
export function landscape(kind = 'plage', w = 400, h = 300) {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs></defs>${(LAND[kind] || LAND.plage)(w, h)}</svg>`);
}
export const LAND_KINDS = Object.keys(LAND);

// Coucher de soleil + silhouettes de la famille (carte « Notre Famille »)
export const familySunset = (n = 4) => svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">${LAND.soir(400, 300, n)}</svg>`);

// Icônes au trait (style de la maquette)
const I = (d, extra = '') => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICONS = {
  apero: I('<path d="M15 6h18l-2 14a7 7 0 0 1-14 0z"/><path d="M16.2 13h15.6" /><path d="M24 27v13M17 42h14"/>'),
  tv: I('<rect x="5" y="12" width="38" height="26" rx="4"/><path d="M18 6l6 6 6-6"/><path d="M21 20v10l8-5z" fill="currentColor"/>'),
  music: I('<path d="M18 36V10l20-4v26"/><circle cx="13" cy="36" r="5"/><circle cx="33" cy="32" r="5"/>'),
  camera: I('<path d="M6 16h8l3-5h14l3 5h8v24H6z"/><circle cx="24" cy="27" r="7"/>'),
  video: I('<rect x="5" y="12" width="26" height="24" rx="4" fill="currentColor"/><path d="M31 20l12-7v22l-12-7z" fill="currentColor"/>'),
  family: I('<circle cx="24" cy="13" r="5" fill="currentColor"/><circle cx="12" cy="17" r="4" fill="currentColor"/><circle cx="36" cy="17" r="4" fill="currentColor"/><path d="M14 38c0-7 4-12 10-12s10 5 10 12z" fill="currentColor"/><path d="M4 36c0-6 3-10 8-10 2 0 4 1 5 2M44 36c0-6-3-10-8-10-2 0-4 1-5 2"/>'),
  gear: I('<circle cx="24" cy="24" r="6"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/><circle cx="24" cy="24" r="13"/>'),
  calendar: I('<rect x="7" y="10" width="34" height="31" rx="4"/><path d="M7 19h34M16 6v8M32 6v8"/><path d="M14 26h3M22 26h3M30 26h3M14 33h3M22 33h3"/>'),
  weather: I('<circle cx="18" cy="17" r="6"/><path d="M18 4v3M8 8l2 2M5 17h3M28 8l-2 2"/><path d="M14 38h22a7 7 0 0 0 0-14 10 10 0 0 0-19 3 6 6 0 0 0-3 11z"/>'),
  intercom: I('<rect x="13" y="5" width="22" height="38" rx="5"/><circle cx="24" cy="20" r="5"/><path d="M20 33h8"/>'),
  help: I('<circle cx="24" cy="24" r="18"/><path d="M19 19a5 5 0 1 1 7 4.5c-1.5.8-2 1.8-2 3.5"/><circle cx="24" cy="33" r="1" fill="currentColor"/>'),
  chat: I('<path d="M8 10h32v22H20l-9 7v-7H8z"/><path d="M16 19h16M16 25h10"/>'),
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 9-2.3A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  hang: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0V15l-3 1.5z"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3z"/></svg>',
};

// Code météo Open-Meteo → pictogramme
export function weatherIcon(code) {
  if (code === 0) return '☀️'; if (code <= 2) return '🌤️'; if (code === 3) return '☁️';
  if (code <= 48) return '🌫️'; if (code <= 67) return '🌧️'; if (code <= 77) return '🌨️'; if (code <= 82) return '🌦️'; return '⛈️';
}
