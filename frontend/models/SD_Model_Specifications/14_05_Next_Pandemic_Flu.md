# 14.5 Next Pandemic Shock (Flu)

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Epidemiology / Public Health
- **Simulation Period**: 0–2 years
- **Time Step**: 0.01 year (~3.6 days)
- **Integration Method**: Euler

## Description
SIR-based pandemic influenza model for the Netherlands, including quarantine and vaccination policies.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| susceptible | 16,000,000 | people |
| infected | 100 | people |
| recovered | 0 | people |
| dead | 0 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| infection | susceptible * contact_rate * infected / total_pop * infectivity | people/yr |
| recovery | infected * (1 - case_fatality_rate) / illness_duration | people/yr |
| death | infected * case_fatality_rate / illness_duration | people/yr |
| vaccination | vaccination_rate (policy) | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| contact_rate | 500 | contacts/(person·yr) |
| infectivity | 0.02 | dmnl |
| illness_duration | 0.02 | year (~7 days) |
| case_fatality_rate | 0.02 | dmnl |

## Sensitivity Analysis
- Vary contact_rate: 200–1000
- Vary case_fatality_rate: 0.001–0.10
- Test vaccination timing and capacity
- Test quarantine effectiveness
