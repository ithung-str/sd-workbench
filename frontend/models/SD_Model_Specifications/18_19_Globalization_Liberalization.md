# 18.19 Globalization and Liberalization

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: International Economics
- **Simulation Period**: 0–100 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler
- **Note**: All values relative

## Description
Two-country model of trade liberalization effects on production capacity, standards, prices, and welfare convergence/divergence.

## Stocks (per country)
| Stock | Initial Value (Country I) | Initial Value (Country II) | Unit |
|-------|--------------------------|---------------------------|------|
| production_capacity | 100% | 10% | relative |
| standards | 100% | 10% | relative |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| depreciation_rate | 5% | 1/yr |
| investment_rate | 10% | 1/yr |
| tax_rate | 20% | dmnl |
| reference_price | 5 | relative |
| standard_factor | 100% | relative |
| deterioration_rate_standards | 5% | 1/yr |
| trade_liberalization_time | 10 | year (exogenous) |

## Lookup Tables
### purchase_decision (relative_price → purchase_fraction)
| relative_price | purchase_fraction |
|---------------|------------------|
| 0 | 1.0 |
| 0.5 | 1.0 |
| 1.0 | 0.5 |
| 1.5 | 0 |
| 2.0 | 0 |
| 5.0 | 0 |

## Sensitivity Analysis
- Vary liberalization timing: immediate vs gradual
- Vary initial capacity ratio between countries
- Test tariff vs free trade scenarios
- Vary standard_factor effects
