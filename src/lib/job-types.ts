/** Type de chantier déduit de son intitulé, pour regrouper la rentabilité par nature de travaux. */

const TYPES: [string, RegExp][] = [
  ["Salle de bain", /salle (de bains?|d.eau)|douche|sanitaire/],
  ["Cuisine", /cuisine/],
  ["Toiture et charpente", /toit|couverture|charpente|zinguerie|goutti/],
  ["Isolation", /isol|combles|ite\b|iti\b/],
  ["Chauffage et climatisation", /chauff|chaudiere|pompe a chaleur|\bpac\b|clim|poele/],
  ["Électricité", /electri|tableau|eclairage|prise/],
  ["Plomberie", /plomb|canalis|evacuation|chauffe-eau|ballon/],
  ["Menuiseries", /menuiser|fenetre|porte|volet|placard|escalier/],
  ["Peinture et revêtements", /peint|enduit|papier peint|revetement|parquet|sol\b|sols\b|carrel|faience/],
  ["Maçonnerie et gros œuvre", /macon|dalle|mur\b|murs\b|beton|fondation|ouverture|extension|agrandissement/],
  ["Extérieurs", /terrasse|cloture|portail|allee|jardin|piscine|facade|ravalement/],
  ["Rénovation complète", /renovation (complete|totale|globale)|appartement|maison/],
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function jobType(title: string): string {
  const t = norm(title);
  return TYPES.find(([, re]) => re.test(t))?.[0] ?? "Autres travaux";
}
