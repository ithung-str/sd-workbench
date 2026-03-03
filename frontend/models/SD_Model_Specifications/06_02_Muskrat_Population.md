# 6.2 Muskrat Population

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Ecology / Population Dynamics
- **Simulation Period**: 0–50 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Logistic population growth model for muskrats with carrying capacity constraint.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| muskrat_population | 100 | muskrats |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| births | muskrat_population * birth_rate * (1 - muskrat_population / carrying_capacity) | muskrats/yr |
| deaths | muskrat_population * death_rate | muskrats/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| birth_rate | 0.5 | 1/yr |
| death_rate | 0.1 | 1/yr |
| carrying_capacity | 10,000 | muskrats |

## Sensitivity Analysis
- Vary carrying_capacity: 5,000–20,000
- Vary birth_rate: 0.3–0.7
