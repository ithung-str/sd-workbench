# 22.1 Food or Energy (World Biomass Model)

## Model Metadata
- **Chapter**: 22 – Advanced SD Cases
- **Type**: Advanced Case
- **Domain**: Food Security / Bioenergy Policy
- **Simulation Period**: 2000–2100
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
World food/bioenergy model exploring the impact of bioenergy crop cultivation on food crop cultivation, food prices, food shortages, and the world food crisis. Includes rich/poor population dynamics and their crop demands.

## Key Stocks
- rich_population, poor_population (with enrichment/pauperization flows)
- crop_land, crop_buffer
- crop_yield (average)

## Constants & Parameters (Table 22.1)
| Parameter | Base Case | Bounds | Unit |
|-----------|-----------|--------|------|
| adaptation_time_poor_to_rich | 5.5 | 1–10 | yr |
| adaptation_time_rich_to_poor | 5.5 | 1–10 | yr |
| average_birth_rate_poor | 26 | 20–32 | 10⁻³/(p·yr) |
| average_birth_rate_rich | 20.3 | 19–21 | 10⁻³/(p·yr) |
| average_crop_storage_time | 5 | 2–8 | yr |
| average_lifetime_poor | 45 | 40–50 | yr |
| average_lifetime_rich | 75 | 70–80 | yr |
| conversion_yield_bioenergy | 0.35 | 0.35–1 | l/kg |
| conversion_yield_meat | 0.15 | 0.02–0.28 | kgmeat/kg |
| crop_demand_per_capita_poor | 155.5 | 124–186.5 | kg/(person·yr) |
| crop_demand_per_capita_rich | 311 | 248–373 | kg/(person·yr) |
| crop_land_expansion_time | 10 | 2–18 | yr |
| crop_land_reduction_time | 2 | 1–3 | yr |
| crop_yield_adaptation_time | 10 | 5–15 | yr |
| desired_percentage_buffered | 0.1 | 0.05–0.15 | dmnl |
| distributional_inefficiency | 0.05 | 0–0.1 | dmnl |
| distributional_ineff_crop_buffer | 0.25 | 0–0.5 | dmnl |
| fract_add_crop_land_thr_ex_inv | 0 | policy variable | dmnl |
| fract_add_crop_yield_incr_thr_ex_inv | 0 | policy variable | dmnl |
| initial_crop_land | 1.38 | 1.54 | Gha |
| initial_crop_yield | 3,000 | 2,500–3,500 | kg/(ha·yr) |
| initial_population | 6 | 5.9–6.1 | 10⁹ person |
| initial_fraction_poor | 0.135 | 0.15–0.12 | dmnl |
| initial_fraction_rich | 0.86 | 0.85–0.88 | dmnl |
| max_pot_crop_area | 4.4 | 3.52–5.28 | Gha |
| maximum_potential_crop_yield | 5,000 | 4,400–6,600 | kg/(ha·yr) |
| meat_demand_per_cap_rich | 55.5 | 41–70 | kgmeat/(p·yr) |
| starvation_fraction_of_famished | 0.2 | 0.1–0.3 | dmnl |
| fraction_rich_above_poverty_threshold | 0.2 | 0.1–0.3 | dmnl |

## Lookup Tables (Table 22.2)
| Variable | Values |
|----------|--------|
| poor_to_rich_thr_industrial_development | (2000,0),(2100,0) |
| fraction_second_generation_biomass | (2000,0),(2010,0.01),(2030.28,0.2),(2050,0.5),(2075,0.8),(2100,0.9) |
| fossil_fuel_supply [10¹² l/yr] | (2000,4.4),(2005,4.9),(2008,5.2),(2013,6.2),(2025,6.2),(2100,6.2) |
| fuel_demand_per_capita_rich [l/(person·yr)] | (2000,848),(2008,970),(2100,970) |
| fraction_vegetarians_of_rich_population | (2000,0.1),(2100,0.2) |
| mandatory_percentage_biofuel | (2000,0),(2010,0.01),(2100,0.2) |

## Scenarios
- **S00**: No biofuels (crop_demand_for_bioenergy = 0 always)
- **S01**: Biofuels base case (1st gen decreases via inverse S-function)
- **S02**: S01 + fossil fuel supply decreases linearly 6.2→1 (2025→2100)
- **S03**: S02 + fraction vegetarians → 90%, fuel demand per capita → 500 l/yr
- **S04**: S03 + crop yield investment = 10%, distributional inefficiency = 0%

## Sensitivity Analysis (from S02 baseline)
Test individually: adaptation_time_rich_to_poor, fraction_rich_above_poverty_threshold, poor_to_rich_through_industrial_development, maximum_potential_crop_yield, max_potential_crop_area, desired_percentage_buffered, conversion_yield_bioenergy, crop_storage_time, average_birth_rate_rich, average_birth_rate_poor, average_lifetime_rich, average_lifetime_poor, adaptation_time_poor_to_rich
