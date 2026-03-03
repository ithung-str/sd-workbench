# System Dynamics Model Specifications
## Extracted from "System Dynamics" by Eric Pruyt

---

# Model 1: Cocaine in a Country

## Model Metadata
- **Runtime**: 0 to 50 months
- **Time Unit**: Month
- **Integration Method**: Euler
- **Time Step (dt)**: 1 Month

## Sector: Drug Supply

### Stocks
- **cocaine_in_country** (initial = 3000 kg)
  - dX/dt = cocaine_imports - cocaine_used - cocaine_confiscated

### Flows
- **cocaine_imports** = 4000 kg/month (constant)
- **cocaine_used** = 3000 kg/month (constant)
- **cocaine_confiscated** = cocaine_in_country * confiscation_fraction
  - confiscation_fraction = 0.10 (10% per month)

---

# Model 2: Muskrat Plague

## Model Metadata
- **Runtime**: 0 to 10 years
- **Time Unit**: Year
- **Integration Method**: Euler
- **Time Step (dt)**: 0.125 Year

## Sector: Muskrat Population

### Stocks
- **muskrats** (initial = 100 muskrats)
  - dX/dt = autonomous_increase - muskrats_caught

### Flows
- **autonomous_increase** = muskrats * autonomous_increase_rate
  - autonomous_increase_rate = 20 (muskrats per muskrat per year)
- **muskrats_caught** = number_of_traps * catch_rate_per_trap * muskrats
  - (flow proportional to muskrat population)

### Auxiliaries
- **number_of_traps** = licences * traps_per_licence
  - licences = 10 per year
  - traps_per_licence = 10
- **catch_rate_per_trap** = 0.2 (range: 0.195 to 0.205)

---

# Model 3: Economic Overshoot and Collapse

## Model Metadata
- **Runtime**: 0 to 500 years
- **Time Unit**: Year
- **Integration Method**: RK4
- **Time Step (dt)**: 0.25 Year

## Sector: Population

### Stocks
- **population** (initial = 1,000,000 persons)
  - dX/dt = births - deaths

### Flows
- **births** = population * normal_birth_rate * per_capita_renewable_resource_availability
  - normal_birth_rate = 0.0035 (0.35% per year)
- **deaths** = population / adapted_lifetime

### Auxiliaries
- **adapted_lifetime** = MAX(15, MIN(100, normal_lifetime * per_capita_renewable_resource_availability))
  - normal_lifetime = 70 years
- **per_capita_renewable_resource_availability** = renewable_resources / population

## Sector: Resources

### Stocks
- **renewable_resources** (initial = 5,000,000 units)
  - dX/dt = regeneration - resource_depletion

### Flows
- **regeneration** = renewable_resources * regeneration_rate * (1 - renewable_resources / carrying_capacity) * MAX(min_regeneration_rate, normalized_regeneration)
  - regeneration_rate = 1.20 (120% per year)
  - carrying_capacity = 7,500,000 units
  - min_regeneration_rate = 0.01 (1%)
- **resource_depletion** = population * resource_consumption_per_capita / rapid_resource_depletion_time
  - resource_consumption_per_capita = 1 unit per person per year
  - rapid_resource_depletion_time = 1 year

---

# Model 4: Societal Aging

## Model Metadata
- **Runtime**: 2010 to 2110 years
- **Time Unit**: Year
- **Integration Method**: Euler
- **Time Step (dt)**: 0.25 Year

## Sector: Demographics

### Stocks
- **children** (initial = 4,000,000)
  - dX/dt = births - maturing_to_adults
- **adults** (initial = 9,000,000)
  - dX/dt = maturing_to_adults - retiring
- **retirees** (initial = 3,000,000)
  - dX/dt = retiring - dying

### Flows
- **births** = adults * birth_rate
  - birth_rate = 0.02 (20 per 1000 adults per year)
- **maturing_to_adults** = children / childhood_period
  - childhood_period = 22 years
- **retiring** = adults / adult_period
  - adult_period = 40 years
- **dying** = retirees / average_retiree_period
  - average_retiree_period = 20 years

### Auxiliaries
- **adult_participation_ratio** = 0.50 (50%)
- **working_adults** = adults * adult_participation_ratio
- **dependency_ratio** = (children + retirees) / working_adults

---

