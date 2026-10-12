/** Nom lisible d'un appareil à partir de l'identifiant du navigateur (sans numéro de version). */
export function deviceName(ua: string) {
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone ou iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Appareil";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "navigateur";
  return `${nav} sur ${os}`;
}
