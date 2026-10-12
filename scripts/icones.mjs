/**
 * Génère les icônes PNG de l'application installable depuis le dessin vectoriel.
 * Usage : node scripts/icones.mjs (sharp est fourni avec Next.js).
 */
import sharp from "sharp";

const mark =
  '<path d="M9 23V9h4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
  '<path d="M9 23h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>' +
  '<path d="M15 13.5h8M15 18h5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>';
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="7" fill="#1f4e79"/>${mark}</svg>`;
// Icône « masquable » : fond plein, dessin réduit dans la zone sûre de 80 %.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1f4e79"/><g transform="translate(16 16) scale(.72) translate(-16 -16)">${mark}</g></svg>`;

const out = [
  ["public/icons/icon-192.png", rounded, 192],
  ["public/icons/icon-512.png", rounded, 512],
  ["public/icons/maskable-512.png", maskable, 512],
  ["public/icons/apple-touch-icon.png", maskable, 180],
];
for (const [file, svg, size] of out) {
  await sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png().toFile(file);
  console.log(file);
}