# Model 5: Feral Pig Control

## Model Metadata
- **Runtime**: 0 to 20 years
- **Time Unit**: Year
- **Integration Method**: Euler
- **Time Step (dt)**: 0.125 Year

## Sector: Pig Population

### Stocks
- **feral_pigs** (initial = 20,000 pigs)
  - dX/dt = piglet_births - natural_deaths - pigs_caught

### Flows
- **piglet_births** = sows * litters_per_year * piglets_per_litter
  - sows = feral_pigs * sow_fraction
  - sow_fraction = 0.50
  - litters_per_year = 4
  - piglets_per_litter = 8
- **pigs_caught** = number_of_traps * catch_rate_per_trap * feral_pigs

### Auxiliaries
- **number_of_traps** = licences * traps_per_licence
  - licences = 10
  - traps_per_licence = 10
- **catch_rate_per_trap** = 0.16 (range 0.15 to 0.17)

---

# Model 6: Gangs and Arms Races

## Model Metadata
- **Runtime**: 0 to 100 months
- **Time Unit**: Month
- **Integration Method**: Euler
- **Time Step (dt)**: 0.5 Month

## Sector: Arms Race

### Stocks
- **arms_A** (initial = 100%)
  - dX/dt = arming_A - obsolescence_A
- **arms_B** (initial = 100%)
  - dX/dt = arming_B - obsolescence_B

### Flows
- **arming_A** = autonomous_arming_A + reactive_arming_A
  - autonomous_arming_A = 0.05 (5% per month)
  - reactive_arming_A = MAX(0, perceived_arms_B - arms_A) / reaction_time_A
  - reaction_time_A = 1 month
- **arming_B** = autonomous_arming_B + reactive_arming_B
  - autonomous_arming_B = 0.05 (5% per month)
  - reactive_arming_B = MAX(0, perceived_arms_A - arms_B) / reaction_time_B
  - reaction_time_B = 1 month
- **obsolescence_A** = arms_A * obsolescence_rate
- **obsolescence_B** = arms_B * obsolescence_rate
  - obsolescence_rate = 0.10 (10% per month)

### Auxiliaries
- **perceived_arms_B** = arms_B * overassessment_factor_A
  - overassessment_factor_A = 1.10 (110%)
- **perceived_arms_A** = arms_A * overassessment_factor_B
  - overassessment_factor_B = 1.00 (100%)

---

# Model 7: Unintended Family Planning

## Model Metadata
- **Runtime**: 0 to 200 years
- **Time Unit**: Year
- **Integration Method**: Euler
- **Time Step (dt)**: 0.25 Year

## Sector: Demographics

### Stocks
- **kids** (initial = 1,000,000)
  - dX/dt = births - aging_to_youngsters
- **youngsters** (initial = 1,000,000)
  - dX/dt = aging_to_youngsters - aging_to_adults
- **adults** (initial = 3,000,000)
  - dX/dt = aging_to_adults - aging_to_retirees
- **retirees** (initial = 750,000)
  - dX/dt = aging_to_retirees - dying

### Flows
- **births** = adults * fertility_rate
  - fertility_rate = 0.03 initially, switches to 0.003 (0.3%) at policy intervention
- **aging_to_youngsters** = kids / kid_period
  - kid_period = 12 years
- **aging_to_adults** = youngsters / youngster_period
  - youngster_period = 12 years
- **aging_to_retirees** = adults / adult_period
  - adult_period = 40 years
- **dying** = retirees / retirement_period
  - retirement_period = 15 years

---

# Model 8: Pneumonic Plague

## Model Metadata
- **Runtime**: 0 to 30 weeks
- **Time Unit**: Week
- **Integration Method**: RK4
- **Time Step (dt)**: 0.125 Week

## Sector: Epidemiology (SIR Model)

### Stocks
- **susceptible** (initial = 9,999 persons)
  - dX/dt = -infections
- **infected** (initial = 1 person)
  - dX/dt = infections - recovering - deceasing
- **recovered** (initial = 0)
  - dX/dt = recovering
- **deceased** (initial = 0)
  - dX/dt = deceasing

### Flows
- **infections** = susceptible * contact_rate * infection_ratio * infected / total_population
  - contact_rate = 50 contacts per person per week
  - infection_ratio = 0.75 (75%)
  - total_population = 10,000
