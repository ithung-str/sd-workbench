# 14.9 Cholera in Accra

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Epidemiology / Public Health
- **Simulation Period**: 0–1 year
- **Time Step**: 0.01 year
- **Integration Method**: Euler

## Description
SIRW (Susceptible-Infected-Recovered-Water) cholera model for Accra, Ghana, including waterborne transmission pathway.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| susceptible | 2,000,000 | people |
| infected | 100 | people |
| recovered | 0 | people |
| bacteria_in_water | 0 | cells/ml |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| infection_direct | contact-based transmission | people/yr |
| infection_water | susceptible * water_exposure * bacteria_concentration_effect | people/yr |
| recovery | infected / duration_of_illness | people/yr |
| bacteria_shedding | infected * shedding_rate | cells/(ml·yr) |
| bacteria_decay | bacteria_in_water / bacteria_lifetime | cells/(ml·yr) |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| duration_of_illness | 0.014 | year (~5 days) |
| case_fatality_rate | 0.02 | dmnl |
| bacteria_lifetime | 0.08 | year (~30 days) |

## Sensitivity Analysis
- Vary water treatment effectiveness
- Vary sanitation infrastructure quality
- Test oral rehydration therapy availability
