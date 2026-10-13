import { describe, expect, it } from "vitest";
import { EMBED_HEIGHT, embedCode } from "@/lib/embed";
import nextConfig from "../next.config";

describe("formulaire à intégrer", () => {
  it("produit un code iframe avec un titre accessible et des attributs échappés", () => {
    const code = embedCode("https://exemple.fr/integrer/martin", `Martin & Fils "Rénovation"`);
    expect(code).toBe(
      `<iframe src="https://exemple.fr/integrer/martin" title="Demande de devis, Martin &amp; Fils &quot;Rénovation&quot;" width="100%" height="${EMBED_HEIGHT}" style="border:0;max-width:640px" loading="lazy"></iframe>`,
    );
    expect(embedCode("https://exemple.fr/integrer/x", " ")).toContain('title="Demande de devis"');
  });

  it("autorise l'intégration du seul formulaire dans un autre site", async () => {
    const rules = await nextConfig.headers!();
    const general = rules.find((r) => r.source === "/(.*)")!;
    const embed = rules.find((r) => r.source === "/integrer/:path*")!;
    expect(rules.indexOf(embed)).toBeGreaterThan(rules.indexOf(general));
    const csp = (r: typeof general) => r.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp(general)).toContain("frame-ancestors 'none'");
    expect(csp(embed)).toContain("frame-ancestors *");
    expect(csp(embed)).toContain("connect-src 'self'");
    expect(embed.headers.find((h) => h.key === "X-Frame-Options")?.value).not.toBe("DENY");
  });
});
