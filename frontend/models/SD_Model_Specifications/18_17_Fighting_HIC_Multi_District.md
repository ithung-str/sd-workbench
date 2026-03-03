# 18.17 Fighting HIC across Multiple Districts

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Criminology / Policing
- **Simulation Period**: 0–10 years
- **Time Step**: 0.125 year
- **Integration Method**: Euler

## Description
Multi-district crime model showing waterbed effects when police interventions in one district push crime to neighboring districts.

## District 1 (Urban)
| Parameter | Value | Unit |
|-----------|-------|------|
| houses | 5,000 | houses |
| initial_protected_fraction | 3% | dmnl |
| avg_chance_burglary | 3% | 1/yr |
| initial_recent_burglaries | 175 | burglaries |
| normal_preventive_behavior | 50% | dmnl |
| obsolescence_security | 10 | years |
| familiarity_criminals | 100% | dmnl |

## District 2 (Suburban)
| Parameter | Value | Unit |
|-----------|-------|------|
| houses | 1,000 | houses |
| initial_protected_fraction | 6% | dmnl |
| purchasing_power | 200% | relative |
| familiarity_criminals | 25% | dmnl |
| initial_recent_burglaries | 20 | burglaries |

## Key Dynamics
- Criminals choose districts based on expected gain and familiarity
- Security investments by homeowners respond to recent burglary rates
- Police interventions in one district cause displacement to others

## Sensitivity Analysis
- Vary police allocation between districts
- Vary familiarity_criminals: 10–100%
- Test coordinated vs independent district policing
