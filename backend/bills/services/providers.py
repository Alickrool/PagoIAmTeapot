"""Map whatever the bill prints ("ENGIE Romania S.A.") to the canonical provider name we store,
so an uploaded bill is compared with that provider's history."""

KNOWN = {
    "engie": "Engie",
    "ppc": "PPC",
    "enel": "PPC",  # Enel Romania was rebranded to PPC
    "hidroelectrica": "Hidroelectrica",
    "e.on": "E.ON",
    "eon": "E.ON",
    "electrica": "Electrica Furnizare",
    "digi": "Digi",
    "rcs": "Digi",
    "orange": "Orange",
    "vodafone": "Vodafone",
    "apa brasov": "Apa Brasov",
    "compania apa": "Apa Brasov",
}


def normalize(name: str) -> str:
    low = name.lower()
    for key, canonical in KNOWN.items():
        if key in low:
            return canonical
    return name.strip()
