# 18.3 Hospital Management

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Healthcare / Operations Management
- **Simulation Period**: 0–52 weeks
- **Time Step**: 0.25 week
- **Integration Method**: Euler

## Description
Hospital waiting list and throughput management model with pre-operative queue, surgical capacity constraints, aftercare capacity, and patient flow dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| pre_ops_waiting_list | 2,000 | patients |
| patients_in_hospital | 0 | patients |
| patients_in_aftercare | 0 | patients |
| post_ops_without_aftercare | 300 | patients |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| newly_referred | 800 | patients/wk |
| admission_for_surgery | MIN(pre_ops / admin_time, hospital_capacity) | patients/wk |
| discharge_to_aftercare | MIN(patients_in_hospital / residence_time, aftercare_available) | patients/wk |
| discharge_without_aftercare | overflow from aftercare | patients/wk |
| recovery_aftercare | patients_in_aftercare / avg_aftercare_time * frac_recovered_ac | patients/wk |
| recovery_no_aftercare | post_ops_without_aftercare / avg_recovery_no_ac * frac_recovered_no_ac | patients/wk |

## Parameters
| Parameter | Value | Bounds | Unit |
|-----------|-------|--------|------|
| newly_referred_pre_ops | 800 | 600–1,000 | patients/wk |
| hospital_capacity | 700 | - | operations/wk |
| avg_admin_processing_time | 1 | - | week |
| avg_residence_time | 1 | - | week |
| aftercare_capacity | 1,000 | - | patients |
| avg_aftercare_residence | 3 | - | weeks |
| fraction_recovered_aftercare | 98% | 96–100% | dmnl |
| avg_recovery_without_aftercare | 7 | - | weeks |
| fraction_recovered_without_aftercare | 80% | 70–90% | dmnl |

## Sensitivity Analysis
- Vary referred_pre_ops: 600–1,000 patients/wk
- Vary fraction_recovered_aftercare: 96–100%
- Vary fraction_recovered_without_aftercare: 70–90%
- Test: increase hospital_capacity vs aftercare_capacity
