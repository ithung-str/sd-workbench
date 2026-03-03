# 14.13 Production Management

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Operations Management
- **Simulation Period**: 0–52 weeks
- **Time Step**: 1 week
- **Integration Method**: Euler

## Description
Production-inventory management model with workforce adjustment, production capacity constraints, and demand forecasting.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| inventory | 400 | units |
| workforce | 100 | workers |
| backlog | 0 | units |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| production | workforce * productivity | units/wk |
| shipments | MIN(inventory, demand + backlog) | units/wk |
| hiring | (desired_workforce - workforce) / hiring_time | workers/wk |
| firing | (workforce - desired_workforce) / firing_time | workers/wk |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| productivity | 10 | units/(worker·wk) |
| desired_inventory_coverage | 4 | weeks |
| hiring_time | 4 | weeks |
| firing_time | 8 | weeks |
| demand_forecast_smoothing | 4 | weeks |

## Sensitivity Analysis
- Vary demand patterns (step, seasonal, random)
- Vary hiring_time: 2–12 weeks
- Vary desired_inventory_coverage: 2–8 weeks
