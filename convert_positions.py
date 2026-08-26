#!/usr/bin/env python3
"""
convert_positions.py — Convierte el Excel de posiciones (Teams_App.xlsx) al
positions.json que usa rosters.html.

USO:
    python3 convert_positions.py Teams_App.xlsx
    python3 convert_positions.py Teams_App.xlsx rosters/positions.json

Si no indicas el archivo de salida, se genera "positions.json" en la carpeta
actual (luego lo subes tú a rosters/positions.json en el repo).

REQUISITOS (una sola vez):
    pip install pandas openpyxl

Qué hace exactamente:
  1. Lee la primera hoja del Excel.
  2. Descarta filas de cabecera de cada raza (sin TYPE) y filas basura al
     final del archivo (sin RACE) — igual que hicimos a mano al principio.
  3. Limpia tipos de datos: números como número, habilidades separadas por
     comas como lista, "Big Guy" como true/false.
  4. Avisa (sin detener el proceso) de cosas que conviene revisar a mano:
       - Combinaciones raza+posición duplicadas.
       - Filas a las que les falta algún dato básico (MA/ST/AG/PA/AV/precio).
  5. Escribe el JSON final y muestra un resumen.
"""

import sys
import json
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Falta 'pandas'. Instálalo con:\n    pip install pandas openpyxl")
    sys.exit(1)


REQUIRED_COLUMNS = ["RACE", "TYPE", "MA", "ST", "AG", "PA", "AV", "SKILLS", "PRIZE", "QTY", "BG", "CLAVE"]


def clean_skills(value):
    """Convierte 'Bloqueo, Placar' -> ['Bloqueo', 'Placar']. Vacío/NaN -> []"""
    if pd.isna(value):
        return []
    if isinstance(value, (int, float)):
        return []
    return [s.strip() for s in str(value).split(",") if s.strip()]


def num(value):
    """Convierte a int si es un número entero, a float si tiene decimales, None si está vacío."""
    if pd.isna(value):
        return None
    f = float(value)
    return int(f) if f.is_integer() else f


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 convert_positions.py <archivo.xlsx> [salida.json]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("positions.json")

    if not input_path.exists():
        print(f"❌ No encuentro el archivo: {input_path}")
        sys.exit(1)

    print(f"📂 Leyendo {input_path} ...")
    df = pd.read_excel(input_path, sheet_name=0)

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        print(f"⚠️  Aviso: no encuentro estas columnas esperadas: {missing_cols}")
        print("    (si les cambiaste el nombre en el Excel, el script puede fallar más abajo)")

    primsec_col = df.columns[-1]  # última columna = "SKILLS Prim / Sec"

    total_rows = len(df)
    clean = df[df["RACE"].notna() & df["TYPE"].notna()].copy()
    discarded = total_rows - len(clean)
    print(f"   {total_rows} filas totales, {len(clean)} filas de posiciones válidas, {discarded} descartadas (cabeceras de raza / filas vacías al final).")

    records = []
    warnings = []
    seen_keys = {}

    for idx, row in clean.iterrows():
        race = str(row["RACE"]).strip()
        ptype = str(row["TYPE"]).strip()
        key = (race.lower(), ptype.lower())

        clave_val = None if pd.isna(row.get("CLAVE")) else str(row["CLAVE"]).strip()
        primsec_val = None if pd.isna(row.get(primsec_col)) else str(row[primsec_col]).strip()

        record = {
            "race": race,
            "type": ptype,
            "ma": num(row.get("MA")),
            "st": num(row.get("ST")),
            "ag": num(row.get("AG")),
            "pa": num(row.get("PA")),
            "av": num(row.get("AV")),
            "skills": clean_skills(row.get("SKILLS")),
            "prize": num(row.get("PRIZE")),
            "qty": num(row.get("QTY")),
            "bigGuy": (not pd.isna(row.get("BG"))) and float(row.get("BG")) == 1.0,
            "clave": clave_val,
            "primSec": primsec_val,
        }
        records.append(record)

        # --- Validaciones ---
        excel_row = idx + 2  # +2: cabecera + índice 0-based -> número de fila real en Excel

        if key in seen_keys:
            warnings.append(f"Fila {excel_row}: '{race} - {ptype}' está duplicado (ya existía en la fila {seen_keys[key]}).")
        else:
            seen_keys[key] = excel_row

        missing_basic = [f for f in ["ma", "st", "ag", "pa", "av", "prize"] if record[f] is None]
        if missing_basic:
            warnings.append(f"Fila {excel_row}: '{race} - {ptype}' le falta: {', '.join(missing_basic)}.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=1)

    print(f"\n✅ Escrito {output_path} con {len(records)} posiciones.")

    if warnings:
        print(f"\n⚠️  {len(warnings)} avisos para revisar (no impiden que el archivo se use, pero conviene mirarlos):")
        for w in warnings:
            print(f"   - {w}")
    else:
        print("\n✨ Sin avisos. Todo limpio.")

    races = sorted(set(r["race"] for r in records))
    print(f"\n📋 {len(races)} razas incluidas: {', '.join(races)}")


if __name__ == "__main__":
    main()
