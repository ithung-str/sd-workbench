# 18.15 Mineral/Metal Scarcity II

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Resource Economics
- **Simulation Period**: 2000–2100
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Extended mineral scarcity model with endogenous price effects, exploitation costs, and evolving recycling technology.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| reserves | 10,000 | tonnes |
| supply_of_metal_X | matched to demand | tonnes/yr |
| quantity_in_use | 3,000 | tonnes |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| initial_demand | 400 | tonnes/yr |
| avg_product_lifetime | 10 | years |
| production_time | 1 | year |
| recycling_time | 1 | year |
| expected_demand_growth | 3% | 1/yr |

## Lookup Tables
### supply_shortage_price_effect (supply/demand → price_multiplier)
| supply/demand | price_multiplier |
|---------------|-----------------|
| 0 | 0.1 |
| 1 | 1 |
| 1.5 | 2 |
| 2 | 10 |
| 5 | 100 |

### relative_exploitation_cost (reserves_fraction → cost_multiplier)
| reserves/initial_reserves | cost_multiplier |
|---------------------------|----------------|
| 0 | 100 |
| 0.05 | 2.5 |
| 0.10 | 1.25 |
| 0.15 | 1.1 |
| 0.20 | 1.0 |
| 0.25 | 1.0 |

## Time-Varying Parameters
- Recycling fraction availability: increasing from 10% (2000) to 90% (2040)

## Sensitivity Analysis
- Vary initial reserves: 5,000–50,000
- Vary demand_growth: 1–5%
- Vary recycling trajectory
- Test substitution possibilities
