# ============================================================
# Breakthrough Season Lab — Athlete Onboarding Tracker
# ============================================================

# --- LESSON 7: Lists
# A list holds multiple items in order.
# athletes = []  means "start with an empty list"

athletes = []

print("=" * 50)
print("  BREAKTHROUGH SEASON LAB — ATHLETE ONBOARDING")
print("=" * 50)

# --- LESSON 8: while loop
# while keeps running as long as the condition is True.
# This lets us keep adding athletes until we're done.

adding = True

while adding:
    print("\n--- NEW ATHLETE ---")

    # --- LESSON 9: Dictionaries
    # A dictionary stores labeled data, like a form.
    # Each piece of data has a "key" (label) and a "value".

    name = input("Athlete name: ")
    email = input("Email: ")
    team = input("Current team: ")
    goal = input("#1 breakthrough goal this season: ")

    print(f"\nRate {name}'s starting level in each dimension (1–10):")
    game_iq     = int(input("  Game IQ (reading space, systems, matchups): "))
    physical    = int(input("  Physical Engine (strength, speed, conditioning): "))
    mindset     = int(input("  Competitive Mindset (pressure, confidence): "))
    fuel        = int(input("  Fuel & Recovery (nutrition, sleep, recovery): "))

    # Build the dictionary for this athlete
    athlete = {
        "name": name,
        "email": email,
        "team": team,
        "goal": goal,
        "scores": {
            "Game IQ": game_iq,
            "Physical Engine": physical,
            "Competitive Mindset": mindset,
            "Fuel & Recovery": fuel,
        }
    }

    # Add this athlete to the list
    athletes.append(athlete)
    print(f"\n  {name} added!")

    another = input("\nAdd another athlete? (yes/no): ")
    if another.lower() != "yes":
        adding = False


# --- LESSON 10: Looping through a list
# for item in list:  runs the block once for each item.

print("\n" + "=" * 50)
print("  COHORT OVERVIEW")
print("=" * 50)

for athlete in athletes:
    print(f"\n  {athlete['name']}  |  {athlete['team']}")
    print(f"  Email:  {athlete['email']}")
    print(f"  Goal:   {athlete['goal']}")
    print(f"  4D Starting Scores:")

    total = 0
    for dimension, score in athlete["scores"].items():
        bar = "█" * score + "░" * (10 - score)
        print(f"    {dimension:<22} {bar}  {score}/10")
        total += score

    average = total / 4
    print(f"  Overall average: {average:.1f}/10")

print(f"\n  Total athletes onboarded: {len(athletes)}")
print("=" * 50)
