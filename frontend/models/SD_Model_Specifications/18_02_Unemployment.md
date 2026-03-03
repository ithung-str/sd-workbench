# 18.2 Unemployment (Bossel Model)

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Economics / Labor Market
- **Simulation Period**: 0–100 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler
- **Note**: All values relative (Bossel-style)

## Description
Structural unemployment model showing how productivity increases can lead to permanent unemployment despite economic growth, with government intervention through taxation and service employment.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| employment_in_production | 100% | relative |
| employment_in_services | 50% | relative |
| productivity | 100% | relative |
| financial_buffer (state) | implicit | relative |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| productivity_limit | 500% | relative |
| productivity_increase_rate | 10% | 1/yr |
| net_production_jobs_reduction_rate | 10% | 1/yr |
| service_jobs_hiring_rate | 5% | 1/yr |
| potential_labor_force | 1.5 (150%) | relative |
| wage_factor | 25% | dmnl |

## Lookup Tables
### sales_tax_ratio (financial_buffer → sales_tax_rate)
| financial_buffer | sales_tax_rate |
|-----------------|---------------|
| ≤ 0% | 60% |
| 40% | 50% |
| 80% | 40% |
| 120% | 30% |
| ≥ 160% | 20% |

## Key Equations
- state_cash_outflow = wages = wage_factor * employment_in_services * wage_index
- wage_index = productivity
- unemployment = potential_labor_force - employment_in_production - employment_in_services

## Sensitivity Analysis
- Vary productivity_increase_rate: 5–20%
- Vary service_jobs_hiring_rate: 2–10%
- Vary sales_tax lookup: flatten or steepen
