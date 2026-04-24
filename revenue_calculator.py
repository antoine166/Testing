# ============================================================
# Breakthrough Season Lab — Revenue Calculator
# ============================================================
# LESSON 1: Variables
# A variable stores a value so you can use it later.
# Think of it like a labeled box.

# --- Pricing ---
cohort_price_per_payment = 429    # dollars
number_of_payments = 4
franchise_price = 3500            # Franchise Player Intensive

# --- Cohort size ---
max_athletes = 12

# --- LESSON 2: Math
# Python does math just like a calculator.
# * = multiply, / = divide, + = add, - = subtract

cohort_price_total = cohort_price_per_payment * number_of_payments

# --- LESSON 3: print()
# print() displays something on the screen.
# The f"..." syntax lets you drop variables into text using {}.

print("=" * 50)
print("  BREAKTHROUGH SEASON LAB — REVENUE SCENARIOS")
print("=" * 50)

print(f"\nCohort price per athlete:  ${cohort_price_total}")
print(f"Franchise Intensive price:  ${franchise_price}")
print(f"Max cohort size:            {max_athletes} athletes")

# --- LESSON 4: Doing calculations with variables ---
# Now we calculate revenue for different fill rates.

print("\n--- COHORT-ONLY SCENARIOS ---")

for athletes_enrolled in [4, 6, 8, 10, 12]:
    revenue = athletes_enrolled * cohort_price_total
    print(f"  {athletes_enrolled:>2} athletes → ${revenue:,}")

# --- Bonus: What if some buy the Franchise Intensive? ---
print("\n--- MIXED SCENARIOS (cohort + Franchise Intensive) ---")

cohort_athletes = 10
franchise_athletes = 2

cohort_revenue = cohort_athletes * cohort_price_total
franchise_revenue = franchise_athletes * franchise_price
total_revenue = cohort_revenue + franchise_revenue

print(f"  {cohort_athletes} cohort + {franchise_athletes} Franchise Intensive")
print(f"  Cohort revenue:     ${cohort_revenue:,}")
print(f"  Franchise revenue:  ${franchise_revenue:,}")
print(f"  TOTAL:              ${total_revenue:,}")

print("\n" + "=" * 50)
print("  END OF REPORT")
print("=" * 50)
