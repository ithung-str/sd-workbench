# 18.4 Deer Population on the Kaibab Plateau

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Ecology / Wildlife Management
- **Simulation Period**: 1900–1950
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Three-iteration model of deer population dynamics on the Kaibab Plateau after predator removal in 1910. Demonstrates overshoot and collapse with increasingly sophisticated food limitation mechanisms.

## Iteration 1: Simple Logistic

### Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| deer_population | 1,000 | deer |

### Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| area | 1,000,000 | acres |
| initial_density | 0.005 | deer/acre |
| growth_rate_factor | 20% | 1/yr |
| predator_population | 500 (→0 in 1910) | predators |

## Iteration 2: Growth Rate Lookup

### Lookup Tables
#### growth_rate_factor (density → growth rate)
| density (deer/acre) | growth_rate_factor |
|---------------------|-------------------|
| 0 | -0.6 |
| 0.05 | 0 |
| 0.1 | 0.2 |
| 1.0 | 0.2 |

### Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| food | 100,000 (constant) | ton |

## Iteration 3: Dynamic Food

### Additional Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| food | 100,000 | ton |

### Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| food_capacity | 100,000 | ton |

### Lookup Tables
#### food_regeneration_time (food_ratio → regen_time)
| food/food_capacity | regen_time (yr) |
|--------------------|----------------|
| 0 | 40 |
| 0.5 | 1.5 |
| 1 | 1 |

#### food_consumption_per_deer (food_ratio → consumption)
| food_availability_ratio | relative_consumption |
|------------------------|---------------------|
| 0 | 0 |
| 0.2 | 0.4 |
| 0.4 | 0.8 |
| 1 | 1 |

## Sensitivity Analysis
- Compare all three iterations
- Vary predator removal timing
- Test reintroduction of predators at various population levels
