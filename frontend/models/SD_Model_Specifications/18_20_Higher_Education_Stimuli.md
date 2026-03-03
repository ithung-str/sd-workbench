# 18.20 Higher Education Stimuli

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Education Policy / Economics
- **Simulation Period**: 1990–2030
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Model of higher education system with BSc/MSc student flows, professor hiring, quality dynamics, and financial incentive policies including subsidies and fines.

## Student Flow Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| BSc_year_1 | from inflow | students |
| BSc_year_2 | from flow | students |
| BSc_year_3 | from flow | students |
| MSc_year_1 | from flow | students |
| MSc_year_2 | from flow | students |

## Staff Stocks
| Stock | Initial Value (1990) | Unit |
|-------|---------------------|------|
| professors | 5 | FTE |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| BSc_inflow | 20 (1990) → 250 (2014+) | students/yr |
| min_BSc_study_time | 3 | years |
| additional_study_delay | 50% per quality unit | dmnl |
| BSc_quitter_fractions | 30% / 10% / 5% | by year |
| min_MSc_study_time | 2 | years |
| MSc_quitter_fractions | 10% / 10% | by year |
| avg_professor_salary | 100,000 | EUR/yr |
| hiring_time | 2 | years |

## Financial Parameters (Subsidies)
| Parameter | Value | Unit |
|-----------|-------|------|
| BSc_student_subsidy | 15,000 | EUR/student/yr |
| BSc_graduate_bonus | 5,000 | EUR/graduate |
| MSc_student_subsidy | 5,000 | EUR/student/yr |
| MSc_graduate_bonus | 5,000 | EUR/graduate |
| lump_sum_subsidy | 1,000,000 | EUR/yr |
| fine_per_slow_student | 3,000 (from 2012) | EUR/yr |

## Lookup Tables
### quality (professor_hours_per_student → quality)
| prof_hours/student | quality |
|-------------------|---------|
| 0 | 10% |
| 50 | 60% |
| 100 | 90% |
| 150+ | 100% |

## Sensitivity Analysis
- Vary BSc_inflow trajectory
- Vary subsidy levels and structure
- Test fine_per_slow_student: 0–10,000 EUR
- Vary professor hiring capacity
