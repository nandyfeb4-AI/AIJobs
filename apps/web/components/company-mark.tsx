"use client";

import { useEffect, useState } from "react";

function companyInitials(company: string) {
  const parts = company.split(/\s+/).filter(Boolean);
  const joined = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return joined || company.slice(0, 1).toUpperCase();
}

function fallbackLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;

  try {
    const url = new URL(logoUrl);
    const googleDomain = url.searchParams.get("domain_url");
    const domain = googleDomain ?? url.hostname.replace(/^www\./i, "");

    if (!domain) return null;
    return `https://unavatar.io/${encodeURIComponent(domain)}`;
  } catch {
    return null;
  }
}

export function CompanyMark({
  company,
  logoUrl,
}: {
  company: string;
  logoUrl?: string | null;
}) {
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(logoUrl ?? null);

  useEffect(() => {
    setHasError(false);
    setCurrentSrc(logoUrl ?? null);
  }, [logoUrl]);

  const showImage = Boolean(currentSrc && !hasError);

  return (
    <div className="w-12 h-12 rounded-2xl border border-line bg-[linear-gradient(135deg,#fffdf7_0%,#f2ece0_100%)] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentSrc ?? undefined}
          alt={`${company} logo`}
          className="w-full h-full object-contain"
          onError={() => {
            const fallback = fallbackLogoUrl(logoUrl);
            if (fallback && fallback !== currentSrc) {
              setCurrentSrc(fallback);
              return;
            }

            setHasError(true);
          }}
        />
      ) : (
        <span className="text-ink text-sm font-semibold tracking-[0.04em]">
          {companyInitials(company)}
        </span>
      )}
    </div>
  );
}
