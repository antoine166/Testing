# ============================================================
# Breakthrough Season Lab — Revenue Calculator (Interactive)
# ============================================================

# --- Fixed pricing (change these if your prices change) ---
cohort_price_per_payment = 429
number_of_payments = 4
franchise_price = 3500

cohort_price_total = cohort_price_per_payment * number_of_payments

print("=" * 50)
print("  BREAKTHROUGH SEASON LAB — REVENUE CALCULATOR")
print("=" * 50)

# --- LESSON 5: input()
# input() pauses the program and waits for the user to type something.
# int() converts what they typed (text) into a number so we can do math.

cohort_athletes = int(input("\nHow many cohort athletes? (max 12): "))
franchise_athletes = int(input("How many Franchise Intensive athletes? ($3,500 each): "))

# --- Calculate ---
cohort_revenue = cohort_athletes * cohort_price_total
franchise_revenue = franchise_athletes * franchise_price
total_revenue = cohort_revenue + franchise_revenue

# --- LESSON 6: if / else
# This lets the program make decisions based on conditions.

if cohort_athletes > 12:
    print("\n  ⚠️  Cohort max is 12 athletes — adjust your number.")
else:
    print("\n" + "=" * 50)
    print("  YOUR REVENUE BREAKDOWN")
    print("=" * 50)
    print(f"\n  Cohort athletes:      {cohort_athletes} × ${cohort_price_total:,} = ${cohort_revenue:,}")
    print(f"  Franchise athletes:   {franchise_athletes} × ${franchise_price:,} = ${franchise_revenue:,}")
    print(f"\n  TOTAL REVENUE:        ${total_revenue:,}")

    # Bonus: show how far from a full cohort
    remaining_spots = 12 - cohort_athletes
    if remaining_spots > 0:
        potential_upside = remaining_spots * cohort_price_total
        print(f"\n  {remaining_spots} cohort spot(s) still open → ${potential_upside:,} upside if filled")
    else:
        print("\n  Cohort is FULL — maximum revenue locked in!")

    print("\n" + "=" * 50)
