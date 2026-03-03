# 14.11 Fighting High Impact Crime (National Level)

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Criminology / Public Safety
- **Simulation Period**: 0–20 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
National-level model of High Impact Crime (burglary, robbery) with offender dynamics, policing, and incarceration.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| active_offenders | 20,000 | people |
| offenders_in_prison | 5,000 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| new_offenders | inflow_rate | people/yr |
| arrests | active_offenders * arrest_rate | people/yr |
| releases | offenders_in_prison / avg_sentence_length | people/yr |
| desistance | active_offenders * desistance_rate | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| arrest_rate | 0.10 | 1/yr |
| avg_sentence_length | 2 | years |
| desistance_rate | 0.05 | 1/yr |
| offenses_per_offender | 5 | offenses/(person·yr) |

## Sensitivity Analysis
- Vary arrest_rate: 0.05–0.25
- Vary avg_sentence_length: 0.5–5
- Test preventive policing strategies