- **recovering** = infected * (1 - fatality_ratio) / recovery_time
  - recovery_time = 2/7 weeks (2 days)
- **deceasing** = infected * fatality_ratio / decease_time
  - decease_time = 2/7 weeks (2 days)

### Auxiliaries
- **fatality_ratio** depends on antibiotics availability
  - fatality_ratio at 0% antibiotics = 0.90 (90%)
  - fatality_ratio at 100% antibiotics = 0.15 (15%)

---

# Model 9: Micro-CHP Diffusion

## Model Metadata
- **Runtime**: 0 to 240 months
- **Time Unit**: Month
- **Integration Method**: Euler
- **Time Step (dt)**: 1 Month

## Sector: Technology Adoption (Bass Diffusion Model)

### Stocks
- **potential_clients** (initial = 7,299,900)
  - dX/dt = -adoptions
- **clients** (initial = 100)
  - dX/dt = adoptions

### Flows
- **adoptions** = clients * contacts_per_month * convincing_degree * potential_clients / total_market
  - contacts_per_month = 50
  - convincing_degree = 0.01 (1%)
  - total_market = 7,300,000

---

# Model 10: Housing Stock Dynamics

## Model Metadata
- **Runtime**: 0 to 100 months
- **Time Unit**: Month
- **Integration Method**: Euler
- **Time Step (dt)**: 1 Month

## Sector: Housing

### Stocks
- **houses** (initial = 5,000,000)
  - dX/dt = construction - demolition
- **houses_under_construction** (initial = in equilibrium)
  - Pipeline with planning_time and build_time

### Flows
- **demolition** = houses / average_lifetime
  - average_lifetime = 1200 months (100 years)
- **construction** = result of pipeline delay

### Auxiliaries
- **desired_houses** = houses + desired_increase
  - desired_increase = 50,000 + STEP(step_increase, 20)
- **planning_time** = 3 months
- **build_time** = 6 months
- **response_time** = 8 months

---

# Model 11: Damped Mass-Spring System

## Model Metadata
- **Runtime**: 0 to 20 seconds
- **Time Unit**: Second
- **Integration Method**: RK4
- **Time Step (dt)**: 0.01 Second

## Sector: Physics

### Stocks
- **position_y** (initial = 10 m)
  - dX/dt = velocity
- **velocity** (initial = 0 m/s)
  - dX/dt = acceleration

### Auxiliaries
- **acceleration** = g - (k/m) * position_y - (b/m) * velocity
  - g = 9.81 m/s²
  - k = 2 N/m (spring constant)
  - m = 1 kg (mass)
  - b = 0.5 N·s/m (damping coefficient)

---

# Model 12: Managing a Faculty

## Model Metadata
- **Runtime**: 0 to 100 months
- **Time Unit**: Month
- **Integration Method**: Euler
- **Time Step (dt)**: 0.25 Month

## Sector: Faculty Staff

### Stocks
- **professors** (initial = 25 FTE)
  - dX/dt = new_professors_hired - professors_leaving

### Flows
- **new_professors_hired** = (desired_number_of_professors - professors) / average_hiring_time
  - average_hiring_time = 12 months
- **professors_leaving** = professors * percentage_of_leavers / 12
  - percentage_of_leavers = 0.10 per year

### Auxiliaries
- **desired_number_of_professors** = available_money_for_salaries / average_professor_salary
  - average_professor_salary = 3500 EUR per month

## Sector: Finances

### Stocks
- **available_money_for_salaries** (initial = 500,000 EUR)
  - dX/dt = teaching_fee + earnings_from_papers - money_spent_on_salaries

### Flows
- **teaching_fee** = 150,000 EUR per month (constant)
- **earnings_from_papers** = number_of_papers_published * earnings_per_published_paper
  - earnings_per_published_paper = 4000 EUR
  - number_of_papers_published = professors * papers_per_professor_per_month
  - papers_per_professor_per_month = 0.5 papers per month (6 per 12 months)
- **money_spent_on_salaries** = professors * average_professor_salary

---

# Model 13: Supply Chain Management

## Model Metadata
- **Runtime**: 0 to 100 months
- **Time Unit**: Month
- **Integration Method**: Euler
- **Time Step (dt)**: 0.25 Month

## Sector: Sales & Inventory

