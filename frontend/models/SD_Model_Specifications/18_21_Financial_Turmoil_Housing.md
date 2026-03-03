# 18.21 Financial Turmoil on the Housing Market

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Real Estate / Finance
- **Simulation Period**: 1985–2085
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Dutch housing market model with financial sector feedback: mortgage lending, house prices, construction cycles, and financial crisis dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| new_houses | 1,500,000 | houses |
| old_houses | 3,665,000 | houses |
| houses_in_construction | 175,000 | houses |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| life_as_new | 15 | years |
| avg_life_old | 60 | years |
| initial_avg_construction_cost | 95,000 | EUR |
| initial_avg_salary | 27,000 | EUR/yr |
| inflation | 2% | 1/yr |

## Time Series Data
- Estimated households: 5.43M (1985) → 9M (2085)
- normal_salary_loan_multiplier: linearly 3 → 6 (1985–2011), then declining

## Lookup Tables
### planning_construction_time (shortage/surplus → time_multiplier)
| supply/demand ratio | time_multiplier |
|--------------------|----------------|
| 1 | 1.0 |
| 2 | 1.5 |
| 5 | 2.5 |
| 9 | 4.5 |
| 20 | 0.75 |

### profitability_multiplier (profit_margin → construction_multiplier)
| profit_margin | construction_multiplier |
|--------------|------------------------|
| -100% | 0 |
| -50% | 0.01 |
| -20% | 0.02 |
| -10% | 0.2 |
| 0% | 0.8 |
| 10% | 1.0 |
| 20% | 1.1 |
| 50% | 1.2 |
| 100% | 1.25 |

## Sensitivity Analysis
- Vary salary_loan_multiplier trajectory (credit loosening/tightening)
- Vary inflation: 0–5%
- Test interest rate shocks
- Test housing demand growth scenarios
