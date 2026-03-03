# 6.3 Population Overshoot and Collapse

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Ecology / Population-Resource Dynamics
- **Simulation Period**: 0–100 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Population growing on a renewable resource that can be depleted, leading to overshoot and collapse dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| population | 100 | individuals |
| resource | 10,000 | units |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| births | population * normal_birth_rate * resource_multiplier | individuals/yr |
| deaths | population * normal_death_rate / resource_multiplier | individuals/yr |
| regeneration | resource * regeneration_rate * (1 - resource / max_resource) | units/yr |
| consumption | population * consumption_per_capita | units/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| normal_birth_rate | 0.05 | 1/yr |
| normal_death_rate | 0.02 | 1/yr |
| regeneration_rate | 0.1 | 1/yr |
| max_resource | 10,000 | units |
| consumption_per_capita | 1 | units/(individual·yr) |

## Lookup Tables
- resource_multiplier: resource/initial_resource → multiplier on birth/death

## Sensitivity Analysis
- Vary consumption_per_capita: 0.5–2.0
- Vary regeneration_rate: 0.05–0.20
