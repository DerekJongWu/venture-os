// ─── Status options (all 15 Attio values) ────────────────────────────────────
export const ALL_STATUSES = [
  "Track",
  "Need Intro",
  "Outreach",
  "Initial Meetings",
  "Intro in Process",
  "Partner Screening",
  "Partner Meetings",
  "Deep Diligence",
  "IC Review",
  "IC Voted - Pass/Track",
  "IC Approved / Legal - Funding Process",
  "Portfolio",
  "Upfront Pass",
  "Reviewed and Pass",
  "Send Pass",
] as const;

export type StatusValue = (typeof ALL_STATUSES)[number];

// ─── Swim lane configuration ──────────────────────────────────────────────────
export const SWIM_LANES = [
  {
    id: "top_of_funnel",
    label: "Top of Funnel",
    statuses: [
      "Track",
      "Need Intro",
      "Outreach",
      "Initial Meetings",
      "Intro in Process",
    ],
  },
  {
    id: "active_diligence",
    label: "Active Diligence",
    statuses: ["Partner Screening", "Partner Meetings", "Deep Diligence"],
  },
  {
    id: "ic_legal",
    label: "IC / Legal",
    statuses: [
      "IC Review",
      "IC Voted - Pass/Track",
      "IC Approved / Legal - Funding Process",
    ],
  },
  {
    id: "portfolio",
    label: "Portfolio",
    statuses: ["Portfolio"],
  },
  {
    id: "passed",
    label: "Passed",
    statuses: ["Upfront Pass", "Reviewed and Pass", "Send Pass"],
  },
] as const;

export type LaneId = (typeof SWIM_LANES)[number]["id"];

export function getLaneForStatus(status: string | null | undefined): LaneId {
  for (const lane of SWIM_LANES) {
    if (lane.statuses.includes(status as never)) return lane.id;
  }
  return "top_of_funnel";
}

export function getLane(id: LaneId) {
  return SWIM_LANES.find((l) => l.id === id)!;
}

// ─── Funnel options ───────────────────────────────────────────────────────────
export const FUNNEL_OPTIONS = [
  "Top of Funnel",
  "Mid Funnel",
  "Bottom of Funnel",
  "Pass",
  "Portfolio",
  "Pre-Funnel",
] as const;

// ─── Fund options (multiselect) ───────────────────────────────────────────────
export const FUND_OPTIONS = [
  "Flagship",
  "SMBC",
  "Horizons",
  "Horizons - Harbor",
] as const;

// ─── Thesis options (multiselect) ─────────────────────────────────────────────
export const THESIS_OPTIONS = [
  "DeepTech - AI Apps/Infra",
  "DeepTech - Cyber/RiskTech",
  "DeepTech - Quantum",
  "DeepTech - Blockchain",
  "AI-First Vertical Software - BankTech",
  "AI-First Vertical Software - Wealth, Asset & Capital Markets Tech",
  "AI-First Vertical Software - Insurtech",
  "AI-First Vertical Software - HealthTech",
  "AI-First Vertical Software - Other",
  "Payments - Commerce",
  "Payments - Value Added Services",
  "Payments - CFO Tech",
  "Payments - Payroll & Benefits",
  "LatAm Pipeline",
  "Japan Pipeline",
] as const;

// ─── Source options ───────────────────────────────────────────────────────────
export const SOURCE_OPTIONS = [
  "Lighthouse",
  "Founder Referral",
  "VC Referral",
  "LP / Strategic Partner Referral",
  "Personal",
  "Inbound",
  "Other",
] as const;

// ─── Pass rationale options (multiselect) ─────────────────────────────────────
export const PASS_RATIONALE_OPTIONS = [
  "Founder Profile",
  "GTM",
  "ACVs",
  "Revenue Mix",
  "TAM",
  "Traction",
  "Valuation",
  "Cap Table Quality",
  "Margin Profile",
  "Other",
  "Round Dynamics",
  "Competition",
  "Product/Vision",
  "Geo",
] as const;

// ─── Status badge color map ───────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  Track: "bg-blue-100 text-blue-800",
  "Need Intro": "bg-yellow-100 text-yellow-800",
  Outreach: "bg-orange-100 text-orange-800",
  "Initial Meetings": "bg-purple-100 text-purple-800",
  "Intro in Process": "bg-indigo-100 text-indigo-800",
  "Partner Screening": "bg-cyan-100 text-cyan-800",
  "Partner Meetings": "bg-teal-100 text-teal-800",
  "Deep Diligence": "bg-emerald-100 text-emerald-800",
  "IC Review": "bg-lime-100 text-lime-800",
  "IC Voted - Pass/Track": "bg-green-100 text-green-800",
  "IC Approved / Legal - Funding Process": "bg-green-200 text-green-900",
  Portfolio: "bg-green-500 text-white",
  "Upfront Pass": "bg-gray-100 text-gray-600",
  "Reviewed and Pass": "bg-gray-200 text-gray-600",
  "Send Pass": "bg-red-100 text-red-700",
};
