import { describe, expect, it } from "vitest";
import { appendDictated, spokenPunctuation } from "@/components/Dictation";

describe("dictée de la description", () => {
  it("convertit la ponctuation dictée", () => {
    expect(spokenPunctuation("reprise du mur virgule enduit chaux point")).toBe("reprise du mur, enduit chaux.");
    expect(spokenPunctuation("dépose carrelage à la ligne pose faïence")).toBe("dépose carrelage\nPose faïence");
    expect(spokenPunctuation("fin du lot point à la ligne lot suivant")).toBe("fin du lot.\nLot suivant");
    expect(spokenPunctuation("traitement du point de rosée")).toBe("traitement du point de rosée");
  });

  it("ajoute le texte dicté à la suite", () => {
    expect(appendDictated("", "bonjour")).toBe("Bonjour");
    expect(appendDictated("Mur nord.", "enduit")).toBe("Mur nord. enduit");
  });
});
