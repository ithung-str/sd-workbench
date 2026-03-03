# 18.7 Real Estate Boom and Bust (Dubai)

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Real Estate / Economics
- **Simulation Period**: 0–120 months (10 years)
- **Time Step**: 0.25 month
- **Integration Method**: Euler

## Description
Model of Dubai's real estate market dynamics: construction booms driven by immigration, speculation, and investment creating potential bust cycles.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| REU_supply | 1,800,000 | real estate units |
| REU_under_construction | 0 | REU |
| locals | 220,000 | people |
| immigrants | 2,000,000 | people |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| avg_REU_lifetime | 500 | months |
| REU_construction_time | 3 | months |
| workers_per_REU_construction | 25 | workers/REU |
| avg_immigration_time | 1 | month |
| avg_emigration_time | 1 | month |
| immigrant_integration_rate | 0.1% | 1/month |
| normal_immigrant_salary | 1,000 | USD/month |
| normal_REU_cost | 50,000 | USD |
| investment_ratio | 1% | dmnl |

## Time-Varying Parameters
- REU_demand_per_person: linearly 1 → 2 over 120 months

## Lookup Tables
### REU_shortage_price_effect (shortage_percentage → price_multiplier)
| shortage (%) | price_multiplier |
|-------------|-----------------|
| 0 | 0.6 |
| 10 | 4.0 |
| 50 | 7.5 |
| 100 | 10.0 |

## Sensitivity Analysis
- Vary investment_ratio: 0–5%
- Vary construction_time: 1–12 months
- Vary immigration response to economic conditions
- Test external shock (sudden demand drop)
