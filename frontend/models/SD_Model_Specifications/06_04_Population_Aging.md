# 6.4 Population Aging (Aging Chain)

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Demography
- **Simulation Period**: 0–100 years
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Age-structured population model with three cohorts (children, adults, elderly) forming an aging chain.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| children_0_17 | 3,000,000 | people |
| adults_18_64 | 9,000,000 | people |
| elderly_65_plus | 2,000,000 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| births | adults_18_64 * birth_rate | people/yr |
| maturing | children_0_17 / avg_childhood_duration | people/yr |
| aging | adults_18_64 / avg_adult_duration | people/yr |
| deaths_children | children_0_17 * death_rate_children | people/yr |
| deaths_adults | adults_18_64 * death_rate_adults | people/yr |
| deaths_elderly | elderly_65_plus * death_rate_elderly | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| birth_rate | 0.012 | 1/yr |
| avg_childhood_duration | 18 | years |
| avg_adult_duration | 47 | years |
| death_rate_children | 0.002 | 1/yr |
| death_rate_adults | 0.005 | 1/yr |
| death_rate_elderly | 0.05 | 1/yr |

## Sensitivity Analysis
- Vary birth_rate: 0.008–0.020
- Vary death_rate_elderly: 0.03–0.08
