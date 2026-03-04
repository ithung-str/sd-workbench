/**
 * Catalog of SD model specification files that can be built via the AI tool.
 * Specs are grouped by chapter/difficulty level.
 */

export interface SpecEntry {
  id: string;
  title: string;
  chapter: string;
  group: string;
  filename: string;
}

export const specEntries: SpecEntry[] = [
  // Chapter 6 — Introductory
  { id: '06_01', title: 'Cocaine Addicts', chapter: '6', group: 'Introductory', filename: '06_01_Cocaine_Addicts.md' },
  { id: '06_02', title: 'Muskrat Population', chapter: '6', group: 'Introductory', filename: '06_02_Muskrat_Population.md' },
  { id: '06_03', title: 'Population Overshoot', chapter: '6', group: 'Introductory', filename: '06_03_Population_Overshoot.md' },
  { id: '06_04', title: 'Population Aging', chapter: '6', group: 'Introductory', filename: '06_04_Population_Aging.md' },
  { id: '06_05', title: 'Feral Pig Eradication', chapter: '6', group: 'Introductory', filename: '06_05_Feral_Pig_Eradication.md' },
  { id: '06_06', title: 'Arms Race', chapter: '6', group: 'Introductory', filename: '06_06_Arms_Race.md' },
  { id: '06_07', title: 'Family Planning', chapter: '6', group: 'Introductory', filename: '06_07_Family_Planning.md' },
  { id: '06_08', title: 'Pneumonic Plague', chapter: '6', group: 'Introductory', filename: '06_08_Pneumonic_Plague.md' },
  { id: '06_09', title: 'SD Education Diffusion', chapter: '6', group: 'Introductory', filename: '06_09_SD_Education_Diffusion.md' },
  { id: '06_10', title: 'Micro-CHP Diffusion', chapter: '6', group: 'Introductory', filename: '06_10_MicroCHP_Diffusion.md' },
  { id: '06_11', title: 'Housing Stock', chapter: '6', group: 'Introductory', filename: '06_11_Housing_Stock.md' },
  // Chapter 10 — Physics
  { id: '10_11', title: 'Mass-Spring System', chapter: '10', group: 'Physics', filename: '10_11_Mass_Spring_System.md' },
  { id: '10_12', title: 'Gas in Vessel', chapter: '10', group: 'Physics', filename: '10_12_Gas_in_Vessel.md' },
  { id: '10_13', title: 'OVP Mass Starvation', chapter: '10', group: 'Physics', filename: '10_13_OVP_Mass_Starvation.md' },
  // Chapter 14 — Simple Cases
  { id: '14_01', title: 'Managing a Faculty', chapter: '14', group: 'Simple Cases', filename: '14_01_Managing_a_Faculty.md' },
  { id: '14_02', title: 'Supply Chain (Beer Game)', chapter: '14', group: 'Simple Cases', filename: '14_02_Supply_Chain_Beer_Game.md' },
  { id: '14_03', title: 'Debt Crisis', chapter: '14', group: 'Simple Cases', filename: '14_03_Debt_Crisis.md' },
  { id: '14_04', title: 'Miniworld (Bossel)', chapter: '14', group: 'Simple Cases', filename: '14_04_Miniworld_Bossel.md' },
  { id: '14_05', title: 'Next Pandemic Flu', chapter: '14', group: 'Simple Cases', filename: '14_05_Next_Pandemic_Flu.md' },
  { id: '14_06', title: 'New Town Planning', chapter: '14', group: 'Simple Cases', filename: '14_06_New_Town_Planning.md' },
  { id: '14_07', title: 'Tolerance, Hate & Aggression', chapter: '14', group: 'Simple Cases', filename: '14_07_Tolerance_Hate_Aggression.md' },
  { id: '14_08', title: 'EVs & Lithium Scarcity', chapter: '14', group: 'Simple Cases', filename: '14_08_EVs_Lithium_Scarcity.md' },
  { id: '14_09', title: 'Cholera in Accra', chapter: '14', group: 'Simple Cases', filename: '14_09_Cholera_in_Accra.md' },
  { id: '14_10', title: 'Bank Run (Fortis)', chapter: '14', group: 'Simple Cases', filename: '14_10_Signalled_Bank_Run_Fortis.md' },
  { id: '14_11', title: 'Fighting HIC (National)', chapter: '14', group: 'Simple Cases', filename: '14_11_Fighting_HIC_National.md' },
  { id: '14_12', title: 'Overfishing Bluefin Tuna', chapter: '14', group: 'Simple Cases', filename: '14_12_Overfishing_Bluefin_Tuna.md' },
  { id: '14_13', title: 'Production Management', chapter: '14', group: 'Simple Cases', filename: '14_13_Production_Management.md' },
  { id: '14_14', title: 'Social Housing', chapter: '14', group: 'Simple Cases', filename: '14_14_Social_Housing_Redevelopment.md' },
  { id: '14_15', title: 'Mineral/Metal Scarcity I', chapter: '14', group: 'Simple Cases', filename: '14_15_Mineral_Metal_Scarcity_I.md' },
  { id: '14_16', title: 'Radicalization', chapter: '14', group: 'Simple Cases', filename: '14_16_Radicalization_Deradicalization.md' },
  // Chapter 18 — Intermediate Cases
  { id: '18_02', title: 'Unemployment', chapter: '18', group: 'Intermediate', filename: '18_02_Unemployment.md' },
  { id: '18_03', title: 'Hospital Management', chapter: '18', group: 'Intermediate', filename: '18_03_Hospital_Management.md' },
  { id: '18_04', title: 'Deer (Kaibab Plateau)', chapter: '18', group: 'Intermediate', filename: '18_04_Deer_Kaibab_Plateau.md' },
  { id: '18_05', title: 'Prostitution & Trafficking', chapter: '18', group: 'Intermediate', filename: '18_05_Prostitution_Human_Trafficking.md' },
  { id: '18_06', title: 'Seasonal Flu (SEIRS)', chapter: '18', group: 'Intermediate', filename: '18_06_Seasonal_Flu.md' },
  { id: '18_07', title: 'Real Estate Dubai', chapter: '18', group: 'Intermediate', filename: '18_07_Real_Estate_Dubai.md' },
  { id: '18_08', title: 'DNO Asset Management', chapter: '18', group: 'Intermediate', filename: '18_08_DNO_Asset_Management.md' },
  { id: '18_09', title: 'Fighting HIC (Regional)', chapter: '18', group: 'Intermediate', filename: '18_09_Fighting_HIC_Regional.md' },
  { id: '18_11', title: 'Carbon & Climate Change', chapter: '18', group: 'Intermediate', filename: '18_11_Carbon_Climate_Change.md' },
  { id: '18_12', title: 'Bank Run (DSB)', chapter: '18', group: 'Intermediate', filename: '18_12_Orchestrated_Bank_Run_DSB.md' },
  { id: '18_13', title: 'Activism & Terrorism', chapter: '18', group: 'Intermediate', filename: '18_13_Activism_Extremism_Terrorism.md' },
  { id: '18_14', title: 'Project Management', chapter: '18', group: 'Intermediate', filename: '18_14_Project_Management.md' },
  { id: '18_15', title: 'Mineral/Metal Scarcity II', chapter: '18', group: 'Intermediate', filename: '18_15_Mineral_Metal_Scarcity_II.md' },
  { id: '18_16', title: 'Energy Transition', chapter: '18', group: 'Intermediate', filename: '18_16_Energy_Transition.md' },
  { id: '18_17', title: 'Fighting HIC (Multi-District)', chapter: '18', group: 'Intermediate', filename: '18_17_Fighting_HIC_Multi_District.md' },
  { id: '18_18', title: 'Antibiotic Resistance', chapter: '18', group: 'Intermediate', filename: '18_18_Antibiotic_Resistance.md' },
  { id: '18_19', title: 'Globalization', chapter: '18', group: 'Intermediate', filename: '18_19_Globalization_Liberalization.md' },
  { id: '18_20', title: 'Higher Education', chapter: '18', group: 'Intermediate', filename: '18_20_Higher_Education_Stimuli.md' },
  { id: '18_21', title: 'Financial Turmoil & Housing', chapter: '18', group: 'Intermediate', filename: '18_21_Financial_Turmoil_Housing.md' },
  { id: '18_22', title: 'Collapse of Civilizations (Maya)', chapter: '18', group: 'Intermediate', filename: '18_22_Collapse_of_Civilizations_Maya.md' },
  // Chapter 22 — Advanced Cases
  { id: '22_01', title: 'Food or Energy', chapter: '22', group: 'Advanced', filename: '22_01_Food_or_Energy.md' },
  { id: '22_02', title: 'Cod or Not', chapter: '22', group: 'Advanced', filename: '22_02_Cod_or_Not.md' },
  { id: '22_03', title: 'Wind Force 12', chapter: '22', group: 'Advanced', filename: '22_03_Wind_Force_12.md' },
  { id: '22_04', title: 'Strategic Management', chapter: '22', group: 'Advanced', filename: '22_04_Strategic_Management_Leadership.md' },
  { id: '22_05', title: 'Evidence-Based HIC', chapter: '22', group: 'Advanced', filename: '22_05_Evidence_Based_HIC.md' },
  { id: '22_06', title: 'Heroin', chapter: '22', group: 'Advanced', filename: '22_06_Heroin.md' },
];

/** Load spec markdown files eagerly via Vite glob import (as raw strings). */
const specModules = import.meta.glob(
  '/models/SD_Model_Specifications/*.md',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Resolve a spec entry's filename to its markdown content. */
export function loadSpecContent(entry: SpecEntry): string | null {
  const key = `/models/SD_Model_Specifications/${entry.filename}`;
  return specModules[key] ?? null;
}

/** Get unique groups in display order. */
export function specGroups(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of specEntries) {
    if (!seen.has(e.group)) {
      seen.add(e.group);
      result.push(e.group);
    }
  }
  return result;
}
