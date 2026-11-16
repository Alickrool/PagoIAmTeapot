"""Static reference data for the demo.

ALL NUMBERS HERE ARE ILLUSTRATIVE DEMO VALUES, not real market prices or
official statistics. Replace with real sources (ANRE price comparator,
INS statistics) if this goes beyond the hackathon.
"""

# Average monthly household consumption per county (illustrative).
COUNTY_AVERAGES = {
    "electricity": {"Brasov": 175.0, "Romania": 160.0, "unit": "kWh"},
    # Gas is very seasonal; this is a per-month average for Oct-Mar.
    "gas": {"Brasov": 520.0, "Romania": 480.0, "unit": "kWh"},
}

# "Offers available in Pago" used for the switch-supplier action.
# all_in_price = RON per kWh, VAT and regulated tariffs included (illustrative).
OFFERS = {
    "electricity": [
        {"supplier": "Hidroelectrica", "offer": "Casa Verde (demo)", "all_in_price": 1.26},
        {"supplier": "E.ON", "offer": "Fix 12 luni (demo)", "all_in_price": 1.33},
        {"supplier": "Electrica Furnizare", "offer": "Eco Home (demo)", "all_in_price": 1.39},
    ],
    # Household gas is capped at 0.31 lei/kWh until 31 March 2027, so offers can only be at or below it.
    "gas": [
        {"supplier": "Engie", "offer": "Gaz Casnic (demo)", "all_in_price": 0.30},
        {"supplier": "E.ON", "offer": "Gaz Confort (demo)", "all_in_price": 0.30},
    ],
}

# Market reference for the "above market" anomaly (typical all-in price incl. VAT, illustrative).
# Electricity all-in = (energy ~0.55-0.65 + regulated ~0.50) x 1.21. Gas = the 0.31 lei/kWh household cap.
MARKET_REFERENCE_PRICE = {"electricity": 1.33, "gas": 0.31}


def offers_for(category: str, consumption: float | None, current_total: float, current_supplier: str):
    if not consumption:
        return []
    result = []
    for o in OFFERS.get(category, []):
        if o["supplier"].lower() == current_supplier.lower():
            continue
        estimated = round(o["all_in_price"] * consumption, 2)
        savings = round(current_total - estimated, 2)
        if savings > 0:
            result.append({**o, "estimated_total": estimated, "savings": savings})
    return sorted(result, key=lambda x: -x["savings"])
