# 14.15 Mineral/Metal Scarcity I

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Resource Economics
- **Simulation Period**: 2000–2100
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Simple model of mineral/metal resource depletion with demand growth, price effects, and initial recycling dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| reserves | 10,000 | tonnes |
| quantity_in_use | 3,000 | tonnes |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| extraction | demand - recycling | tonnes/yr |
| demand | initial_demand * (1 + demand_growth)^t * price_elasticity_effect | tonnes/yr |
| recycling | quantity_scrapped * recycling_fraction | tonnes/yr |
| scrappage | quantity_in_use / avg_product_lifetime | tonnes/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| initial_demand | 400 | tonnes/yr |
| demand_growth | 0.03 | 1/yr |
| avg_product_lifetime | 10 | years |
| initial_recycling_fraction | 0.10 | dmnl |

## Lookup Tables
- price_elasticity_effect: supply_demand_ratio → price_multiplier

## Sensitivity Analysis
- Vary reserves: 5,000–50,000
- Vary demand_growth: 0.01–0.05
- Vary recycling_fraction: 0.05–0.50
