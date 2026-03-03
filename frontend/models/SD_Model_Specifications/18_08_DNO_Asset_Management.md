# 18.8 DNO Asset Management

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Infrastructure / Energy
- **Simulation Period**: 1900–2100
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Electricity grid component (EGC) lifecycle management for a Distribution Network Operator, with aging infrastructure and replacement planning.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| regular_EGC | 131,508 | components |
| additionally_planned_EGC | 900 | components |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| initial_EGC | 142,000 | components |
| normal_replacement_age | 40 | years |
| percentage_replacement_at_normal_age | 75% | dmnl |
| avg_planning_construction_time | 1 | year |

## Time Series Data
- Historic commissioning: time series with (year, commissioned) couples from 1900–2100

## Sensitivity Analysis
- Vary normal_replacement_age: 30–50 years
- Vary replacement_percentage: 50–100%
- Test proactive vs reactive replacement strategies
- Budget constraint scenarios
