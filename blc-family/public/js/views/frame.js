// Mode cadre familial : la TV au repos affiche photos, vidéos, Apéro Time, anniversaires, messages.
import { api, h } from '../core.js';
import { slideshow } from './slides.js';

let current = null;
export async function openFrame() {
  if (current) return;
  let items = [];
  try { items = await api('/api/frame'); } catch (_) { return; }
  if (!items.length) items = [{ type: 'title', title: 'BLC Family', sub: 'La maison numérique de la famille Belcram' }];
  current = slideshow(items, { title: 'clock', ms: 9000, onClose: () => { current = null; } });
  const wake = () => { removeEventListener('pointerdown', wake); current?.close(); };
  setTimeout(() => addEventListener('pointerdown', wake), 500);
}
export const frameOpen = () => !!current;
export default async function frameView(root) { root.append(h('p.muted', 'Cadre familial')); openFrame(); }
