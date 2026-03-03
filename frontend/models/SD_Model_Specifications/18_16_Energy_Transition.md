# 18.16 Energy Transition Management

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Energy / Technology Policy
- **Simulation Period**: 2010–2100
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Two-technology energy transition model with learning curves, where an incumbent technology (T1) competes with a new renewable (T2) for planned capacity expansion.

## Technology 1 (Incumbent)
### Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| installed_capacity_T1 | 15,000 | MW |
| capacity_under_construction_T1 | 700 | MW |
| planned_capacity_T1 | 700 | MW |
| cumulative_decommissioned_T1 | 10,000,000 | MW |

### Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| avg_construction_time | 1 | year |
| planning_period | 1 | year |
| lifetime_T1 | 30 | years |
| progress_ratio_T1 | 0.9 | dmnl |
| initial_marginal_cost_T1 | 1,000,000 | EUR/MW |

## Technology 2 (New Renewable)
### Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| installed_capacity_T2 | 3 | MW |
| capacity_under_construction_T2 | 1 | MW |
| cumulative_decommissioned_T2 | 10 | MW |

### Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| progress_ratio_T2 | 0.8 | dmnl |
| initial_marginal_cost_T2 | 8,000,000 | EUR/MW |

## Time-Varying Parameters
- Expected total capacity: linearly 15,700 → 45,000 MW (2010–2100)

## Key Equations
- Learning curve: cost = initial_cost * (cumulative_production / initial_cumulative)^(log2(progress_ratio))
- Investment allocation: based on relative costs of T1 vs T2

## Sensitivity Analysis
- Vary progress_ratio_T2: 0.7–0.9
- Vary initial_marginal_cost_T2: 4M–16M EUR/MW
- Test subsidy policies for T2
- Test carbon tax on T1
