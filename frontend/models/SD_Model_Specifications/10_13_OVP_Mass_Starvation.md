# 10.13 OVP Mass Starvation

## Model Metadata
- **Chapter**: 10 – Technical SD Exercises
- **Type**: Technical
- **Domain**: Ecology / Conservation
- **Simulation Period**: 0–50 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Oostvaardersplassen (OVP) nature reserve model of large herbivore population dynamics with starvation due to limited food supply.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| herbivore_population | 100 | animals |
| vegetation | 10,000 | tons |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| births | herbivore_population * birth_rate * food_adequacy | animals/yr |
| deaths | herbivore_population * (normal_death_rate + starvation_rate) | animals/yr |
| vegetation_growth | vegetation * growth_rate * (1 - vegetation / max_vegetation) | tons/yr |
| grazing | herbivore_population * consumption_per_animal | tons/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| birth_rate | 0.3 | 1/yr |
| normal_death_rate | 0.05 | 1/yr |
| consumption_per_animal | 5 | tons/(animal·yr) |
| growth_rate | 0.5 | 1/yr |
| max_vegetation | 15,000 | tons |

## Lookup Tables
- food_adequacy: food_ratio → multiplier on births
- starvation_rate: food_ratio → additional death rate

## Sensitivity Analysis
- Vary initial population: 50–500
- Vary consumption_per_animal: 3–8
- Explore culling policies
