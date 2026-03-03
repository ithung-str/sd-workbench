# 6.1 Cocaine Addicts

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Health / Drug Policy
- **Simulation Period**: 0–20 years
- **Time Step**: 0.25 year (recommended)
- **Integration Method**: Euler

## Description
Simple stock-flow model of cocaine addiction dynamics: light users become heavy users, heavy users may recover or die.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| light_users | 1,000,000 | people |
| heavy_users | 100,000 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| new_light_users | exogenous inflow | people/yr |
| escalation | light_users * escalation_fraction | people/yr |
| quitting_light | light_users * quit_fraction_light | people/yr |
| quitting_heavy | heavy_users * quit_fraction_heavy | people/yr |
| death_heavy | heavy_users * death_fraction_heavy | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| new_light_users | 200,000 | people/yr |
| escalation_fraction | 0.05 | 1/yr |
| quit_fraction_light | 0.1 | 1/yr |
| quit_fraction_heavy | 0.02 | 1/yr |
| death_fraction_heavy | 0.01 | 1/yr |

## Sensitivity Analysis
- Vary escalation_fraction: 0.02–0.10
- Vary quit_fraction_heavy: 0.01–0.05
- Vary new_light_users: 100,000–400,000
