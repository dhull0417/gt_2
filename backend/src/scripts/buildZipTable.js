// Builds src/data/zipCentroids.json from the Census Bureau's ZCTA Gazetteer file
// (public domain), used for ride auto-assign distances.
//
// 1. Download and unzip the national ZCTA file, e.g.
//    https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip
// 2. node src/scripts/buildZipTable.js <path/to/2024_Gaz_zcta_national.txt> [output.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [input, outArg] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node src/scripts/buildZipTable.js <Gaz_zcta_national.txt> [output.json]');
  process.exit(1);
}
const output = outArg || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'zipCentroids.json');

const lines = readFileSync(input, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const header = lines[0].split('\t').map((h) => h.trim());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column ${name} not found in ${input}`);
  return i;
};
const [iZip, iLat, iLng] = [col('GEOID'), col('INTPTLAT'), col('INTPTLONG')];
const round = (n) => Math.round(n * 1e4) / 1e4;

const table = {};
for (const line of lines.slice(1)) {
  const cells = line.split('\t').map((c) => c.trim());
  const zip = cells[iZip];
  const lat = Number(cells[iLat]);
  const lng = Number(cells[iLng]);
  if (/^\d{5}$/.test(zip) && Number.isFinite(lat) && Number.isFinite(lng)) table[zip] = [round(lat), round(lng)];
}
writeFileSync(output, JSON.stringify(table));
console.log(`Wrote ${Object.keys(table).length} zips to ${output}`);