### Stocks
- **inventory** (initial = 300 cars)
  - dX/dt = production - sales

### Flows
- **sales** = 100 cars per month (STEP to 150 at month 20)
- **production** = workforce * productivity
  - productivity = 1 car per person per month

### Auxiliaries
- **target_inventory** = sales * inventory_coverage
  - inventory_coverage = 3 months
- **inventory_correction** = (target_inventory - inventory) / time_to_correct_inventory
  - time_to_correct_inventory = 2 months
- **target_production** = sales + inventory_correction

## Sector: Workforce

### Stocks
- **workforce** (initial = 100 at equilibrium)
  - dX/dt = net_hire_rate

### Flows
- **net_hire_rate** = (target_workforce - workforce) / time_to_adjust_workforce
  - time_to_adjust_workforce = 10 months

### Auxiliaries
- **target_workforce** = target_production / productivity

---

# Model 14: Debt Crisis in a Developing Country

## Model Metadata
- **Runtime**: 0 to 100 years
- **Time Unit**: Year
- **Integration Method**: Euler
- **Time Step (dt)**: 0.25 Year

## Sector: Production

### Stocks
- **production_plants** (initial = 0, relative value)
  - dX/dt = new_production_plants - deterioration

### Flows
- **new_production_plants** = investments * investment_effectiveness
  - investment_effectiveness = 0.50 (50%)
- **deterioration** = production_plants * deterioration_rate
  - deterioration_rate = 0.05 (5% per year)

### Auxiliaries
- **production** = production_plants * specific_production
  - specific_production = 1.0 (100%)
- **investments** = credits + endogenous_investments
- **endogenous_investments** = MAX(0, net_revenues - repayments) * reinvestment_fraction
  - reinvestment_fraction = 0.50 (50%)
- **revenues** = sales * price_factor
  - sales = production
- **net_revenues** = revenues - interest_payments
- **interest_payments** = debt * interest_rate
  - interest_rate = 0.07 (7% per year)
- **credits** = IF(Time >= 4 AND Time <= 10, credit_amount, 0)
  - credit_amount = 100 per year
- **demand** = 100

## Sector: Debt

### Stocks
- **debt** (initial = 0)
  - dX/dt = credits + additional_debt_due_to_interest - repayments

### Flows
- **repayments** = IF(net_revenues > 0 AND debt > 0, debt_repayment_fraction * net_revenues, 0)
  - debt_repayment_fraction = 0.50 (50%)
- **additional_debt_due_to_interest** = MAX(-net_revenues, 0)

### Auxiliaries
- **profits** = endogenous_investments * (1 - reinvestment_fraction) / reinvestment_fraction

## Lookup Tables
- **price_factor**
  - Input: production / demand
  - Points: (0, 2.0), (0.2, 2.0), (0.4, 2.0), (0.6, 2.0), (0.8, 1.4), (1.0, 1.0), (1.2, 0.6), (1.4, 0.1), (1.6, 0.1), (1.8, 0.1), (2.0, 0.1)

---

# Model 15: Environmental Management Miniworld

## Model Metadata
- **Runtime**: 0 to 500 years
- **Time Unit**: Year
- **Integration Method**: RK4
- **Time Step (dt)**: 0.5 Year

## Sector: Population

### Stocks
- **population** (initial = 1.0, normalized)
  - dX/dt = births - deaths

### Flows
- **births** = birth_rate * population * quality_of_environment * consumption_level * birth_control
  - birth_rate = 0.03
  - birth_control = 1
- **deaths** = death_rate * population * environmental_pollution
  - death_rate = 0.01

### Auxiliaries
- **quality_of_environment** = MIN(1.0, damage_threshold / environmental_pollution)
  - damage_threshold = 1

## Sector: Environment

### Stocks
- **environmental_pollution** (initial = 1.0, normalized)
  - dX/dt = degradation - regeneration

### Flows
- **degradation** = degradation_rate * population * consumption_level
  - degradation_rate = 0.02
- **regeneration** = IF(quality_of_environment > 1, regeneration_rate * environmental_pollution, regeneration_rate * damage_threshold)
  - regeneration_rate = 0.1

## Sector: Economy

### Stocks
- **production_capacity** (initial = 1.0, normalized)
  - dX/dt = capacity_increase

