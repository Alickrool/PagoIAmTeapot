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


MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie",
          "noiembrie", "decembrie"]


def month_label(month: str) -> str:
    """"2026-09" -> "septembrie 2026" """
    year, m = month.split("-")
    return f"{MONTHS[int(m) - 1]} {year}"


def date_ro(d) -> str:
    """date(2026, 11, 16) -> "16.11.2026" """
    return f"{d:%d.%m.%Y}"


def plural(n: int, one: str, many: str) -> str:
    """Romanian counting: 1 zi, 5 zile, 20 de zile, 101 zile."""
    if n == 1:
        return f"1 {one}"
    return f"{n} {many}" if n < 20 or 0 < n % 100 < 20 else f"{n} de {many}"


def minutes(n: int) -> str:
    return plural(n, "minut", "minute")
