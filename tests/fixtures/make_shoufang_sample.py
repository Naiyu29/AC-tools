#!/usr/bin/env python3
"""產生一份依 shoufang-survey workbook-format.md 版面的收方樣本 xlsx（含公式），供轉換器測試。"""
import sys
import openpyxl

def build(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '刨除後原始資料-水準儀'
    header = ['測站', '測站高程', '後視讀數', '儀器高', '里程', '公車彎', '新路邊', '舊路邊', '新路心', '="+1.5"', '人行道',
              '里程', '公車彎高程', '新路邊高程', '舊路邊高程', '新路心高程', '+1.5高程', '人行道高程']
    ws.append(header)
    # (測站, 測站高程, 後視, 里程, 公車彎, 新路邊, 舊路邊, 新路心, +1.5, 人行道)
    rows = [
        ('T1', 12.863, 1.697, 0,   None,  1.80, 1.75, 1.70, 1.72, 1.78),
        ('T1', 12.863, 1.697, 20,  None,  1.76, 1.71, 1.66, 1.68, 1.74),
        ('T1', 12.863, 1.697, 40,  2.10,  1.72, 1.67, 1.62, 1.64, 1.70),
        # 遷站：T2（HI=13.564）在 40 重複觀測（交界檢核），新路心差 4 mm、新路邊差 8 mm
        ('T2', 11.863, 1.701, 40,  None,  0.716, 0.674, 0.620, 0.640, 0.704),
        ('T2', 11.863, 1.701, 60,  None,  0.68, 0.63, 0.58, 0.60, 0.66),
        ('標題列再出現一次也不該當資料', None, None, None, None, None, None, None, None, None),
    ]
    for i, (st, el, bs, m, *rd) in enumerate(rows, start=2):
        ws.append([st, el, bs, f'=B{i}+C{i}', m, *rd, f'=E{i}'] + [f'=$D{i}-{c}{i}' for c in 'FGHIJK'])
    wb.save(path)

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'shoufang_sample.xlsx')
