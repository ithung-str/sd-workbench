# 18.11 Carbon and Climate Change

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Climate Science / Environmental Policy
- **Simulation Period**: 1850–2200
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Quantitative carbon cycle model linking fossil fuel combustion, atmospheric CO2, biomass carbon, humus carbon, and ocean uptake to climate change.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| fossil_energy_consumption | 0.1 (in 1850) | GtC/yr |
| carbon_in_atmosphere | 600 | GtC |
| carbon_in_living_biomass | 750 | GtC |
| carbon_in_humus | 1,600 | GtC |
| fossil_fuel_reserves | 4,000 | GtC |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| C_per_ppm_factor | 2.12 | GtC/ppm |
| specific_annual_net_primary_biomass_production | 7.5% | 1/yr |
| fraction_lost_as_plant_litter | 90.5% | dmnl |
| persistence_time_humus | 30 | years |

## Time-Varying Exogenous Variables
- Deforestation: 0 → 2 GtC/yr (1850–1980), back to 1 GtC/yr by 2100
- Soil oxidation: 0 → 1.5 GtC/yr (1850–1980), back to 0 by 2100

## Key Relationships
- Ocean uptake: linear 0 → 3 GtC/yr for atmospheric carbon 600 → 700 GtC, max 3 GtC/yr
- CO2_concentration_ppm = carbon_in_atmosphere / C_per_ppm_factor

## Sensitivity Analysis
- Vary fossil fuel consumption growth trajectories
- Vary ocean uptake capacity
- Vary deforestation rates
- Test emission reduction policies (timing and magnitude)
