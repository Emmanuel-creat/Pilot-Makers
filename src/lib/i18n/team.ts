/**
 * Écran « Ma journée » des équipes de chantier, traduit dans les langues les plus parlées sur les chantiers en France.
 * Le reste de l'application reste en français. Chaque langue doit fournir toutes les clés (vérifié par les tests).
 */

export const TEAM_LOCALES = {
  fr: { name: "Français", intl: "fr-FR", dir: "ltr" },
  en: { name: "English", intl: "en-GB", dir: "ltr" },
  pt: { name: "Português", intl: "pt-PT", dir: "ltr" },
  es: { name: "Español", intl: "es-ES", dir: "ltr" },
  ro: { name: "Română", intl: "ro-RO", dir: "ltr" },
  pl: { name: "Polski", intl: "pl-PL", dir: "ltr" },
  tr: { name: "Türkçe", intl: "tr-TR", dir: "ltr" },
  ar: { name: "العربية", intl: "ar", dir: "rtl" },
} as const;
export type TeamLocale = keyof typeof TEAM_LOCALES;

export const isTeamLocale = (v: unknown): v is TeamLocale => typeof v === "string" && Object.hasOwn(TEAM_LOCALES, v);

export interface TeamDictionary {
  title: string;
  subtitle: string;
  language: string;
  change: string;
  jobsToday: string;
  noJobs: string;
  itinerary: string;
  with: string;
  runningSince: string;
  noJob: string;
  job: string;
  note: string;
  notePlaceholder: string;
  start: string;
  stop: string;
  geo: string;
  started: string;
  stopped: string;
  saving: string;
  weekHours: string;
  noHours: string;
  total: string;
  status: { saisi: string; valide: string; refuse: string };
  safetyTitle: string;
  safety: [string, string, string];
  fullApp: string;
}

