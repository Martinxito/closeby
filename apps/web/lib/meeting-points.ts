// Suggested safe meeting points per commune (Santiago): busy, well-lit public places
// with people around. Safe to import from server and client code.
// The buyer can also type their own place; only its SHA-256 goes on-chain.

export const MEETING_POINTS: Record<string, string[]> = {
  Santiago: ['Metro Universidad de Chile (salida Alameda)', 'Metro Plaza de Armas', 'Mall Paseo Estación Central'],
  Providencia: ['Metro Los Leones (salida Costanera Center)', 'Metro Pedro de Valdivia', 'Mall Costanera Center, entrada principal'],
  'Las Condes': ['Metro Escuela Militar', 'Mall Parque Arauco, entrada principal', 'Metro Tobalaba'],
  Ñuñoa: ['Metro Irarrázaval', 'Plaza Ñuñoa', 'Metro Chile España'],
  Vitacura: ['Mall Alto Las Condes, entrada principal', 'Metro Manquehue'],
  'La Florida': ['Mall Plaza Vespucio, entrada principal', 'Metro Bellavista de La Florida'],
  Maipú: ['Mall Arauco Maipú, entrada principal', 'Metro Plaza de Maipú'],
  'San Miguel': ['Metro El Llano', 'Mall Plaza Sur', 'Metro Lo Vial'],
  Macul: ['Metro Macul', 'Metro Las Torres'],
  'Puente Alto': ['Metro Plaza de Puente Alto', 'Mall Plaza Tobalaba'],
  Independencia: ['Metro Hospitales', 'Mall Barrio Independencia'],
  Recoleta: ['Metro Patronato', 'Metro Cerro Blanco'],
};

export const COMMUNES = Object.keys(MEETING_POINTS);

/** Google Maps search link for a place in Santiago (opens the app on phones). */
export function mapsUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, Santiago, Chile`)}`;
}
