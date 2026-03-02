import type { DashboardCard, DashboardCardType, ModelDocument } from '../types/model';

type TemplateCard = Omit<DashboardCard, 'id' | 'order'>;

export type DashboardTemplate = 'blank' | 'overview' | 'all_variables';

export function generateTemplateCards(model: ModelDocument, template: DashboardTemplate): TemplateCard[] {
  if (template === 'blank') return [];
  if (template === 'overview') return generateOverviewCards(model);
  return generateAllVariablesCards(model);
}

function generateOverviewCards(model: ModelDocument): TemplateCard[] {
  const stocks = model.nodes.filter((n) => n.type === 'stock');
  const cards: TemplateCard[] = [];
  for (const stock of stocks) {
    cards.push({ type: 'kpi', title: `${stock.label} (KPI)`, variable: stock.name });
  }
  for (const stock of stocks) {
    cards.push({ type: 'line', title: `${stock.label} Trend`, variable: stock.name });
  }
  return cards;
}

function generateAllVariablesCards(model: ModelDocument): TemplateCard[] {
  const simulable = model.nodes.filter(
    (n): n is Extract<typeof n, { name: string }> =>
      n.type === 'stock' || n.type === 'aux' || n.type === 'flow',
  );
  return simulable.map((node) => ({
    type: 'line' as DashboardCardType,
    title: node.label,
    variable: node.name,
  }));
}
