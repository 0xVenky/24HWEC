// 24h Nürburgring class metadata. Descriptions distilled from the DMSB
// regulations and current Pit Debrief / Dailysportscar / NLS coverage.
// Unknown classes fall back to a generic blurb.

export interface ClassMeta {
  tagline: string;
  description: string;
  examples: string;
}

export const CLASS_META: Record<string, ClassMeta> = {
  "SP-PRO": {
    tagline: "Prototype / over-3.0L specials",
    description:
      "DMSB special-build prototypes >3000cc with restrictions on TC, ride height, rear wing and aero; not FIA-homologated. Rare entries.",
    examples: "SCG 004C (historically), bespoke prototype builds",
  },
  "SP 9": {
    tagline: "FIA GT3 — fights for overall victory",
    description:
      "FIA-homologated GT3 cars under BoP (weight, fuel, boost, aero) with a mandatory electronic anti-lift system. The top class on the grid.",
    examples:
      "BMW M4 GT3 Evo, Porsche 911 GT3 R (992), Mercedes-AMG GT3, Ferrari 296 GT3, Audi R8 LMS Evo II, Ford Mustang GT3, Aston Martin Vantage AMR GT3",
  },
  "SP 9 PRO": {
    tagline: "GT3 — all-pro lineup",
    description:
      "SP9 sub-class for crews of FIA-graded Platinum/Gold professionals only; fights for the outright overall win.",
    examples: "Manthey-EMA, ROWE, Schubert, Land — manufacturer-backed factory entries",
  },
  "SP 9 PRO-AM": {
    tagline: "GT3 — mixed pro/amateur",
    description:
      "SP9 sub-class with at least one Silver/Bronze driver in the lineup; same hardware as Pro but classified separately.",
    examples: "Customer GT3 teams blending a factory pro with paying gentlemen",
  },
  "SP-X": {
    tagline: "Experimental specials",
    description:
      "Non-homologated/experimental cars built specifically for the Nordschleife. Must run an electronic anti-lift system. Engineering one-offs.",
    examples: "HWA EVO.R, KTM X-Bow GTX, BMW M3 Touring 24h, Glickenhaus 004C",
  },
  "SP X": {
    tagline: "Experimental specials",
    description: "Non-homologated/experimental cars built specifically for the Nordschleife.",
    examples: "HWA EVO.R, KTM X-Bow GTX, Glickenhaus 004C",
  },
  "SP 10": {
    tagline: "FIA GT4 (SRO)",
    description:
      "SRO-homologated GT4 cars under BoP; one step below GT3 in pace, full racing prep, professional-level grid.",
    examples:
      "Toyota GR Supra GT4, BMW M4 GT4, Porsche 718 Cayman GT4 RS CS, Mercedes-AMG GT4, Aston Martin Vantage AMR GT4",
  },
  "SP 8": {
    tagline: "Modified — >4.0 L naturally aspirated",
    description: "Modified production-based cars with NA engines over 4.0 L displacement.",
    examples: "Aston Martin V8 Vantage, larger-displacement BMW/Porsche specials",
  },
  "SP 8T": {
    tagline: "Modified — up to 4.0 L turbo",
    description: "Modified cars with forced induction up to 4.0 L equivalent; small but fast class.",
    examples: "McLaren Artura Trophy Evo, Audi RS3 LMS-based builds",
  },
  "SP 7": {
    tagline: "Modified — up to 4.0 L naturally aspirated",
    description:
      "Modified cars with naturally-aspirated engines up to 4.0 L; traditionally a Porsche stronghold.",
    examples: "Porsche 911 GT3 Cup (991), Porsche 718 Cayman GT4 Clubsport",
  },
  "SP 6": {
    tagline: "Modified — up to 3.5 L naturally aspirated",
    description: "Modified production-based cars with NA engines up to 3.5 L.",
    examples: "BMW Z4, Porsche Cayman variants",
  },
  "SP 4": {
    tagline: "Modified — up to 2.5 L naturally aspirated",
    description: "Modified cars with NA engines up to 2.5 L.",
    examples: "BMW 325Ci, BMW E46 inline-six builds",
  },
  "SP 4T": {
    tagline: "Modified — up to 2.6 L turbo",
    description: "Modified cars with forced induction up to 2.6 L equivalent. Diverse FWD/AWD mix.",
    examples: "VW Golf GTI Clubsport 24h, Subaru WRX, Hyundai Elantra N1 RP",
  },
  "SP 3": {
    tagline: "Modified — up to 2.0 L naturally aspirated",
    description: "Entry-level modified class with NA engines up to 2.0 L.",
    examples: "BMW 318ti Compact (E36), Honda Civic, Renault Clio",
  },
  "SP 3T": {
    tagline: "Modified — up to 2.0 L turbo",
    description:
      "Modified turbo cars up to 2.0 L equivalent; often a home for ex-TCR and hot-hatch builds.",
    examples: "VW Golf 7 GTI TCR, Cupra TCR DSG, Audi RS3 LMS DSG, Audi TT, Dacia Logan",
  },
  "SP 2T": {
    tagline: "Compact modified turbo",
    description:
      "Modified turbo class below SP3T for small, low-displacement turbo engines (3-cyl / small 4-cyl).",
    examples: "Toyota GR Yaris, Opel Corsa GS Line 130",
  },
  "Cup 2": {
    tagline: "Porsche 911 GT3 Cup one-make",
    description:
      "Spec class for current-gen Porsche 911 GT3 Cup (992) cars on Michelin control tyres; identical hardware, drivers separate them.",
    examples: "Porsche 911 GT3 Cup (992.1)",
  },
  "Cup 3": {
    tagline: "Porsche Cayman GT4 Clubsport one-make",
    description: "Spec class for the Porsche 718 Cayman GT4 Clubsport (Typ 982). Porsche feeder class.",
    examples: "Porsche 718 Cayman GT4 Clubsport Trophy",
  },
  "BMW M240i": {
    tagline: "BMW M240i Racing Cup (was Cup 5)",
    description:
      "One-make on the BMW M240i Racing — 3.0 L straight-six turbo (~340 hp), mechanical LSD, Goodyear control tyres.",
    examples: "BMW M240i Racing (F22)",
  },
  "BMW 325i": {
    tagline: "BMW 325i Endurance Trophy",
    description:
      "Long-running club-level one-make for BMW E90 325i (2.5 L NA inline-six); cheapest way onto the grid and a Nordschleife training ground.",
    examples: "BMW 325i (E90)",
  },
  BMW: {
    tagline: "BMW one-make (legacy)",
    description: "Umbrella entry from older one-make BMW classes.",
    examples: "Various BMW models",
  },
  "VT2 Hecka": {
    tagline: "Production turbo — RWD / AWD",
    description:
      'Production-class 1.6–2.0 L turbo cars with rear or all-wheel drive. "Hecka" denotes rear-driven layout in German racing parlance.',
    examples: "BMW 330i (G20), Toyota GR Supra, Audi S2-Lim",
  },
  "VT2 Front": {
    tagline: "Production turbo — FWD",
    description: "Production-class 1.6–2.0 L turbo cars restricted to front-wheel drive.",
    examples: "Cupra León, VW Golf GTI, VW Scirocco R, FWD Audi S3 builds",
  },
  V6: {
    tagline: "Production NA — up to 3.5 L",
    description: "Close-to-stock production cars, naturally aspirated up to 3.5 L (suspension mods only, stock engine).",
    examples: "Porsche Cayman S/GTS, Porsche 911 Carrera, BMW M3 (E46)",
  },
  V5: {
    tagline: "Production NA — up to 3.0 L",
    description: "Close-to-stock production NA cars up to 3.0 L.",
    examples: "Porsche Cayman (981 base), BMW 330i (E90 NA), Porsche Cayman CM12",
  },
  V4: {
    tagline: "Production NA — up to 2.5 L",
    description: "Close-to-stock production NA cars up to 2.5 L.",
    examples: "BMW 325i, Honda S2000, Mazda MX-5 (larger NB/NC)",
  },
  V3: {
    tagline: "Production NA — 1.8–2.0 L",
    description: "Close-to-stock production NA cars 1.8–2.0 L.",
    examples: "BMW 320i, Mazda MX-5, Renault Clio, NA-gen Honda Civic Type R",
  },
  V2: {
    tagline: "Production NA — 1.62–1.8 L",
    description: "Smallest near-stock NA production class. Slow, but where the grid genuinely starts.",
    examples: "Suzuki Swift Sport, Renault Clio RS, Citroën C2",
  },
  AT1: {
    tagline: "Alternative tech — top tier",
    description:
      "Alternative-technology category for high-performance machinery (often GT3-based) running sustainable / eFuels / hybrid. Marketing showcase slot.",
    examples: "Audi R8 LMS GT3 Evo II on sustainable fuel, hybrid/eFuel prototypes",
  },
  AT2: {
    tagline: "Alternative tech — Cup tier",
    description:
      "AT counterpart at Cup-level performance, typically Porsche 911 GT3 Cup chassis running eFuel / Race 98 synthetic fuel on Dunlop tyres.",
    examples: "Porsche 911 GT3 Cup MR (Manthey eFuel entry)",
  },
  TCR: {
    tagline: "FIA TCR touring car",
    description:
      "Global FIA TCR ruleset: 4/5-door production-based FWD touring cars, 1.75–2.0 L single-turbo, ≥4.20 m, BoP-controlled.",
    examples: "Hyundai Elantra N TCR, Cupra León Competición TCR, Audi RS3 LMS, VW Golf 7 GTI TCR",
  },
};

const GENERIC: ClassMeta = {
  tagline: "Class details unavailable",
  description: "No detailed description on file for this class yet.",
  examples: "—",
};

export function classMeta(name: string): ClassMeta {
  return CLASS_META[name] ?? GENERIC;
}
