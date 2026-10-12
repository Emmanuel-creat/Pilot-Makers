/** Compteurs de limitation de débit, par règle, clé et fenêtre de temps. */
export const sql = /* sql */ `
CREATE UNLOGGED TABLE rate_limits (
  bucket text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);
CREATE INDEX rate_limits_window ON rate_limits (window_start);
`;
