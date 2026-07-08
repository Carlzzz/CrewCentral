export type KpiEmphasis = "default" | "emerald" | "amber" | "rose";

export function successRateEmphasis(successRatePct: number): KpiEmphasis {
  if (successRatePct >= 95) return "emerald";
  if (successRatePct >= 80) return "amber";
  return "rose";
}

export function activeProviderEmphasis(): KpiEmphasis {
  return "emerald";
}

export function downProviderEmphasis(downProviders: number): KpiEmphasis {
  return downProviders > 0 ? "rose" : "emerald";
}
