# 6.7 Family Planning

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Demography / Public Health
- **Simulation Period**: 0–50 years
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Model of family planning impact on population growth through contraception adoption and fertility reduction.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| population | 10,000,000 | people |
| contraception_adopters | 0 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| births | population * birth_rate * (1 - fraction_using_contraception * effectiveness) | people/yr |
| deaths | population * death_rate | people/yr |
| adoption | (population - contraception_adopters) * adoption_rate | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| birth_rate | 0.04 | 1/yr |
| death_rate | 0.015 | 1/yr |
| adoption_rate | 0.05 | 1/yr |
| effectiveness | 0.8 | dmnl |

## Sensitivity Analysis
- Vary adoption_rate: 0.01–0.10
- Vary effectiveness: 0.5–0.95
