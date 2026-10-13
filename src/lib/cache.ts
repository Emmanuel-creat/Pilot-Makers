/**
 * Cache en mémoire pour les résultats coûteux et immuables : PDF traduits, exemplaires acceptés et documents
 * réunis d'une version émise, qui ne changent plus une fois la version figée.
 *
 * Les plus anciens résultats sont retirés quand le nombre d'entrées ou le poids total dépasse la limite.
 * Chaque instance du serveur a son propre cache : il accélère, il ne remplace jamais la base.
 */

export class MemoryCache<V> {
  private entries = new Map<string, { value: V; size: number; expires: number }>();
  private bytes = 0;
  hits = 0;
  misses = 0;

  constructor(
    private readonly opts: { maxEntries: number; maxBytes: number; ttlMs: number; sizeOf: (v: V) => number },
    private readonly clock: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e || e.expires <= this.clock()) {
      if (e) this.delete(key);
      this.misses++;
      return undefined;
    }
    // Remis en fin de liste : l'ordre d'insertion de la Map sert d'ordre d'utilisation.
    this.entries.delete(key);
    this.entries.set(key, e);
    this.hits++;
    return e.value;
  }

  set(key: string, value: V) {
    const size = this.opts.sizeOf(value);
    if (size > this.opts.maxBytes) return;
    this.delete(key);
    this.entries.set(key, { value, size, expires: this.clock() + this.opts.ttlMs });
    this.bytes += size;
    while (this.entries.size > this.opts.maxEntries || this.bytes > this.opts.maxBytes) {
      const oldest = this.entries.keys().next().value as string;
      this.delete(oldest);
    }
  }

  delete(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.bytes -= e.size;
    this.entries.delete(key);
  }

  get size() {
    return { entries: this.entries.size, bytes: this.bytes };
  }

  /** Renvoie le résultat en cache, ou le calcule une fois et le garde. */
  async remember(key: string, compute: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    this.set(key, value);
    return value;
  }
}

/** PDF dérivés des versions émises : 64 Mo et 200 fichiers au plus, gardés une heure. */
export const pdfCache = new MemoryCache<Uint8Array>({ maxEntries: 200, maxBytes: 64_000_000, ttlMs: 3600_000, sizeOf: (b) => b.byteLength });

/**
 * Réponse 304 quand le navigateur a déjà le fichier : l'empreinte d'un PDF figé ne change jamais.
 * `null` quand il faut envoyer le fichier.
 */
export function notModified(req: Request, etag: string, headers: Record<string, string>): Response | null {
  const given = req.headers.get("if-none-match");
  if (!given) return null;
  const tags = given.split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (!tags.includes(etag) && !tags.includes("*")) return null;
  return new Response(null, { status: 304, headers: { ...headers, etag } });
}
