"""Romanian number formatting for user-facing texts, matching the app (mobile/src/theme.ts: "517,06 lei")."""


def num(x, decimals: int | None = None) -> str:
    """350 -> "350", 1.434 -> "1,434", num(0.4, 2) -> "0,40"."""
    s = f"{float(x):g}" if decimals is None else f"{float(x):.{decimals}f}"
    return s.replace(".", ",")


def lei(x) -> str:
    """517.06 -> "517,06 lei" """
    return f"{float(x):.2f}".replace(".", ",") + " lei"


def signed_lei(x) -> str:
    """69.62 -> "+69,62 lei", -248.22 -> "−248,22 lei" """
    return ("+" if float(x) >= 0 else "−") + lei(abs(float(x)))


def pct(x) -> str:
    """42.2 -> "+42,2%", -1.6 -> "−1,6%" """
    return ("+" if float(x) >= 0 else "−") + num(abs(float(x))) + "%"


def months_ago(n: int) -> str:
    return "acum o lună" if n == 1 else f"acum {n} luni"
