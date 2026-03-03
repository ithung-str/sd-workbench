# 18.5 Prostitution and Human Trafficking

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Social Policy / Law Enforcement
- **Simulation Period**: 2000–2050
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Supply-demand model of prostitution market with links to human trafficking, price dynamics, and policy interventions (legalization, criminalization).

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| sexually_active_adults | 12,000,000 | people |
| children | 4,000,000 | people |
| supply_of_prostitutes | 28,254 (year 2000) | people |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| birth_rate | 17/1000 | 1/yr |
| sexual_lifetime | 45 | years |
| age_of_consent | 18 | years |
| normal_pct_johns | 12% | dmnl |
| avg_naked_costs | 20 | EUR |
| avg_lifetime_in_prostitution | 10 | years |
| clients_per_prostitute | 50 | clients/yr |
| visit_frequency_per_john | 24 | visits/yr |

## Lookup Tables
### price_effect (price → demand_multiplier)
| price (EUR) | demand_multiplier |
|------------|------------------|
| 0 | 4.0 |
| 50 | 1.5 |
| 100 | 1.0 |
| 200 | 0.5 |
| 400 | 0.2 |
| 800 | 0.1 |
| 1200 | 0.1 |

### supply_demand_price_effect (supply/demand ratio → price_multiplier)
| supply/demand | price_multiplier |
|---------------|-----------------|
| 0 | 500% |
| 0.05 | 300% |
| 0.25 | 200% |
| 1 | 100% |
| 2 | 60% |
| 3 | 50% |

## Sensitivity Analysis
- Test legalization vs criminalization of demand
- Vary trafficking enforcement effectiveness
- Vary social stigma effects on supply
