import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type RecruiteeLocation = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  country_code?: string | null;
  state_code?: string | null;
  name?: string | null;
};

type RecruiteeOffer = {
  id?: number | string;
  slug?: string | null;
  title?: string | null;
  status?: string | null;
  kind?: string | null;
  department?: string | null;
  location?: string | RecruiteeLocation | null;
  locations?: RecruiteeLocation[];
  remote?: boolean | null;
  description?: string | null;
  description_html?: string | null;
  requirements?: string | null;
  careers_url?: string | null;
  careers_apply_url?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
};

type RecruiteeResponse = {
  offers?: RecruiteeOffer[];
};

function locationLabel(location?: RecruiteeOffer["location"], locations?: RecruiteeLocation[]) {
  const locationParts =
    locations
      ?.map((item) =>
        [
          item.name,
          item.city,
          item.state ?? item.state_code,
          item.country ?? item.country_code,
        ]
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean) ?? [];

  if (typeof location === "string") {
    return [location, ...locationParts].filter(Boolean).join(" · ");
  }

  if (location?.name) {
    return [location.name, ...locationParts].filter(Boolean).join(" · ");
  }

  if (location?.city || location?.state || location?.country) {
    return [
      [location.city, location.state, location.country ?? location.country_code].filter(Boolean).join(", "),
      ...locationParts,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return locationParts
    .filter(Boolean)
    .join(" · ") || null;
}

@Injectable()
export class RecruiteeAdapter implements SourceAdapter {
  readonly source = "recruitee" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const response = await fetch(`https://${boardToken}.recruitee.com/api/offers/`, {
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Recruitee request failed with ${response.status}`);
    }

    const payload = (await response.json()) as RecruiteeResponse | RecruiteeOffer[];
    const offers = (Array.isArray(payload) ? payload : payload.offers ?? []).filter(
      (offer) => (!offer.status || offer.status === "published") && (!offer.kind || offer.kind === "job"),
    );

    return offers.map((offer, index) => {
      const applyUrl =
        offer.careers_apply_url ??
        offer.careers_url ??
        `https://${boardToken}.recruitee.com/o/${offer.slug ?? offer.id ?? index}`;
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback: formatBoardToken(boardToken),
        applyUrl,
      });

      return {
        id: `recruitee:${boardToken}:${offer.id ?? offer.slug ?? index}`,
        source: this.source,
        boardToken,
        title: offer.title ?? "Untitled role",
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location: locationLabel(offer.location, offer.locations),
        workMode: offer.remote ? "remote" : null,
        employmentType: null,
        salary: buildSalaryLabel([]),
        description: stripHtml(
          [offer.description_html ?? offer.description, offer.requirements].filter(Boolean).join("\n\n"),
        ),
        applyUrl,
        postedAt: toIsoDate(offer.published_at ?? offer.created_at ?? offer.updated_at),
        department: offer.department ?? null,
        team: null,
      } satisfies AggregatedJob;
    });
  }
}
