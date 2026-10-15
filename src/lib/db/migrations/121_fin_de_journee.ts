/** Rappel de fin de journée, choisi par chaque utilisateur, envoyé une fois par jour. */
export const sql = /* sql */ `
ALTER TABLE memberships ADD COLUMN day_close_reminder boolean NOT NULL DEFAULT false;
ALTER TABLE memberships ADD COLUMN day_close_sent_on date;
`;
