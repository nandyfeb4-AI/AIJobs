import type { ExternalJobSource, SourceBoardConfig } from "@aijobs/types";

type CatalogBoard = SourceBoardConfig & {
  company: string;
  domain: string;
  tier: "P1" | "P2" | "P3";
};

const STARTER_BOARD_CATALOG: CatalogBoard[] = [
  { source: "greenhouse", boardToken: "stripe", company: "Stripe", domain: "stripe.com", tier: "P1" },
  { source: "greenhouse", boardToken: "airbnb", company: "Airbnb", domain: "airbnb.com", tier: "P1" },
  { source: "greenhouse", boardToken: "figma", company: "Figma", domain: "figma.com", tier: "P1" },
  { source: "greenhouse", boardToken: "brex", company: "Brex", domain: "brex.com", tier: "P1" },
  { source: "greenhouse", boardToken: "reddit", company: "Reddit", domain: "reddit.com", tier: "P1" },
  { source: "greenhouse", boardToken: "webflow", company: "Webflow", domain: "webflow.com", tier: "P1" },
  { source: "greenhouse", boardToken: "runpod", company: "Runpod", domain: "runpod.io", tier: "P2" },
  { source: "greenhouse", boardToken: "chainguard", company: "Chainguard", domain: "chainguard.dev", tier: "P2" },
  { source: "greenhouse", boardToken: "smartsheet", company: "Smartsheet", domain: "smartsheet.com", tier: "P2" },
  { source: "greenhouse", boardToken: "ocrolusinc", company: "Ocrolus", domain: "ocrolus.com", tier: "P2" },

  { source: "ashby", boardToken: "openai", company: "OpenAI", domain: "openai.com", tier: "P1" },
  { source: "ashby", boardToken: "notion", company: "Notion", domain: "notion.so", tier: "P1" },
  { source: "ashby", boardToken: "ramp", company: "Ramp", domain: "ramp.com", tier: "P1" },
  { source: "ashby", boardToken: "flock safety", company: "Flock Safety", domain: "flocksafety.com", tier: "P1" },
  { source: "ashby", boardToken: "zip", company: "Zip", domain: "ziphq.com", tier: "P1" },
  { source: "ashby", boardToken: "trm-labs", company: "TRM Labs", domain: "trmlabs.com", tier: "P2" },
  { source: "ashby", boardToken: "cognition", company: "Cognition", domain: "cognition.ai", tier: "P2" },
  { source: "ashby", boardToken: "graphite", company: "Graphite", domain: "graphite.dev", tier: "P2" },
  { source: "ashby", boardToken: "withpulley", company: "Pulley", domain: "pulley.com", tier: "P2" },
  { source: "ashby", boardToken: "reflectionai", company: "Reflection AI", domain: "reflection.ai", tier: "P3" },

  { source: "lever", boardToken: "whoop", company: "WHOOP", domain: "whoop.com", tier: "P1" },
  { source: "lever", boardToken: "quantcast", company: "Quantcast", domain: "quantcast.com", tier: "P1" },
  { source: "lever", boardToken: "veeva", company: "Veeva", domain: "veeva.com", tier: "P1" },
  { source: "lever", boardToken: "aircall", company: "Aircall", domain: "aircall.io", tier: "P1" },
  { source: "lever", boardToken: "everbridge", company: "Everbridge", domain: "everbridge.com", tier: "P2" },
  { source: "lever", boardToken: "BestEgg", company: "Best Egg", domain: "bestegg.com", tier: "P2" },
  { source: "lever", boardToken: "CesiumAstro", company: "CesiumAstro", domain: "cesiumastro.com", tier: "P2" },
  { source: "lever", boardToken: "zerotier", company: "ZeroTier", domain: "zerotier.com", tier: "P2" },
];

export function getStarterBoards(filterSource?: ExternalJobSource): SourceBoardConfig[] {
  return STARTER_BOARD_CATALOG
    .filter((item) => (filterSource ? item.source === filterSource : true))
    .map(({ source, boardToken }) => ({ source, boardToken }));
}

export function getStarterBoardCatalog(filterSource?: ExternalJobSource) {
  return STARTER_BOARD_CATALOG.filter((item) => (filterSource ? item.source === filterSource : true));
}

export function getStarterBoardSummary() {
  const summary = new Map<ExternalJobSource, number>();

  for (const item of STARTER_BOARD_CATALOG) {
    summary.set(item.source, (summary.get(item.source) ?? 0) + 1);
  }

  return Array.from(summary.entries()).map(([source, count]) => ({ source, count }));
}

export function getStarterBoardMetadata(source: ExternalJobSource, boardToken: string) {
  return STARTER_BOARD_CATALOG.find(
    (item) => item.source === source && item.boardToken === boardToken,
  );
}
