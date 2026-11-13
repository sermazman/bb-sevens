#!/usr/bin/env python3
"""Comprueba que player_icons/ tiene todos los PNG que pide icons.json.
Uso:  python tools/validate_icons.py [player_icons/icons.json]
Revisa: existencia de ICONO_BASE.png e ICONO_1..N.png, tamaño 38x38, canal alfa,
        y avisa de PNG sueltos que no se usan.
"""
import sys, os, json
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else 'player_icons/icons.json'
folder = os.path.dirname(path) or '.'
data = json.load(open(path, encoding='utf-8'))
size = data.get('size', 38)

missing, bad, expected = [], [], set()
for icon, n in sorted(data['layers'].items()):
    for suffix in ['BASE'] + [str(i) for i in range(1, n + 1)]:
        fn = f'{icon}_{suffix}.png'
        expected.add(fn)
        fp = os.path.join(folder, fn)
        if not os.path.isfile(fp):
            missing.append(fn); continue
        im = Image.open(fp)
        if im.size != (size, size):
            bad.append(f'{fn}: mide {im.size[0]}x{im.size[1]} (debe ser {size}x{size})')
        elif 'A' not in im.getbands() and im.mode != 'P':
            bad.append(f'{fn}: sin transparencia ({im.mode})')

extra = sorted(f for f in os.listdir(folder) if f.lower().endswith('.png') and f not in expected)
done = [i for i, n in data['layers'].items()
        if all(os.path.isfile(os.path.join(folder, f'{i}_{s}.png')) for s in ['BASE'] + list(map(str, range(1, n + 1))))]
print(f'Iconos completos: {len(done)} de {len(data["layers"])}')
if bad:
    print(f'\nPROBLEMAS ({len(bad)}):'); [print(' -', b) for b in bad]
if extra:
    print(f'\nPNG que no están en icons.json ({len(extra)}):'); [print(' -', e) for e in extra]
if missing:
    print(f'\nFALTAN {len(missing)} archivos:')
    by = {}
    for m in missing: by.setdefault(m.rsplit('_', 1)[0], []).append(m.rsplit('_', 1)[1][:-4])
    for k, v in by.items(): print(f' - {k}: {", ".join(v)}')
sys.exit(1 if bad else 0)
