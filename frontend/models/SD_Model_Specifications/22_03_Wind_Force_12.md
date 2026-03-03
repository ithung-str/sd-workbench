# 22.3 Wind Force 12

## Model Metadata
- **Chapter**: 22 – Advanced SD Cases
- **Type**: Advanced Case
- **Domain**: Energy / Wind Power
- **Simulation Period**: 2001–2043
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Replication and correction of the 2002 Wind Force 12 report (EWEA/Greenpeace) assessing 12% wind-powered electricity worldwide by 2020. Three co-flow stock structures track capacity, turbine numbers, and energy generation.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| total_capacity_of_installed_wind_turbines | 24,900 (2001) | MW |
| total_number_of_installed_wind_turbines | 56,000 (2001) | units |
| total_energy_generated_by_wind_capacity | 54.5 (2001) | TWh |
| cost_new_capacity_t_plus_1 | 879 (2001) | EUR/kW |
| cumulative_decommissioned_capacity | 0 | MW |
| cumulative_historical_number | from data | units |

## Key Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| lifetime_wind_capacity | 20 | years |
| initial_cost_new_capacity | 879 | EUR/kW |
| hours_per_year | 8,760 | hours |
| initial_number_units | 56,000 | units |

## Growth Rate Schedule
| Period | Annual Growth Rate |
|--------|-------------------|
| 2002–2007 | 25% |
| 2008–2009 | 20% |
| 2010–2012 | 15% (capacity) → 20% (report) |
| 2013–2015 | 15% |
| 2016–2020 | 10% |
| 2021+ | 0% |

## Capacity Factor Schedule
| Period | Capacity Factor |
|--------|----------------|
| 2001–2010 | 25% |
| 2011–2034 | 28% |
| 2035+ | 30% |

## Progress Ratio (Experience Curve)
| Period | Progress Ratio |
|--------|---------------|
| 2001–2010 | 0.85 |
| 2011–2025 | 0.90 |
| 2026+ | 1.00 |

## Experience Curve Formula
C_t = C_{t-1} * (X_t / X_{t-1})^e
where e = -log2(progress_ratio)

## Wind Turbine Size (avg. MW per unit)
| Period | Avg Size (MW) |
|--------|--------------|
| 2001–2003 | 1.0 |
| 2004–2005 | 1.2 |
| 2006–2007 | 1.3 |
| 2008–2009 | 1.4 |
| 2010–2011 | 1.4 |
| 2012–2019 | 1.5 |
| 2020–2030 | 1.5 |
| 2031–2043 | 2.0 |

## Extensions
- Correct decommissioning of initial capacity (pre-2004)
- Fix capacity factor discontinuity (vintage-based)
- Add cost calculation modules (O&M=3%, interest=10%, write-off)
- Add jobs created module: jobyear_per_MW lookup [(1998,22),(2005,14.7),(2010,12.2),(2015,10.9),(2020,9.8)]
- Add CO2 emissions avoided module

## CO2 Emissions by Technology (Table 22.5)
| Technology | tCO2/GWh | Gen 2001 TWh | Gen 2010 TWh | Gen 2020 TWh |
|------------|----------|-------------|-------------|-------------|
| gas | 400 | 5,992 | 4,698 | 7,745 |
| coal | 800 | 1,331 | 7,467 | 9,763 |
| oil | 726 | 2,940 | 1,442 | 1,498 |
| nuclear | 7 | 2,471 | 2,647 | 2,369 |
| hydro | 8 | 2,804 | 3,341 | 3,904 |
| biomass | 100 | 268 | 395 | 603 |

## Sensitivity Analysis
- Vary progress_ratio: 0.80–0.95 (constant)
- Test different growth rate schedules
- Vary lifetime_wind_capacity: 15–25 years
- Compare static vs dynamic model versions