export const TEAM_TEXT: Record<TeamLocale, TeamDictionary> = {
  fr: {
    title: "Ma journée",
    subtitle: "Vos chantiers du jour, votre pointage et vos heures, dans votre langue.",
    language: "Langue",
    change: "Changer",
    jobsToday: "Mes chantiers aujourd'hui",
    noJobs: "Aucun chantier prévu pour vous aujourd'hui.",
    itinerary: "Itinéraire",
    with: "Avec",
    runningSince: "Pointage en cours depuis",
    noJob: "Sans chantier",
    job: "Chantier",
    note: "Note (facultative)",
    notePlaceholder: "Travaux réalisés, imprévus...",
    start: "Commencer",
    stop: "Terminer",
    geo: "Enregistrer la position au départ",
    started: "Pointage commencé.",
    stopped: "Pointage terminé.",
    saving: "Enregistrement...",
    weekHours: "Mes heures de la semaine",
    noHours: "Aucune heure cette semaine.",
    total: "Total",
    status: { saisi: "À valider", valide: "Validé", refuse: "Refusé" },
    safetyTitle: "Sécurité",
    safety: [
      "Portez vos équipements de protection : casque, chaussures, gants, lunettes.",
      "Signalez tout danger ou accident à votre responsable, même sans blessure.",
      "Urgence : appelez le 112.",
    ],
    fullApp: "Ouvrir l'application complète (en français)",
  },
  en: {
    title: "My day",
    subtitle: "Your jobs for today, your time clock and your hours, in your language.",
    language: "Language",
    change: "Change",
    jobsToday: "My jobs today",
    noJobs: "No job is planned for you today.",
    itinerary: "Directions",
    with: "With",
    runningSince: "Clocked in since",
    noJob: "No job",
    job: "Job",
    note: "Note (optional)",
    notePlaceholder: "Work done, problems...",
    start: "Start",
    stop: "Finish",
    geo: "Record my location when starting",
    started: "Clocked in.",
    stopped: "Clocked out.",
    saving: "Saving...",
    weekHours: "My hours this week",
    noHours: "No hours this week.",
    total: "Total",
    status: { saisi: "To be approved", valide: "Approved", refuse: "Rejected" },
    safetyTitle: "Safety",
    safety: [
      "Wear your protective equipment: helmet, safety shoes, gloves, glasses.",
      "Report any hazard or accident to your manager, even without injury.",
      "Emergency: call 112.",
    ],
    fullApp: "Open the full application (in French)",
  },
  pt: {
    title: "O meu dia",
    subtitle: "As suas obras de hoje, o seu registo de horas e as suas horas, na sua língua.",
    language: "Língua",
    change: "Mudar",
    jobsToday: "As minhas obras hoje",
    noJobs: "Nenhuma obra prevista para si hoje.",
    itinerary: "Itinerário",
    with: "Com",
    runningSince: "Registo em curso desde",
    noJob: "Sem obra",
    job: "Obra",
    note: "Nota (opcional)",
    notePlaceholder: "Trabalhos feitos, imprevistos...",
    start: "Começar",
    stop: "Terminar",
    geo: "Registar a localização ao começar",
    started: "Registo iniciado.",
    stopped: "Registo terminado.",
    saving: "A guardar...",
    weekHours: "As minhas horas da semana",
    noHours: "Nenhuma hora esta semana.",
    total: "Total",
    status: { saisi: "A validar", valide: "Validado", refuse: "Recusado" },
    safetyTitle: "Segurança",
    safety: [
      "Use o seu equipamento de proteção: capacete, calçado, luvas, óculos.",
      "Comunique qualquer perigo ou acidente ao seu responsável, mesmo sem ferimentos.",
      "Emergência: ligue 112.",
    ],
    fullApp: "Abrir a aplicação completa (em francês)",
  },
  es: {
    title: "Mi jornada",
    subtitle: "Sus obras de hoy, su fichaje y sus horas, en su idioma.",
    language: "Idioma",
    change: "Cambiar",
    jobsToday: "Mis obras de hoy",
    noJobs: "No tiene ninguna obra prevista hoy.",
    itinerary: "Cómo llegar",
    with: "Con",
    runningSince: "Fichaje en curso desde",
    noJob: "Sin obra",
    job: "Obra",
    note: "Nota (opcional)",
    notePlaceholder: "Trabajos realizados, imprevistos...",
    start: "Empezar",
    stop: "Terminar",
    geo: "Registrar la ubicación al empezar",
    started: "Fichaje iniciado.",
    stopped: "Fichaje terminado.",
    saving: "Guardando...",
    weekHours: "Mis horas de la semana",
    noHours: "Ninguna hora esta semana.",
    total: "Total",
    status: { saisi: "Por validar", valide: "Validado", refuse: "Rechazado" },
    safetyTitle: "Seguridad",
    safety: [
      "Lleve su equipo de protección: casco, calzado, guantes, gafas.",
      "Informe a su responsable de cualquier peligro o accidente, aunque no haya heridos.",
      "Emergencia: llame al 112.",
    ],
    fullApp: "Abrir la aplicación completa (en francés)",
  },
  ro: {
    title: "Ziua mea",
    subtitle: "Șantierele de azi, pontajul și orele dumneavoastră, în limba dumneavoastră.",
    language: "Limba",
    change: "Schimbă",
    jobsToday: "Șantierele mele de azi",
    noJobs: "Nu aveți niciun șantier planificat azi.",
    itinerary: "Traseu",
    with: "Cu",
    runningSince: "Pontaj în curs de la",
    noJob: "Fără șantier",
    job: "Șantier",
    note: "Notă (opțională)",
    notePlaceholder: "Lucrări efectuate, neprevăzute...",
    start: "Începe",
    stop: "Termină",
    geo: "Înregistrează poziția la început",
    started: "Pontaj început.",
    stopped: "Pontaj terminat.",
    saving: "Se salvează...",
    weekHours: "Orele mele din această săptămână",
    noHours: "Nicio oră în această săptămână.",
    total: "Total",
    status: { saisi: "De validat", valide: "Validat", refuse: "Refuzat" },
    safetyTitle: "Siguranță",
    safety: [
      "Purtați echipamentul de protecție: cască, încălțăminte, mănuși, ochelari.",
      "Anunțați responsabilul despre orice pericol sau accident, chiar fără răniți.",
      "Urgență: sunați la 112.",
    ],
    fullApp: "Deschide aplicația completă (în franceză)",
  },
  pl: {
    title: "Mój dzień",
    subtitle: "Dzisiejsze budowy, rejestracja czasu i Twoje godziny, w Twoim języku.",
    language: "Język",
    change: "Zmień",
    jobsToday: "Moje budowy dzisiaj",
    noJobs: "Na dziś nie masz zaplanowanej żadnej budowy.",
    itinerary: "Trasa",
    with: "Z",
    runningSince: "Czas liczony od",
    noJob: "Bez budowy",
    job: "Budowa",
    note: "Notatka (opcjonalnie)",
    notePlaceholder: "Wykonane prace, nieprzewidziane sytuacje...",
    start: "Rozpocznij",
    stop: "Zakończ",
    geo: "Zapisz lokalizację przy rozpoczęciu",
    started: "Rozpoczęto rejestrację czasu.",
    stopped: "Zakończono rejestrację czasu.",
    saving: "Zapisywanie...",
    weekHours: "Moje godziny w tym tygodniu",
    noHours: "Brak godzin w tym tygodniu.",
    total: "Razem",
    status: { saisi: "Do zatwierdzenia", valide: "Zatwierdzone", refuse: "Odrzucone" },
    safetyTitle: "Bezpieczeństwo",
    safety: [
      "Noś środki ochrony: kask, obuwie, rękawice, okulary.",
      "Zgłaszaj przełożonemu każde zagrożenie lub wypadek, nawet bez obrażeń.",
      "Nagły wypadek: dzwoń pod 112.",
    ],
    fullApp: "Otwórz pełną aplikację (po francusku)",
  },
  tr: {
    title: "Günüm",
    subtitle: "Bugünkü şantiyeleriniz, puantajınız ve saatleriniz, kendi dilinizde.",
    language: "Dil",
    change: "Değiştir",
    jobsToday: "Bugünkü şantiyelerim",
    noJobs: "Bugün sizin için planlanmış şantiye yok.",
    itinerary: "Yol tarifi",
    with: "Birlikte",
    runningSince: "Puantaj başlangıcı",
    noJob: "Şantiyesiz",
    job: "Şantiye",
    note: "Not (isteğe bağlı)",
    notePlaceholder: "Yapılan işler, beklenmedik durumlar...",
    start: "Başla",
    stop: "Bitir",
    geo: "Başlarken konumu kaydet",
    started: "Puantaj başladı.",
    stopped: "Puantaj bitti.",
    saving: "Kaydediliyor...",
    weekHours: "Bu haftaki saatlerim",
    noHours: "Bu hafta saat yok.",
    total: "Toplam",
    status: { saisi: "Onay bekliyor", valide: "Onaylandı", refuse: "Reddedildi" },
    safetyTitle: "Güvenlik",
    safety: [
      "Koruyucu ekipmanınızı takın: baret, iş ayakkabısı, eldiven, gözlük.",
      "Her tehlikeyi veya kazayı, yaralanma olmasa bile sorumlunuza bildirin.",
      "Acil durum: 112'yi arayın.",
    ],
    fullApp: "Uygulamanın tamamını aç (Fransızca)",
  },
  ar: {
    title: "يومي",
    subtitle: "ورشاتك اليوم، وتسجيل حضورك، وساعات عملك، بلغتك.",
    language: "اللغة",
    change: "تغيير",
    jobsToday: "ورشاتي اليوم",
    noJobs: "لا توجد ورشة مبرمجة لك اليوم.",
    itinerary: "الطريق",
    with: "مع",
    runningSince: "تسجيل الحضور جارٍ منذ",
    noJob: "بدون ورشة",
    job: "الورشة",
    note: "ملاحظة (اختيارية)",
    notePlaceholder: "الأعمال المنجزة، الطوارئ...",
    start: "ابدأ",
    stop: "أنهِ",
    geo: "تسجيل الموقع عند البدء",
    started: "بدأ تسجيل الحضور.",
    stopped: "انتهى تسجيل الحضور.",
    saving: "جارٍ الحفظ...",
    weekHours: "ساعاتي هذا الأسبوع",
    noHours: "لا توجد ساعات هذا الأسبوع.",
    total: "المجموع",
    status: { saisi: "في انتظار المصادقة", valide: "مصادق عليه", refuse: "مرفوض" },
    safetyTitle: "السلامة",
    safety: ["ارتدِ معدات الحماية: الخوذة، الحذاء، القفازات، النظارات.", "أبلغ مسؤولك عن أي خطر أو حادث، حتى بدون إصابة.", "في حالة الطوارئ: اتصل بالرقم 112."],
    fullApp: "فتح التطبيق الكامل (بالفرنسية)",
  },
};

export function teamText(locale: string | null | undefined): TeamDictionary {
  return TEAM_TEXT[isTeamLocale(locale) ? locale : "fr"];
}
