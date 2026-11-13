#!/usr/bin/env python3
"""Excel (player_icons.xlsx, hoja 'iconos') -> player_icons/icons.json
Uso:  python tools/build_icons_json.py player_icons.xlsx [salida=player_icons/icons.json]
Columnas: A race | B type | C icono | D capas | E variante
"""
import sys, json, collections
import openpyxl

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'player_icons/icons.json'
ws = openpyxl.load_workbook(src, data_only=True)['iconos']

icons, errors = {}, []
layers_of = {}
for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    race, typ, icon, capas, var = [(str(x).strip() if x is not None else None) for x in r[:5]]
    if not (race or typ or icon):
        continue
    if not (race and typ and icon):
        errors.append(f'fila {n}: faltan datos (race/type/icono)'); continue
    try:
        capas = int(float(capas))
    except Exception:
        errors.append(f'fila {n}: capas no numérico ({capas!r})'); continue
    if capas not in (3, 4):
        errors.append(f'fila {n}: capas debe ser 3 o 4 ({capas})')
    if icon in layers_of and layers_of[icon] != capas:
        errors.append(f'fila {n}: {icon} aparece con {layers_of[icon]} y {capas} capas')
    layers_of[icon] = capas
    if var:
        layers_of.setdefault(var, capas)
    if typ in icons.setdefault(race, {}):
        errors.append(f'fila {n}: {race} / {typ} duplicado')
    entry = {'icon': icon, 'layers': capas}
    if var:
        entry['variant'] = var
    icons[race][typ] = entry

data = {
    'version': 1,
    'size': 38,
    'base_opacity': 0.6,     # capa _BASE: color de la posición
    'armor_opacity': 0.25,   # capa 2: veladura del color de armadura
    'layers': layers_of,     # icono -> nº de capas (sin contar _BASE)
    'icons': icons,
}
with open(out, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
n_pos = sum(len(v) for v in icons.values())
print(f'{n_pos} posiciones, {len(layers_of)} iconos distintos -> {out}')
if errors:
    print('AVISOS:'); [print(' -', e) for e in errors]; sys.exit(1)
