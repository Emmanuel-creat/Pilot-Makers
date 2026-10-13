"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/components/editor/api";
import { Icon } from "./Icon";

const toBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const toB64url = (b: ArrayBuffer | null) =>
  b
    ? btoa(String.fromCharCode(...new Uint8Array(b)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    : null;

function useSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials), []);
  return ok;
}

function readError(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) return "Opération annulée.";
  if (e instanceof DOMException && e.name === "InvalidStateError") return "Cet appareil a déjà une clé d'accès pour ce compte.";
  return "La clé d'accès n'a pas pu être utilisée sur cet appareil.";
}

/** Bouton de connexion par clé d'accès, masqué quand le navigateur ne les prend pas en charge. */
export function PasskeyLogin({ next }: { next: string }) {
  const supported = useSupported();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!supported) return null;
  async function go() {
    setBusy(true);
    setError("");
    try {
      const o = await apiFetch<{ challengeId: string; publicKey: { challenge: string; rpId: string; timeout: number; userVerification: UserVerificationRequirement } }>(
        "/api/auth/passkey/options",
        { method: "POST" },
      );
      const cred = (await navigator.credentials.get({
        publicKey: { ...o.publicKey, challenge: toBytes(o.publicKey.challenge), allowCredentials: [] },
      })) as PublicKeyCredential | null;
      if (!cred) throw new DOMException("", "NotAllowedError");
      const r = cred.response as AuthenticatorAssertionResponse;
      await apiFetch("/api/auth/passkey", {
        method: "POST",
        json: {
          challengeId: o.challengeId,
          credential: {
            id: cred.id,
            response: {
              clientDataJSON: toB64url(r.clientDataJSON),
              authenticatorData: toB64url(r.authenticatorData),
              signature: toB64url(r.signature),
              userHandle: toB64url(r.userHandle),
            },
          },
        },
      });
      router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/app");
      router.refresh();
    } catch (e) {
      setError(readError(e));
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="btn-secondary w-full" onClick={go} disabled={busy}>
        <Icon name="key" />
        {busy ? "Connexion..." : "Se connecter avec une clé d'accès"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface PasskeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/** Liste des clés d'accès du compte, ajout et retrait. */
export function PasskeyManager({ initial }: { initial: PasskeyRow[] }) {
  const supported = useSupported();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const o = await apiFetch<{
        challengeId: string;
        publicKey: Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials"> & {
          challenge: string;
          user: { id: string; name: string; displayName: string };
          excludeCredentials: { type: "public-key"; id: string }[];
        };
      }>("/api/account/passkeys/options", { method: "POST" });
      const cred = (await navigator.credentials.create({
        publicKey: {
          ...o.publicKey,
          challenge: toBytes(o.publicKey.challenge),
          user: { ...o.publicKey.user, id: toBytes(o.publicKey.user.id) },
          excludeCredentials: o.publicKey.excludeCredentials.map((c) => ({ type: c.type, id: toBytes(c.id) })),
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new DOMException("", "NotAllowedError");
      const r = cred.response as AuthenticatorAttestationResponse;
      await apiFetch("/api/account/passkeys", {
        method: "POST",
        json: {
          challengeId: o.challengeId,
          name,
          credential: {
            id: cred.id,
            response: {
              clientDataJSON: toB64url(r.clientDataJSON),
              attestationObject: toB64url(r.attestationObject),
              transports: typeof r.getTransports === "function" ? r.getTransports() : [],
            },
          },
        },
      });
      setName("");
      setMessage({ ok: true, text: "Clé d'accès ajoutée. Vous pourrez l'utiliser à la prochaine connexion." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: readError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/account/passkeys/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: readError(e) });
    }
  }

  return (
    <div className="space-y-4">
      {initial.length ? (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {initial.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{k.name}</span>
                <span className="block text-xs text-muted">
                  Ajoutée le {day(k.createdAt)}
                  {k.lastUsedAt ? `, utilisée le ${day(k.lastUsedAt)}` : ", jamais utilisée"}
                </span>
              </span>
              <button type="button" className="btn-secondary" onClick={() => remove(k.id)} aria-label={`Retirer la clé d'accès ${k.name}`}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune clé d'accès pour l'instant.</p>
      )}
      {supported ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="pk-name">
              Nom de l'appareil (facultatif)
            </label>
            <input id="pk-name" className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Téléphone de chantier" />
          </div>
          <button type="button" className="btn-primary" onClick={add} disabled={busy}>
            <Icon name="key" />
            {busy ? "En attente de l'appareil..." : "Ajouter une clé d'accès"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">Ce navigateur ne propose pas les clés d'accès.</p>
      )}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
