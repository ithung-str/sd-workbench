# Book Coverage Matrix: Pruyt (Small System Dynamics Models for Big Issues)

Seeded from TU Delft exercises/cases index and intended to track app support status for all examples in the book.

Sources:
- Book PDF: https://eindhovenengine.nl/wp-content/uploads/2023/01/Systems-Dynamics-book-Eric-Pruyt-.pdf
- Exercises/Cases index: https://simulation.tudelft.nl/SD/ExercisesAndCases.html
- Snapshot date: 2026-02-26

## Coverage Summary (Seed)

| Part | Total Cases | Cases with Vensim Model Link |
|---|---:|---:|
| WARM-UP | 14 | 10 |
| RUN-UP | 11 | 10 |
| HOP | 16 | 8 |
| STEP | 18 | 15 |
| JUMP | 22 | 13 |

## Tracking Matrix

| Case ID | Title | Part | Vensim model? | Import | Simulation | Native edit | Feature tags | Parity fixture | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2.1 | Competition in the Faculty | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.2 | Asset and Customer Management | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.3 | Resource Dynamics | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.4 | Prescriptive Approach to Health & Social Work | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.5 | Setting Up COLs and MOOCs | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.6 | Fish and Ships | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.7 | Housing Policies | WARM-UP | no | not_tried | not_tried | not_assessed |  |  |  |
| 2.8 | Student Passing Policy | WARM-UP | no | not_tried | not_tried | not_assessed |  |  |  |
| 2.9 | Fighting High Impact Crime | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.10 | Conflict in the Middle East | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.11 | Mapping Bank Runs | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.12 | Entrepreneurs & Transitions | WARM-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 2.13 | Soft Drugs Policies | WARM-UP | no | not_tried | not_tried | not_assessed |  |  |  |
| 2.14 | Climate Change (Qualitative) | WARM-UP | no | not_tried | not_tried | not_assessed |  |  |  |
| 6.1 | Cocaine | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.2 | Muskrat Plague | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.3 | Economic Overshoot and Collapse | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.4 | (Mis)Management of Societal Aging | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.5 | The Threat of the Feral Pig | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.6 | Gangs and Arms Races | RUN-UP | no | not_tried | not_tried | not_assessed |  |  |  |
| 6.7 | Unintended Family Planning Benefits | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.8 | Pneumonic Plague (A) | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.9 | System Dynamics Education | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.10 | Diffusion of micro-CHP | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 6.11 | Housing Stock Dynamics | RUN-UP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 10.1 | Step, Ramp, Time, Sin | HOP | no | not_tried | not_tried | not_assessed | STEP, RAMP, TIME, SIN | backend/tests/vensim_parity/cases/book_10_1_step_ramp_time_sin | Seeded HOP parity fixture with baseline; execution parity pending env setup |
| 10.2 | Min, Max, MinMax, MaxMin | HOP | no | not_tried | not_tried | not_assessed | MIN, MAX | backend/tests/vensim_parity/cases/book_10_2_min_max | Seeded HOP parity fixture with baseline; execution parity pending env setup |
| 10.3 | Stocks | HOP | no | not_tried | not_tried | not_assessed | STOCKS | backend/tests/vensim_parity/cases/book_10_3_stocks | Seeded HOP parity fixture with baseline; execution parity pending env setup |
| 10.4 | First Order Material & Information Delays | HOP | no | not_tried | not_tried | not_assessed | DELAY1, INFORMATION_DELAY | backend/tests/vensim_parity/cases/book_10_4_first_order_delays | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.5 | Higher Order Delays | HOP | no | not_tried | not_tried | not_assessed | DELAY3, DELAYN, SMOOTH | backend/tests/vensim_parity/cases/book_10_5_higher_order_delays | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.6 | Lookups, With Lookups, Time Series | HOP | yes | not_tried | not_tried | not_assessed | LOOKUP, TIME_SERIES | backend/tests/vensim_parity/cases/book_10_6_lookups_time_series | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.7 | SoftMin & SoftMax versus Min & Max | HOP | no | not_tried | not_tried | not_assessed | SOFTMIN, SOFTMAX | backend/tests/vensim_parity/cases/book_10_7_softmin_softmax | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.8 | Pulse and Pulse Train | HOP | yes | not_tried | not_tried | not_assessed | PULSE, PULSE_TRAIN | backend/tests/vensim_parity/cases/book_10_8_pulse_pulse_train | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.9 | Randomizers and Randomly Sampled Parameters | HOP | yes | not_tried | not_tried | not_assessed | RANDOM | backend/tests/vensim_parity/cases/book_10_9_randomizers | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.10 | Special Structures | HOP | yes | not_tried | not_tried | not_assessed | SPECIAL_STRUCTURES | backend/tests/vensim_parity/cases/book_10_10_special_structures | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.11 | Damped mass-spring system | HOP | no | not_tried | not_tried | not_assessed |  | backend/tests/vensim_parity/cases/book_10_11_damped_mass_spring | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.12 | Un/Conventional Gas | HOP | yes | not_tried | not_tried | not_assessed |  | backend/tests/vensim_parity/cases/book_10_12_unconventional_gas | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.13 | Mass Starvation in the OVP | HOP | yes | not_tried | not_tried | not_assessed |  | backend/tests/vensim_parity/cases/book_10_13_mass_starvation_ovp | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.14 | Verification and Debugging | HOP | yes | not_tried | not_tried | not_assessed | VERIFICATION, DEBUGGING | backend/tests/vensim_parity/cases/book_10_14_verification_debugging | Seeded HOP parity fixture with baseline; execution parity pending env setup |
| 10.15 | Sensitivity, Uncertainty, Scenarios & Robustness I | HOP | no | not_tried | not_tried | not_assessed | SENSITIVITY, SCENARIOS, ROBUSTNESS | backend/tests/vensim_parity/cases/book_10_15_sensitivity_scenarios_1 | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 10.16 | Sensitivity, Uncertainty, Scenarios & Robustness II | HOP | yes | not_tried | not_tried | not_assessed | SENSITIVITY, UNCERTAINTY, SCENARIOS | backend/tests/vensim_parity/cases/book_10_16_sensitivity_scenarios_2 | Seeded HOP parity fixture; baseline pending (complex/stochastic/feature-specific) |
| 14.1 | Managing a Faculty | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.2 | Supply Chain Management | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.3 | Debt Crisis in a Developing Country | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.4 | Environmental Management in Miniworld | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.5 | The 2009-2010 Flu Pandemic / Next Pandemic Shock | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.6 | Long Term Planning of New Towns | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.7 | Tolerance, Hate & Aggression | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.8 | Electrical Vehicle Transition & Lithium Scarcity | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.9 | Cholera Epidemic in Zimbabwe | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.10 | Signalled Run on a Bank | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.11 | Fighting HIC on the National Level | STEP | no | not_tried | not_tried | not_assessed |  |  |  |
| 14.12 | Overfishing of Bluefin Tuna | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.13 | Production Management | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.14 | Redevelopment of Social Housing Districts | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.15 | Mineral/Metal Scarcity I | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.16 | Radicalization & Deradicalization | STEP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 14.17 | Fundamental Behaviors | STEP | no | not_tried | not_tried | not_assessed |  |  |  |
| 14.18 | Additional Exercises in Online Repository | STEP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.1 | Policy Analysis, Design, Testing, and Advice | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.2 | Unemployment | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.3 | Hospital Management | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.4 | Deer Population on the Kaibab Plateau | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.5 | Prostitution and Human Trafficking | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.6 | Seasonal Flu | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.7 | Real Estate Boom and Bust | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.8 | DNO Asset Management | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.9 | Fighting HIC on the Regional Level | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.10 | Innovation in Health Care | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.11 | Carbon and Climate Change | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.12 | Managing An Orchestrated Bank Run | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.13 | Activism, Extremism and Terrorism | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.14 | Project Management | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.15 | Mineral/Metal Scarcity II | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.16 | Energy Transition Management | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.17 | Fighting HIC across Multiple Districts | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.18 | Antibiotic Resistance | JUMP | no | not_tried | not_tried | not_assessed |  |  |  |
| 18.19 | Globalization & Liberalization | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.20 | Higher Education Stimuli | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.21 | Financial Turmoil on the Housing Market | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
| 18.22 | Collapse of Civilizations | JUMP | yes | not_tried | not_tried | not_assessed |  |  |  |
