/** Contrôles de format des identifiants d'entreprise français. */

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export const cleanId = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

export function validateSiren(v: string): string | null {
  const s = cleanId(v);
  if (!s) return null;
  if (!/^\d{9}$/.test(s)) return "Le SIREN doit contenir 9 chiffres";
  if (!luhnValid(s)) return "SIREN invalide (clé de contrôle incorrecte)";
  return null;
}

export function validateSiret(v: string): string | null {
  const s = cleanId(v);
  if (!s) return null;
  if (!/^\d{14}$/.test(s)) return "Le SIRET doit contenir 14 chiffres";
  // La Poste (SIREN 356000000) suit une règle particulière.
  if (s.startsWith("356000000")) {
    const sum = [...s].reduce((a, c) => a + Number(c), 0);
    return sum % 5 === 0 ? null : "SIRET invalide";
  }
  if (!luhnValid(s)) return "SIRET invalide (clé de contrôle incorrecte)";
  return null;
}

export function frVatKey(siren: string): string {
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return String(key).padStart(2, "0");
}

export function validateVatNumber(v: string, siren?: string): string | null {
  const s = cleanId(v);
  if (!s) return null;
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(s)) return "Numéro de TVA intracommunautaire mal formé";
  if (s.startsWith("FR")) {
    if (!/^FR[0-9A-Z]{2}\d{9}$/.test(s)) return "Un numéro de TVA français comporte FR, 2 caractères de clé et 9 chiffres";
    const sirenPart = s.slice(4);
    if (/^\d{2}$/.test(s.slice(2, 4)) && s.slice(2, 4) !== frVatKey(sirenPart)) return "Clé du numéro de TVA incorrecte";
    if (siren && cleanId(siren) && cleanId(siren) !== sirenPart) return "Le numéro de TVA ne correspond pas au SIREN";
  }
  return null;
}

export function validateIban(v: string): string | null {
  const s = cleanId(v);
  if (!s) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return "IBAN mal formé";
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? null : "IBAN invalide (clé de contrôle incorrecte)";
}

export function validateEmail(v: string): string | null {
  if (!v.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Adresse e-mail invalide";
}

export function validatePostalCode(v: string): string | null {
  if (!v.trim()) return null;
  return /^\d{5}$/.test(v.trim()) ? null : "Code postal à 5 chiffres attendu";
}
