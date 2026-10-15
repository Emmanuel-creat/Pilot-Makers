/** Fichiers rangés en base quand aucun stockage objet n'est configuré (STORAGE_DRIVER absent). */
export const sql = /* sql */ `
CREATE TABLE stored_files (
  key text PRIMARY KEY,
  content_type text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
DROP TABLE stored_files;
`;
