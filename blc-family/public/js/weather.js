// Météo de la Guadeloupe (Open-Meteo, sans clé). Mise en cache 20 minutes.
const LAT = 16.27; const LON = -61.59; // Baie-Mahault
let cache = null;
export async function weather() {
  if (cache && Date.now() - cache.at < 20 * 60000) return cache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FGuadeloupe&forecast_days=6`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('météo indisponible');
  const data = await r.json();
  cache = { at: Date.now(), data };
  return data;
}
