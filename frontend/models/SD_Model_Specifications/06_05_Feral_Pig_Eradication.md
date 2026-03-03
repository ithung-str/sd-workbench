# 6.5 Feral Pig Eradication

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Ecology / Wildlife Management
- **Simulation Period**: 0–30 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Managing an invasive feral pig population through hunting/eradication policies with logistic growth dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| feral_pig_population | 5,000 | pigs |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| births | feral_pig_population * growth_rate * (1 - feral_pig_population / carrying_capacity) | pigs/yr |
| natural_deaths | feral_pig_population * natural_death_rate | pigs/yr |
| eradication | eradication_effort * eradication_effectiveness | pigs/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| growth_rate | 0.5 | 1/yr |
| carrying_capacity | 50,000 | pigs |
| natural_death_rate | 0.1 | 1/yr |
| eradication_effort | varies (policy) | hunters |
| eradication_effectiveness | varies | pigs/(hunter·yr) |

## Sensitivity Analysis
- Vary growth_rate: 0.3–0.8
- Vary eradication strategies: intensity and timing
