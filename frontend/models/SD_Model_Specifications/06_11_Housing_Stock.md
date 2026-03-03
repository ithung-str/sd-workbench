# 6.11 Housing Stock

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Housing / Urban Planning
- **Simulation Period**: 0–50 years
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Stock-flow model of housing supply with construction and demolition, including market-driven construction response to housing shortages.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| housing_stock | 5,000,000 | houses |
| houses_under_construction | 100,000 | houses |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| construction_start | desired_construction * construction_multiplier | houses/yr |
| completion | houses_under_construction / construction_time | houses/yr |
| demolition | housing_stock / avg_housing_lifetime | houses/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| construction_time | 2 | years |
| avg_housing_lifetime | 75 | years |
| desired_construction | 100,000 | houses/yr |
| housing_demand_growth | 0.01 | 1/yr |

## Lookup Tables
- construction_multiplier: housing_shortage_ratio → multiplier

## Sensitivity Analysis
- Vary construction_time: 1–4
- Vary avg_housing_lifetime: 50–100
