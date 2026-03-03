# 14.16 Radicalization and Deradicalization

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Social Science / Security
- **Simulation Period**: 0–50 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Model of radicalization processes in a population with stages from moderate to radical, including deradicalization interventions.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| moderates | 15,000,000 | people |
| sympathizers | 500,000 | people |
| radicals | 10,000 | people |
| active_extremists | 500 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| radicalization_1 | moderates * contact_with_radical_ideas * susceptibility | people/yr |
| radicalization_2 | sympathizers * deepening_rate | people/yr |
| radicalization_3 | radicals * recruitment_rate | people/yr |
| deradicalization | various stocks * derad_rate * program_effectiveness | people/yr |

## Sensitivity Analysis
- Vary contact_with_radical_ideas (internet, social media effects)
- Vary deradicalization program investment
- Test trigger event impacts