### Flows
- **capacity_increase** = growth_rate * consumption_level * environmental_quality * population * (1 - (consumption_level * environmental_pollution / consumption_goal))
  - growth_rate = 0.05
  - consumption_goal = 10

### Auxiliaries
- **consumption_level** = production_capacity
- **initial_capacity** = 1

---

# Model 16: Flu Pandemic / H1N1

## Model Metadata
- **Runtime**: 0 to 48 months
- **Time Unit**: Month
- **Integration Method**: RK4
- **Time Step (dt)**: 0.0625 Month

## Sector: Western World Epidemiology (SIR Model)

### Stocks
- **susceptible_population** (initial = 600,000,000)
  - dX/dt = -infections
- **infected_population** (initial = 10)
  - dX/dt = infections - recoveries
- **recovered_population** (initial = 0)
  - dX/dt = recoveries

### Flows
- **infections** = susceptible_population * contact_rate * infection_rate * infected_fraction
  - contact_rate = 50 close contacts per person per month
  - infection_rate = 0.10 (10% per close contact)
- **recoveries** = infected_population / recovery_time
  - recovery_time = 0.5 months (2 weeks)

### Auxiliaries
- **infected_fraction** = infected_population / total_population
- **total_population** = susceptible_population + infected_population + recovered_population

---

# Model 17: Long Term Planning of New Towns

## Model Metadata
- **Runtime**: 0 to 200 years
- **Time Unit**: Year
- **Integration Method**: Euler
- **Time Step (dt)**: 0.25 Year

## Sector: Population

### Stocks
- **population** (initial = 50,000)
  - dX/dt = births + immigration - deaths - emigration

### Flows
- **births** = population * birth_rate
  - birth_rate = 0.03
- **deaths** = population * death_rate
  - death_rate = 0.015
- **emigration** = population * normal_emigration_rate
  - normal_emigration_rate = 0.07
- **immigration** = population * normal_immigration_rate * job_availability_multiplier * housing_availability_multiplier
  - normal_immigration_rate = 0.10

### Auxiliaries
- **households** = population / average_household_size
  - average_household_size = 4
- **households_to_houses_ratio** = households / houses

## Sector: Housing

### Stocks
- **houses** (initial = 14,000)
  - dX/dt = construction_of_houses - demolition_of_houses

### Flows
- **demolition_of_houses** = houses * demolition_rate_houses
  - demolition_rate_houses = 0.015 per year
- **construction_of_houses** = DELAY3(land_availability_multiplier_houses * housing_scarcity_multiplier * houses * construction_rate_houses, 2)
  - construction_rate_houses = 0.07 per year
  - delay = 2 years (3rd order)

## Sector: Business

### Stocks
- **businesses** (initial = 1,000)
  - dX/dt = construction_business - demolition_business

### Flows
- **demolition_business** = businesses * demolition_rate_business
  - demolition_rate_business = 0.025
- **construction_business** = land_availability_multiplier_business * business_labor_force_multiplier * businesses * construction_rate_business
  - construction_rate_business = 0.07

### Auxiliaries
- **jobs** = businesses * initial_jobs_per_business
  - initial_jobs_per_business = 18
- **labor_force** = population * labor_force_to_population_ratio
  - labor_force_to_population_ratio = 0.35
- **labor_force_to_jobs_ratio** = labor_force / jobs

## Sector: Land

### Auxiliaries
- **land_fraction_occupied** = (houses * land_per_house + businesses * land_per_business) / total_area
  - total_area = 5000 hectare
  - land_per_house = 0.05 hectare
  - land_per_business = 0.1 hectare

## Lookup Tables
- **housing_availability_multiplier_for_immigration**
  - Input: households_to_houses_ratio
  - Points: (0, 1.4), (0.5, 1.3), (1.0, 1.0), (1.5, 0.25), (2.0, 0)

- **housing_scarcity_multiplier**
  - Input: households_to_houses_ratio
  - Points: (0, 0.2), (0.5, 0.3), (1.0, 1.0), (1.5, 1.7), (2.0, 2.0)

- **land_availability_multiplier_for_houses**
  - Input: land_fraction_occupied
  - Points: (0, 1.0), (0.25, 1.0), (0.50, 1.5), (0.75, 1.0), (1.0, 0)

