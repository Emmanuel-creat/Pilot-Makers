/** Raccourcis clavier de l'éditeur de devis. Source unique pour l'aide et la fenêtre « Raccourcis ». */
export const EDITOR_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "Z"], label: "Annuler la dernière modification" },
  { keys: ["Ctrl", "Maj", "Z"], label: "Rétablir la modification annulée (aussi Ctrl+Y)" },
  { keys: ["Ctrl", "S"], label: "Enregistrer le brouillon tout de suite" },
  { keys: ["Ctrl", "K"], label: "Ouvrir le catalogue sur la dernière section" },
  { keys: ["Ctrl", "Maj", "?"], label: "Afficher la liste des raccourcis" },
];

export const shortcutText = (keys: string[]) => keys.join("+");
