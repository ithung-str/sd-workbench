# 22.5 Evidence-Based Fight against HIC across Districts

## Model Metadata
- **Chapter**: 22 – Advanced SD Cases
- **Type**: Advanced Case
- **Domain**: Criminology / Evidence-Based Policing
- **Simulation Period**: 0–10 years
- **Time Step**: 0.125 year
- **Integration Method**: Euler

## Description
Comprehensive HIC model merging cases 14.11, 18.9, and 18.17 into a single subscripted model for 20 districts and 3 base teams, with different criminal types, motives, judicial chain, and real data linkage via Excel.

## Structure
- Merges national (14.11), regional (18.9), and multi-district (18.17) models
- Subscripted for 20 districts × 3 base teams = 60 units
- Extended judicial chain submodel
- Different criminal types with different motives
- Random processes with randomizers replicating real data properties

## Key Components
1. Offender dynamics (known/unknown offenders, multiple types)
2. Crime occurrence (burglary, robbery with different characteristics)
3. Police capacity and allocation across districts
4. Judicial chain (arrest → prosecution → conviction → incarceration → release)
5. Criminal adaptation to police interventions
6. Waterbed effects between districts

## Data Integration
- Linked to Excel file with real data for 20 districts and 3 base teams

## Sensitivity Analysis
- Vary police allocation strategies
- Test coordinated vs independent policing
- Vary judicial processing times
- Monte Carlo with randomized crime patterns