- **land_availability_multiplier_for_business**
  - Input: land_fraction_occupied
  - Points: (0, 1.0), (0.5, 1.5), (1.0, 0)

- **business_labor_force_multiplier**
  - Input: labor_force_to_jobs_ratio
  - Points: (0, 0.2), (0.5, 0.3), (1.0, 1.0), (1.5, 1.7), (2.0, 2.0)

- **job_availability_multiplier_for_immigration**
  - Input: labor_force_to_jobs_ratio
  - Points: (0, 2.0), (0.5, 1.75), (1.0, 1.0), (1.5, 0.25), (2.0, 0.1)

---

# Model 18: Tolerance, Hate & Aggression

## Model Metadata
- **Runtime**: 0 to 50 months
- **Time Unit**: Month
- **Integration Method**: RK4
- **Time Step (dt)**: 0.125 Month

## Sector: Social Dynamics

### Stocks
- **tolerance** (initial = 0.50, i.e. 50%)
  - dX/dt = increase_in_tolerance - tolerance_erosion
- **unfamiliarity** (initial = 0.10, i.e. 10%)
  - dX/dt = unfamiliar_experiences - accustoming
- **hate** (initial = 0.10, i.e. 10%)
  - dX/dt = increase_in_hate - decrease_in_hate
- **restraint_threshold** (initial = 0.50, i.e. 50%)
  - dX/dt = restraint_buildup - restraint_loss

### Flows
- **unfamiliar_experiences** = encounters * encounter_intensity * degree_of_unfamiliarity * intolerance * (1 - unfamiliarity / maximum_unfamiliarity)
  - encounter_intensity = 5.0 (500%)
  - degree_of_unfamiliarity = 0.50
  - maximum_unfamiliarity = 1.0 (100%)
  - encounters = PULSE TRAIN(start=5, duration=1, interval=2, end=50)
- **accustoming** = unfamiliarity * tolerance / adaptation_time
  - adaptation_time = 1 month
- **increase_in_tolerance** = SMOOTH3(education_effort * tolerance * intolerance, 1)
  - education_effort = STEP(education_activity, 15)
  - education_activity = 0.50 (stepped up from 0 at month 15)
- **tolerance_erosion** = tolerance / adaptation_time * hate * (1 + violence)
- **increase_in_hate** = relative_hate_gap * hate / adaptation_time * unfamiliarity * intolerance * (1 + violence) * social_problems
  - relative_hate_gap = (maximum_hate - hate) / maximum_hate
  - maximum_hate = 1.0 (100%)
  - social_problems = STEP(4.0, 5) (jumps to 400% at month 5)
- **decrease_in_hate** = hate * tolerance / (adaptation_time * 5)
- **restraint_buildup** = maximum_restraint * restraint_threshold * relative_restraint_gap / adaptation_time
  - maximum_restraint = product of government_authority * (1 - violence_in_media * 0.4) + ethical_scruples
  - ethical_scruples = 0.10 (10%)
  - government_authority = STEP(1.0, 10) (government resolve jumps to 100% at month 10)
  - violence_in_media = 0.4 (40% of maximum thinkable)
- **restraint_loss** = hate * social_problems * violence_in_media * restraint_threshold / adaptation_time

### Auxiliaries
- **intolerance** = maximum_tolerance - tolerance
  - maximum_tolerance = 1.0 (100%)
- **violence** = hate * violent_action
- **violent_action** = IF(hate > restraint_threshold, 1, 0)

---

# Model 19: Cholera Epidemic in Zimbabwe

## Model Metadata
- **Runtime**: 0 to 150 days
- **Time Unit**: Day
- **Integration Method**: RK4
- **Time Step (dt)**: 0.125 Day

## Sector: Epidemiology

### Stocks
- **susceptible_population** (initial = 3,000,000)
  - dX/dt = immunity_loss - cholera_infections
- **recently_infected_population** (initial = 1,000)
  - dX/dt = cholera_infections - becoming_mildly_infected - becoming_heavily_infected
- **mildly_infected_population** (initial = 950)
  - dX/dt = becoming_mildly_infected - recovered_from_mild
- **heavily_infected_population** (initial = 50)
  - dX/dt = becoming_heavily_infected - cholera_deaths - recovered_from_heavy
- **recovered_temporarily_immune** (initial = 10,226,000)
  - dX/dt = recovered_from_mild + recovered_from_heavy - immunity_loss

