import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { authorLabel, questionSchema, rankAnswers } from "@/lib/community";
import type { Ctx } from "@/lib/services/context";
import { acceptAnswer, answerQuestion, askQuestion, getQuestion, listQuestions, report, toggleVote } from "@/lib/services/community";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("règles de l'entraide", () => {
  it("signature par métier et département, sans nom", () => {
    expect(authorLabel("Carreleur", "69003")).toBe("Carreleur, 69");
    expect(authorLabel("", "20090")).toBe("Artisan, 2A");
    expect(authorLabel("Plombier", "20600")).toBe("Plombier, 2B");
    expect(authorLabel("Maçon", "97400")).toBe("Maçon, 974");
    expect(authorLabel("Peintre", "1000", "Belgique")).toBe("Peintre, Belgique");
    expect(authorLabel("Peintre", "")).toBe("Peintre");
  });

  it("refuse téléphone et e-mail dans les messages publics", () => {
    const ok = { topic: "normes", title: "Quel DTU pour une chape sur plancher chauffant ?", body: "" };
    expect(questionSchema.safeParse(ok).success).toBe(true);
    expect(questionSchema.safeParse({ ...ok, body: "Appelez-moi au 06 12 34 56 78" }).success).toBe(false);
    expect(questionSchema.safeParse({ ...ok, body: "Écrivez à jean@exemple.fr" }).success).toBe(false);
    expect(questionSchema.safeParse({ ...ok, body: "Épaisseur 5 cm, surface 32 m², 2 couches" }).success).toBe(true);
  });

  it("réponse retenue d'abord, puis votes, puis ancienneté", () => {
    const d = (n: number) => new Date(2026, 9, n);
    const r = rankAnswers(
      [
        { id: "a", votes: 1, createdAt: d(1) },
        { id: "b", votes: 5, createdAt: d(2) },
        { id: "c", votes: 0, createdAt: d(3) },
        { id: "d", votes: 1, createdAt: d(0) },
      ],
      "c",
    );
    expect(r.map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("questions, réponses, votes et signalements", () => {
  let db: Database;
  let asker: Ctx;
  let helper: Ctx;
  let third: Ctx;
  let qid: string;

  beforeAll(async () => {
    db = await freshDb();
    asker = await signUp(db, "question@exemple.fr", "Carrelage Martin");
    await completeProfile(asker);
    helper = await signUp(db, "aide@exemple.fr", "Maçonnerie Durand");
    third = await signUp(db, "tiers@exemple.fr", "Peinture Robin");
  });

  it("une question est visible de tous les comptes, signée sans nom", async () => {
    qid = await askQuestion(asker, { topic: "technique", title: "Quel primaire sur un ancien carrelage avant ragréage ?", body: "Sol de cuisine, 15 m²." });
    const list = await listQuestions(helper);
    expect(list).toEqual([expect.objectContaining({ id: qid, author: expect.stringMatching(/, 69$/), answers: 0, resolved: false, mine: false })]);
    expect(list[0].author).not.toContain("Martin");
    expect((await listQuestions(helper, { filter: "sans_reponse" })).length).toBe(1);
    expect((await listQuestions(helper, { filter: "miennes" })).length).toBe(0);
    expect((await listQuestions(helper, { q: "ragréage" })).length).toBe(1);
    expect((await listQuestions(helper, { topic: "normes" })).length).toBe(0);
  });

  it("réponses, vote utile unique et réponse retenue par l'auteur seulement", async () => {
    const a1 = await answerQuestion(helper, qid, { body: "Un primaire d'accrochage spécial supports fermés, après dégraissage et ponçage." });
    const a2 = await answerQuestion(third, qid, { body: "Vérifiez d'abord l'adhérence des carreaux en les sondant au maillet." });
    await expect(toggleVote(helper, a1)).rejects.toThrow(/votre entreprise/);
    expect(await toggleVote(asker, a2)).toBe(true);
    expect(await toggleVote(helper, a2)).toBe(true);
    expect(await toggleVote(helper, a2)).toBe(false);
    let q = await getQuestion(asker, qid);
    expect(q.answers.map((a) => [a.id, a.votes])).toEqual([
      [a2, 1],
      [a1, 0],
    ]);
    await expect(acceptAnswer(helper, qid, a1)).rejects.toThrow(/auteur/);
    await acceptAnswer(asker, qid, a1);
    q = await getQuestion(helper, qid);
    expect(q.answers[0].id).toBe(a1);
    expect(q.acceptedAnswerId).toBe(a1);
    expect((await listQuestions(third))[0]).toMatchObject({ resolved: true, answers: 2 });
  });

  it("trois signalements distincts masquent un message", async () => {
    const spam = await answerQuestion(third, qid, { body: "Venez voir nos promotions sur les primaires cette semaine." });
    await expect(report(third, "reponse", spam, { reason: "publicite" })).rejects.toThrow(/votre entreprise/);
    expect(await report(asker, "reponse", spam, { reason: "publicite" })).toEqual({ hidden: false });
    expect(await report(asker, "reponse", spam, { reason: "publicite" })).toEqual({ hidden: false });
    expect(await report(helper, "reponse", spam, { reason: "publicite" })).toEqual({ hidden: false });
    const fourth = await signUp(db, "quatre@exemple.fr", "Électricité Petit");
    expect(await report(fourth, "reponse", spam, { reason: "hors_sujet" })).toEqual({ hidden: true });
    expect((await getQuestion(asker, qid)).answers.map((a) => a.id)).not.toContain(spam);
  });
});
