# 18.22 Collapse of Civilizations (Maya)

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Archaeology / Sustainability
- **Simulation Period**: 1000 BC – 1000 AD
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Model of Maya civilization collapse through population overshoot, deforestation, soil degradation, and agricultural decline.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| population | 100,000 (1000 BC) | people |
| agricultural_land | 8 | km² |
| forest | 5,000 | km² |
| fertility_of_land | 5,000,000 | kg/(km²·yr) |

## Historical Reference
- Population doubles every 408 years: 100,000 (1000 BC) → 2,000,000 (800 AD)

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| consumed_food_per_person | 400 | kg/yr |
| food_capacity | 40,000,000 | kg |
| emigration_ratio | 5% | dmnl |
| intensity | 1 (initial) | dmnl |

## Key Equations
- fertility_losses = fertility * MIN(2, (agricultural_land / forest)^x) / intensity
- Agricultural land expands by clearing forest when food is insufficient
- Deforestation degrades soil fertility

## Sensitivity Analysis
- Vary deforestation rate
- Vary fertility_loss_exponent (x)
- Test agricultural intensification (intensity parameter)
- Vary emigration_ratio: 0–15%
