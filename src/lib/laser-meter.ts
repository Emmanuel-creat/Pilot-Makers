/**
 * Télémètres laser Bluetooth : profils des appareils reconnus et lecture des mesures reçues.
 * La mesure arrive en mètres ; elle est reportée dans la cote sélectionnée du métré.
 */

export interface LaserProfile {
  id: "disto" | "bosch";
  label: string;
  service: string;
  characteristic: string;
  /** Commande à écrire après connexion pour recevoir les mesures, si l'appareil l'exige */
  enable?: number[];
  read(view: DataView): number | null;
}

const plausible = (m: number) => (Number.isFinite(m) && m > 0 && m < 300 ? Math.round(m * 1000) / 1000 : null);

export const LASER_PROFILES: LaserProfile[] = [
  {
    id: "disto",
    label: "Leica DISTO",
    service: "3ab10100-f831-4395-b29d-570977d5bf94",
    characteristic: "3ab10101-f831-4395-b29d-570977d5bf94",
    // Distance en mètres, nombre à virgule sur 4 octets, poids faible d'abord.
    read: (v) => (v.byteLength >= 4 ? plausible(v.getFloat32(0, true)) : null),
  },
  {
    id: "bosch",
    label: "Bosch GLM",
    service: "02a6c0d0-0451-4000-b000-fb3210111989",
    characteristic: "02a6c0d1-0451-4000-b000-fb3210111989",
    enable: [0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a],
    // Trame C0 55 10 ... : distance en mètres sur 4 octets à partir du 8e octet.
    read: (v) => (v.byteLength >= 11 && v.getUint8(0) === 0xc0 && v.getUint8(1) === 0x55 && v.getUint8(2) === 0x10 ? plausible(v.getFloat32(7, true)) : null),
  },
];

export const profileForService = (uuid: string) => LASER_PROFILES.find((p) => p.service === uuid.toLowerCase()) ?? null;

/** Mètres vers la saisie d'une cote : deux décimales, virgule française. */
export const formatMeters = (m: number) => (Math.round(m * 100) / 100).toFixed(2).replace(".", ",");
