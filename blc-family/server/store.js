'use strict';
// Stockage JSON minimaliste : une collection = un fichier dans DATA_DIR.
// Adapté à l'échelle d'une famille (quelques milliers d'éléments).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const cache = new Map();
const timers = new Map();

function file(name) { return path.join(DATA_DIR, name + '.json'); }

function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try { value = JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch (_) { /* nouveau fichier */ }
  cache.set(name, value);
  return value;
}

function save(name) {
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => flush(name), 150));
}

function flush(name) {
  timers.delete(name);
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache.get(name), null, 1));
  fs.renameSync(tmp, file(name));
}

function flushAll() { for (const name of [...timers.keys()]) { clearTimeout(timers.get(name)); flush(name); } }

function id(prefix = '') { return prefix + crypto.randomBytes(9).toString('base64url'); }
function token(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }

// Collections sous forme de tableaux
function list(name) { return load(name, []); }
function get(name, itemId) { return list(name).find((x) => x.id === itemId); }
function insert(name, item) { list(name).push(item); save(name); return item; }
function update(name, itemId, patch) {
  const item = get(name, itemId);
  if (!item) return null;
  Object.assign(item, patch);
  save(name);
  return item;
}
function remove(name, itemId) {
  const arr = list(name);
  const i = arr.findIndex((x) => x.id === itemId);
  if (i < 0) return false;
  arr.splice(i, 1);
  save(name);
  return true;
}
// Objets clé/valeur
function obj(name) { return load(name, {}); }

module.exports = { DATA_DIR, UPLOAD_DIR, list, get, insert, update, remove, obj, save, flushAll, id, token };
