import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ruta = fileURLToPath(new URL('../../data/comercios-santa-rosa.json', import.meta.url));
const data = JSON.parse(readFileSync(ruta, 'utf8'));

export const comercios = data.comercios.map((c, i) => Object.assign({ id: 'c' + i }, c));
export const palabrasClave = data.palabrasClave;
export const participantes = [
  { id: 'ana', nombre: 'Ana' },
  { id: 'juan', nombre: 'Juan' },
  { id: 'pedro', nombre: 'Pedro Gómez' },
];
export const ctx = {
  participantes, comercios, palabrasClave, usuarioActualId: 'ana',
  ahora: new Date(2026, 10, 6, 10, 30),
};
