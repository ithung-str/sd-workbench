# 18.14 Project Management (I and II)

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Project Management
- **Simulation Period**: 0–80 months
- **Time Step**: 0.25 month
- **Integration Method**: Euler

## Description
Two-iteration project management model. Iteration I: basic task completion with schedule pressure. Iteration II: adds undiscovered rework and quality dynamics.

## Iteration I: Basic Model

### Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| remaining_tasks | 1,200 | tasks |
| completed_tasks | 0 | tasks |

### Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| initial_project_tasks | 1,200 | tasks |
| initially_remaining_project_time | 40 | months |
| time_to_adapt_workforce | 1 | month |
| time_to_adjust_schedule | 1 | month |
| project_personnel | 2 (initial) | people |

### Lookup Tables
#### gross_productivity (remaining_tasks → productivity)
| remaining_tasks | productivity |
|----------------|-------------|
| 1,200 | 100% |
| 100 | 100% |
| 75 | 95% |
| 50 | 85% |
| 0 | 20% |

## Iteration II: With Rework

### Additional Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| undiscovered_rework | 0 | tasks |

### Additional Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| fraction_properly_completed | 50% | dmnl |
| max_productivity_testing | 2 | tasks/(person·month) |

### Lookup Tables
#### fraction_personnel_for_testing (project_progress → testing_fraction)
| progress (fraction_done) | fraction_for_testing |
|--------------------------|---------------------|
| 0 | 0.10 |
| 0.2 | 0.15 |
| 0.4 | 0.30 |
| 0.6 | 0.60 |
| 0.8 | 0.75 |
| 1.0 | 0.80 |

## Sensitivity Analysis
- Vary fraction_properly_completed: 30–80%
- Vary initial workforce: 1–5
- Test hiring additional personnel mid-project (Brooks's Law)
