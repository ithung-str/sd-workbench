# 18.6 Seasonal Flu (SEIRS Model)

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Epidemiology
- **Simulation Period**: 0–10 years
- **Time Step**: 0.005 year (~2 days)
- **Integration Method**: Euler
- **Total Population**: 885,000,000 (Europe)

## Description
SEIRS seasonal influenza model for Europe with waning immunity, seasonal variation in immunity, and symptomatic/asymptomatic pathways.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| susceptible | 750,000,000 | people |
| exposed | 100,000 | people |
| infected_symptomatic | 0 | people |
| infected_asymptomatic | 0 | people |
| immune | 135,000,000 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| exposure | susceptible * contact_rate * infected_fraction * infection_rate | people/month |
| becoming_symptomatic | exposed * percentage_symptomatic / time_before_symptoms | people/month |
| becoming_asymptomatic | exposed * (1 - percentage_symptomatic) / time_before_symptoms | people/month |
| recovery | infected / duration_illness | people/month |
| death | infected_symptomatic * CFR / duration_illness | people/month |
| immunity_waning | immune / recovered_to_susceptible_delay | people/month |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| infection_rate | 5% | dmnl |
| percentage_symptomatic | 66% | dmnl |
| decrease_contact_rate_symptomatic | 50% | dmnl |
| time_before_symptoms | 0.06 | months |
| case_fatality_rate (CFR) | 0.1% | dmnl |
| duration_illness | 0.18 | months |
| recovered_to_susceptible_delay | 6 | months |

## Lookup Tables
### contact_rate (infected_fraction → contacts)
| infected_fraction | contact_rate |
|-------------------|-------------|
| 0 | 500 |
| 0.2 | 450 |
| 0.5 | 300 |
| 0.75 | 255 |
| 1.0 | 250 |

### seasonal_immunity
- Sinusoidal: 16% in January → 84% in July

## Sensitivity Analysis
- Vary infection_rate: 2–10%
- Vary CFR: 0.01–1%
- Vary seasonal amplitude
- Test vaccination campaign timing
