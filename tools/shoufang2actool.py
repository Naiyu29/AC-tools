#!/usr/bin/env python3
"""
收方 Excel（水準儀原始資料工作表）→ AC 工具集輸入檔

格式規格見 docs/FORMATS.md。需要 openpyxl（讀 .xlsx）；也接受 CSV。

用法：
  python3 tools/shoufang2actool.py 收方.xlsx --sheet 刨除後原始資料-水準儀 --inspect
  python3 tools/shoufang2actool.py 收方.xlsx --sheet 刨除後原始資料-水準儀 \
      --offsets tools/offsets.example.json --layer 刨除後 --out out/瓊林段_刨除後
  python3 tools/shoufang2actool.py --merge a.import.json b.import.json --out 合併
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import OrderedDict

# 原始資料工作表的固定欄位（標題文字可容忍前後空白與全形）
STATION_HEADERS = ('測站',)
STATION_EL_HEADERS = ('測站高程',)
BACKSIGHT_HEADERS = ('後視讀數', '後視')
MILEAGE_HEADERS = ('里程', '樁號')
# 這些欄是「高程」欄，不是讀數，略過
SKIP_HEADER_SUFFIX = ('高程',)
NON_POINT_HEADERS = set(STATION_HEADERS + STATION_EL_HEADERS + BACKSIGHT_HEADERS + MILEAGE_HEADERS + ('儀器高', '備註', '說明'))
LAYER_SLOT = {'原地面': 1, '刨除後': 2, '舖築後': 3}
DUP_TOLERANCE_M = 0.005  # 交界重複觀測差值提醒門檻 5 mm


def norm(s):
    """標題正規化：去空白、全形轉半形、去掉 Excel 公式殘留（="+1.5"）。"""
    if s is None:
        return ''
    s = str(s).strip()
    s = re.sub(r'^="?(.*?)"?$', r'\1', s)
    s = s.replace('　', '').replace(' ', '')
    s = ''.join(chr(ord(c) - 0xFEE0) if '！' <= c <= '～' else c for c in s)
    return s


def to_float(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(norm(v))
    except ValueError:
        return None


def read_rows(path, sheet=None):
    """回傳 (標題列, 資料列list)。xlsx 讀「值」，不讀公式快取。"""
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.xlsx', '.xlsm'):
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        if sheet is None:
            sheet = wb.sheetnames[0]
        if sheet not in wb.sheetnames:
            sys.exit(f'找不到工作表「{sheet}」，可用：{wb.sheetnames}')
        ws = wb[sheet]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        # 標題若是公式（如 ="+1.5"）而檔案沒有快取值，改讀公式字串本身
        if rows and any(c is None for c in rows[0]):
            ws_f = openpyxl.load_workbook(path, read_only=True)[sheet]
            raw_header = next(ws_f.iter_rows(values_only=True))
            rows[0] = [c if c is not None else raw_header[i] for i, c in enumerate(rows[0])]
    else:
        with open(path, encoding='utf-8-sig', newline='') as f:
            rows = [r for r in csv.reader(f)]
    rows = [r for r in rows if any(c not in (None, '') for c in r)]
    if not rows:
        sys.exit('工作表沒有資料')
    return rows[0], rows[1:]


def list_sheets(path):
    if os.path.splitext(path)[1].lower() in ('.xlsx', '.xlsm'):
        import openpyxl
        return openpyxl.load_workbook(path, read_only=True).sheetnames
    return ['(csv)']


def detect_columns(header):
    """回傳 dict：station, station_el, backsight, mileage（索引）與 points{名稱: 索引}。"""
    h = [norm(c) for c in header]
    cols = {'station': None, 'station_el': None, 'backsight': None, 'mileage': None, 'points': OrderedDict()}

    def find(names):
        for i, c in enumerate(h):
            if c in names:
                return i
        return None

    cols['station'] = find(STATION_HEADERS)
    cols['station_el'] = find(STATION_EL_HEADERS)
    cols['backsight'] = find(BACKSIGHT_HEADERS)
    cols['mileage'] = find(MILEAGE_HEADERS)
    # 讀數欄：介於「里程」之後、第二個「里程」（高程區塊）之前；排除 *高程 與固定欄
    if cols['mileage'] is None:
        return cols
    end = len(h)
    for i in range(cols['mileage'] + 1, len(h)):
        if h[i] in MILEAGE_HEADERS:
            end = i
            break
    for i in range(cols['mileage'] + 1, end):
        name = h[i]
        if not name or name in NON_POINT_HEADERS or name.endswith(SKIP_HEADER_SUFFIX):
            continue
        cols['points'][name] = i
    return cols


def convert(rows, cols, offsets, dup='mean'):
    """
    回傳 (sections, report_lines)
    sections: OrderedDict{里程: [(支距, 高程, 測點名)]}（支距由小到大）
    """
    report = []
    missing_offset = set()
    # 里程 → 測點名 → [(高程, 測站)]
    acc = OrderedDict()
    for r_i, r in enumerate(rows, start=2):
        def cell(i):
            return r[i] if i is not None and i < len(r) else None
        mileage = to_float(cell(cols['mileage']))
        st_el = to_float(cell(cols['station_el']))
        bs = to_float(cell(cols['backsight']))
        station = norm(cell(cols['station'])) if cols['station'] is not None else ''
        if mileage is None:
            continue
        if st_el is None or bs is None:
            report.append(f'第 {r_i} 列 里程 {mileage:g}：缺測站高程或後視讀數，整列略過')
            continue
        hi = st_el + bs
        bucket = acc.setdefault(mileage, OrderedDict())
        for name, idx in cols['points'].items():
            rd = to_float(cell(idx))
            if rd is None:
                continue
            if name not in offsets:
                missing_offset.add(name)
                continue
            bucket.setdefault(name, []).append((round(hi - rd, 4), station))

    sections = OrderedDict()
    for mileage in sorted(acc):
        pts = []
        for name, obs in acc[mileage].items():
            vals = [v for v, _ in obs]
            if len(vals) > 1:
                spread = max(vals) - min(vals)
                flag = ' ⚠️>5mm' if spread > DUP_TOLERANCE_M else ''
                report.append(f'里程 {mileage:g}「{name}」重複觀測 {len(vals)} 次（{"、".join(f"{s}:{v:.3f}" for v, s in obs)}），差 {spread*1000:.0f} mm{flag}，取 {dup}')
            if dup == 'first':
                z = vals[0]
            elif dup == 'last':
                z = vals[-1]
            else:
                z = sum(vals) / len(vals)
            pts.append((float(offsets[name]), round(z, 3), name))
        pts.sort(key=lambda p: p[0])
        if pts:
            sections[mileage] = pts
    if missing_offset:
        report.append('沒有支距對照、已略過的測點：' + '、'.join(sorted(missing_offset)) + '（請補到 offsets.json）')
    return sections, report


def fmt_num(x):
    s = f'{x:.3f}'.rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'


def to_section_text(sections):
    lines = []
    for m, pts in sections.items():
        els = ' '.join(f'{z:.3f}' for _, z, _ in pts)
        offs = ' '.join(fmt_num(o) for o, _, _ in pts)
        lines.append(f'{fmt_num(m)} {els} {offs}')
    return '\n'.join(lines)


def to_slope_text(sections, offset=0.0):
    lines = []
    for m, pts in sections.items():
        hit = [z for o, z, _ in pts if abs(o - offset) < 1e-9]
        if hit:
            lines.append(f'{fmt_num(m)} {hit[0]:.3f}')
    return '\n'.join(lines)


def make_import_json(layer, text, offsets):
    slot = LAYER_SLOT.get(layer)
    if slot is None:
        sys.exit(f'--layer 必須是 {list(LAYER_SLOT)} 之一')
    data = {'n1': '', 'd1': '', 'n2': '', 'd2': '', 'n3': '', 'd3': '',
            'c': ' '.join(fmt_num(v) for v in sorted(float(x) for x in offsets.values()))}
    data[f'n{slot}'] = layer
    data[f'd{slot}'] = text
    return data


def merge_imports(paths):
    merged = {'n1': '', 'd1': '', 'n2': '', 'd2': '', 'n3': '', 'd3': '', 'c': ''}
    for p in paths:
        with open(p, encoding='utf-8') as f:
            d = json.load(f)
        for k in ('n1', 'd1', 'n2', 'd2', 'n3', 'd3', 'c'):
            if d.get(k) and not merged[k]:
                merged[k] = d[k]
    return merged


def main():
    ap = argparse.ArgumentParser(description='收方 Excel → AC 工具集輸入檔（規格：docs/FORMATS.md）')
    ap.add_argument('workbook', nargs='?', help='.xlsx 或 .csv')
    ap.add_argument('--sheet', help='工作表名稱（預設第一張）')
    ap.add_argument('--inspect', action='store_true', help='只列出工作表與偵測到的欄位')
    ap.add_argument('--offsets', help='測點名稱→支距 JSON（見 tools/offsets.example.json）')
    ap.add_argument('--layer', default='刨除後', choices=list(LAYER_SLOT), help='此資料屬於哪一層（決定 JSON 匯入檔放 d1/d2/d3）')
    ap.add_argument('--dup', default='mean', choices=['mean', 'first', 'last'], help='交界重複觀測的處理')
    ap.add_argument('--out', help='輸出檔前綴（不含副檔名）')
    ap.add_argument('--merge', nargs='+', metavar='IMPORT_JSON', help='合併多個 .import.json 成三層一檔')
    args = ap.parse_args()

    if args.merge:
        if not args.out:
            sys.exit('--merge 需要 --out')
        merged = merge_imports(args.merge)
        with open(args.out + '.import.json', 'w', encoding='utf-8') as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
        print(f'已合併 → {args.out}.import.json（'
              + '、'.join(f'{k}={"有" if merged["d"+k[1]] else "無"}' for k in ('n1', 'n2', 'n3')) + '）')
        return

    if not args.workbook:
        ap.error('請給 workbook 或 --merge')

    if args.inspect:
        print('工作表：', list_sheets(args.workbook))
        header, rows = read_rows(args.workbook, args.sheet)
        cols = detect_columns(header)
        print('標題列：', [norm(c) for c in header])
        print('偵測欄位：測站=%s 測站高程=%s 後視=%s 里程=%s' % tuple(
            (norm(header[i]) if i is not None else '找不到') for i in (cols['station'], cols['station_el'], cols['backsight'], cols['mileage'])))
        print('讀數欄（測點）：', list(cols['points']))
        print('資料列數：', len(rows))
        return

    if not args.offsets or not args.out:
        ap.error('轉換需要 --offsets 與 --out')
    with open(args.offsets, encoding='utf-8') as f:
        offsets = {norm(k): v for k, v in json.load(f).items() if not k.startswith('_')}

    header, rows = read_rows(args.workbook, args.sheet)
    cols = detect_columns(header)
    for key, label in (('mileage', '里程'), ('station_el', '測站高程'), ('backsight', '後視讀數')):
        if cols[key] is None:
            sys.exit(f'標題列找不到「{label}」欄，請用 --inspect 確認工作表')
    sections, report = convert(rows, cols, offsets, args.dup)
    if not sections:
        sys.exit('沒有轉出任何斷面：請檢查支距對照表的測點名稱是否與標題一致')

    sec_text = to_section_text(sections)
    slope_text = to_slope_text(sections, 0.0)
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    with open(args.out + '.斷面.txt', 'w', encoding='utf-8') as f:
        f.write(sec_text + '\n')
    with open(args.out + '.縱坡.txt', 'w', encoding='utf-8') as f:
        f.write(slope_text + '\n')
    with open(args.out + '.import.json', 'w', encoding='utf-8') as f:
        json.dump(make_import_json(args.layer, sec_text, offsets), f, ensure_ascii=False, indent=2)
    summary = [f'來源：{args.workbook}（{args.sheet or "第一張"}）', f'層別：{args.layer}',
               f'斷面數：{len(sections)}，里程 {fmt_num(min(sections))}～{fmt_num(max(sections))}',
               '各里程點數：' + '、'.join(f'{fmt_num(m)}:{len(p)}' for m, p in sections.items()),
               f'縱坡（支距 0）點數：{len(slope_text.splitlines())}', '']
    with open(args.out + '.report.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(summary + report) + '\n')
    print('\n'.join(summary + report))
    print(f'\n已輸出：{args.out}.斷面.txt / .縱坡.txt / .import.json / .report.txt')


if __name__ == '__main__':
    main()
