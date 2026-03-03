# 6.8 Pneumonic Plague (SIR Model)

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Epidemiology
- **Simulation Period**: 0–1 year
- **Time Step**: 0.01 year
- **Integration Method**: Euler

## Description
SIR epidemic model for pneumonic plague with high infectivity and case fatality rate.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| susceptible | 9,999 | people |
| infected | 1 | people |
| recovered | 0 | people |
| dead | 0 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| infection | susceptible * infected * contact_rate * infectivity / total_pop | people/yr |
| recovery | infected * recovery_fraction / duration | people/yr |
| death_from_disease | infected * (1 - recovery_fraction) / duration | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| contact_rate | 365 | contacts/(person·yr) |
| infectivity | 0.03 | dmnl |
| duration | 0.02 | year (~7 days) |
| recovery_fraction | 0.05 | dmnl |

## Sensitivity Analysis
- Vary contact_rate: 100–500
- Vary infectivity: 0.01–0.10
- Vary recovery_fraction: 0.01–0.20
