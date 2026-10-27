"""Read the supplied workbook's cached values without Excel, add-ins or macro execution.
Python 3 standard library only. Called by verify-workbook.mjs; no data is persisted.
"""
import sys, json, zipfile, xml.etree.ElementTree as ET, hashlib

path = sys.argv[1]
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        shared = [''.join(t.text or '' for t in si.iterfind('.//s:t', ns)) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    cells = {}
    for c in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iterfind('.//s:c', ns):
        v = c.find('s:v', ns)
        value = v.text if v is not None else None
        kind = c.get('t')
        if kind == 's' and value is not None:
            value = shared[int(value)]
        elif kind == 'inlineStr':
            value = ''.join(t.text or '' for t in c.iterfind('.//s:t', ns))
        elif kind not in ('str', 'e') and value is not None:
            value = float(value)
        cells[c.get('r')] = value
    def cell(col, row):
        return cells.get(f'{col}{row}')
    stock = [{'date': cell('A', r), 'close': cell('B', r), 'volume': cell('H', r)} for r in range(5537, 3, -1)]
    def history(d, c):
        return [{'date':cell(d,r),'close':cell(c,r)} for r in range(4, 9285) if isinstance(cell(d,r),str) and isinstance(cell(c,r),(int,float))]
    expected = [{'date':cell('A',r),'row':r,**{key:cell(col,r) for key,col in [('sectorRatio','J'),('marketRatio','K'),('score','U'),('distance','R'),('z','X')]}} for r in range(5537,3,-1)]
with open(path, 'rb') as f:
    digest = hashlib.sha256(f.read()).hexdigest()
json.dump({'sha256':digest,'stock':stock,'sector':history('C','D'),'market':history('E','F'),'expected':expected},sys.stdout)
