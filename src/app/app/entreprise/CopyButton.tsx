"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/** Bouton qui copie un texte dans le presse-papiers. */
export function CopyButton({ text, label, className = "btn-secondary min-h-9" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copié" : label}
    </button>
  );
}
