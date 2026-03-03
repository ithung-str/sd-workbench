# 18.9 Fighting HIC on the Regional Level

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Criminology / Policing
- **Simulation Period**: 0–10 years
- **Time Step**: 0.125 year
- **Integration Method**: Euler

## Description
Regional model of High Impact Crime distinguishing between burglary and robbery, with offender dynamics, police-based area intervention (PBA), and criminal adaptation.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| known_offenders | 200 | people |
| unknown_offenders | 750 | people |
| offenders_in_jail | 185 | people |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| offenses_per_known_offender | 2.5 | offenses/yr |
| offenses_per_unknown_offender | 1 | offenses/yr |
| avg_gain_burglary | 600 | EUR |
| catch_rate_burglary | 8% | dmnl |
| avg_gain_robbery | 1,200 | EUR |
| catch_rate_robbery | 33% | dmnl |
| difficulty_robbery_vs_burglary | 10x | dmnl |
| avg_jail_time | 2 | years |
| stop_after_jail | 25% | dmnl |
| new_offenders_growth | 2% | 1/yr |

## PBA (Police-Based Area) Intervention Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| adaptation_time | 0.125 | year |
| effectiveness | 50% | dmnl |
| avg_time_before_quitting_PBA | 0.75 | year |

## Sensitivity Analysis
- Vary PBA effectiveness: 20–80%
- Vary catch_rates: halve and double
- Test combined burglary+robbery interventions
- Vary new_offenders_growth: 0–5%
