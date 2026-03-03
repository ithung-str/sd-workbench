# 18.18 Antibiotic Resistance

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Public Health / Microbiology
- **Simulation Period**: 0–50 years
- **Time Step**: 1 day (0.00274 year)
- **Integration Method**: Euler

## Description
Model of antibiotic resistance emergence with three bug populations (susceptible, intermediate-resistant, highly-resistant) competing within an ecological niche.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| S_bugs (susceptible) | ~68.5% of niche | fraction |
| IR_bugs (intermediate resistant) | 1.5% | fraction |
| HR_bugs (highly resistant) | 0% | fraction |
| total_bugs_initial | 70% of niche | fraction |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| max_proliferation_ratio_HR | 1.151 | dmnl |
| max_proliferation_ratio_IR | 1.159 | dmnl |
| max_proliferation_ratio_S | 1.23 | dmnl |
| bug_elimination_days | 36 | days |
| IR_to_HR_mutation_rate | 0.25% | 1/yr |
| S_to_IR_mutation_rate | 0.05% | 1/yr |

## Time Series Data
- Extensive LOOKUP BACKWARD time series for antibiotic prescriptions
- Country-specific resistance data: USA, Spain, Hungary, South Africa

## Key Dynamics
- Susceptible bugs reproduce faster but are killed by antibiotics
- Resistant bugs survive antibiotics but reproduce slower
- Mutations gradually increase resistance
- Antibiotic use selects for resistant strains

## Sensitivity Analysis
- Vary antibiotic prescription rates: 50–200% of current
- Vary mutation rates: 0.01–1%
- Test antibiotic cycling policies
- Compare country-specific scenarios