### Flows
- **cholera_infections** = susceptible_population * indirect_infection_rate
- **becoming_mildly_infected** = recently_infected_population * average_health_condition / average_incubation_time
  - average_health_condition = 0.95 (95%)
  - average_incubation_time = 1 day
- **becoming_heavily_infected** = recently_infected_population * (1 - average_health_condition) / average_incubation_time
- **recovered_from_mild** = mildly_infected_population / average_duration_of_illness
  - average_duration_of_illness = 10 days
- **recovered_from_heavy** = heavily_infected_population * (1 - cholera_death_fraction) / average_duration_of_illness
- **cholera_deaths** = heavily_infected_population * cholera_death_fraction / average_duration_of_illness
  - cholera_death_fraction = effect_of_health_services_on_cholera_deaths (from lookup)
- **immunity_loss** = recovered_temporarily_immune / average_immunity_period
  - average_immunity_period = 2190 days (6 years)

### Auxiliaries
- **indirect_infection_rate** = smoothed_fraction_contaminated_water * effect_prevention * connectedness_of_aquifers
  - connectedness_of_aquifers = 0.28
- **fraction_of_infected** = (recently_infected_population + mildly_infected_population + heavily_infected_population) / entire_population
  - entire_population = 13,228,000
- **smoothed_fraction_contaminated_water** = SMOOTH3(effect_infected_on_contamination, 14)
  - initial = 0.0004 (0.04%)
- **level_of_prevention** = 0.10 (10%)
- **state_of_sanitary_infrastructure** = 0.30 (30%)
- **average_state_of_health_services** = 0.15 (15%)
- **effect_prevention** = effect_of_prevention_and_sanitation (from lookup)
- **effect_infected_on_contamination** = effect_of_infected_on_fraction_contaminated_water (from lookup)

## Lookup Tables
- **effect_of_health_services_on_cholera_deaths**
  - Input: average_state_of_health_services
  - Points: (0, 1.0), (0.25, 0.50), (0.50, 0.20), (0.75, 0.05), (1.0, 0)

- **effect_of_prevention_and_sanitation**
  - Input: MAX(level_of_prevention, state_of_sanitary_infrastructure)
  - Points: (0, 1.0), (0.25, 0.90), (0.50, 0.50), (0.75, 0.10), (1.0, 0)

- **effect_of_infected_on_fraction_contaminated_water**
  - Input: fraction_of_infected
  - Points: (0, 0), (0.125, 0.25), (0.25, 0.50), (0.375, 0.75), (0.50, 0.90), (0.75, 0.99), (1.0, 1.0)

---

# Model 20: Overfishing of Bluefin Tuna

## Model Metadata
- **Runtime**: 1990 to 2100
- **Time Unit**: Year
- **Integration Method**: RK4
- **Time Step (dt)**: 0.25 Year

## Sector: Tuna Population

### Stocks
- **tuna_biomass** (initial = 100,000 tonnes in 1990)
  - dX/dt = growth + recruitment - natural_death - catch

### Flows
- **growth** = tuna_biomass * growth_rate
  - growth_rate = 0.04 (4% per year)
- **recruitment** = DELAY FIXED(tuna_biomass * recruitment_rate, maturation_delay, initial_recruitment)
  - recruitment_rate = 0.01 (1% per year)
  - maturation_delay = 4 years
  - initial_recruitment = tuna_biomass * recruitment_rate
- **natural_death** = tuna_biomass / normal_lifetime
  - normal_lifetime = 20 years
- **catch** = total_fishing_effort * boat_efficiency * tuna_biomass

## Sector: Fishing Industry

### Auxiliaries
- **total_fishing_effort** = official_boats + illegal_boats
  - official_boats (initial = 15,000 boats)
  - illegal_boats (initial = 10,000 boats)
- **boat_efficiency** = 0.000004 (0.0004%)
- **policy_implementation_time** = 2 years
- **ICCAT_target** = tuna_biomass perceived through ICCAT_perception_lookup

## Lookup Tables
- **ICCAT_perception**
  - Input: perceived_tuna_relative_to_target
  - Description: Policy response lookup - boats adjusted based on perceived biomass vs sustainable target with 2-year implementation delay
  - Note: Specific points depend on scenario setup and policy parameters