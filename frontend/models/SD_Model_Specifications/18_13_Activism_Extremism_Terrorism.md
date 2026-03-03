# 18.13 Activism, Extremism and Terrorism

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Social Science / Security
- **Simulation Period**: 1980–2080
- **Time Step**: 0.25 year
- **Integration Method**: Euler
- **Total Population**: 16,000,000 (Netherlands, 1980)

## Description
Multi-stage radicalization model from unconvinced citizens through convinced, activist, to extremist stages with frustration-driven dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| citizens_cannot_be_convinced | 3,000,000 | people |
| unconvinced | 12,900,000 | people |
| convinced | 100,000 | people |
| activists | 0 | people |
| extremists | 0 | people |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| persuasion_rate | 1% | dmnl |
| normal_contact_rate | 1,000 | contacts/yr |
| avg_transition_time | 10 | years |
| potential_fraction_activists | 5% | dmnl |
| potential_fraction_extremists | 5% | dmnl |

## Lookup Tables
### frustration_through_marginalization (minority_fraction → frustration)
| minority_fraction | frustration_multiplier |
|-------------------|----------------------|
| 0 | 1.0 |
| 0.025 | 0.50 |
| 0.10 | 0.20 |
| 0.25 | 0.04 |
| 0.5 | 0 |
| 1.0 | 0 |

## Time-Varying Parameters
- Societal acceptance threshold: decreasing from 100 (1980) to 10 (2080)

## Sensitivity Analysis
- Vary persuasion_rate: 0.5–5%
- Vary societal acceptance threshold trajectory
- Test deradicalization program effectiveness
