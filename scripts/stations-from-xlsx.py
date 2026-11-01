"""실시간도착_역정보 xlsx → lib/subway/stations.json (표준 라이브러리만 사용)

python3 -I scripts/stations-from-xlsx.py <xlsx 경로>
출처: 서울 열린데이터광장 OA-12764 '실시간도착_역정보'
"""
import json, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_rows(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        for row in sheet.iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if c.get("t") == "inlineStr":
                    text = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                elif v is None:
                    continue
                else:
                    text = shared[int(v.text)] if c.get("t") == "s" else v.text
                cells[col_index(c.get("r"))] = text.strip()
            yield [cells.get(i, "") for i in range(max(cells, default=-1) + 1)]


if __name__ == "__main__":
    rows = list(read_rows(sys.argv[1]))
    if "--peek" in sys.argv:
        for r in rows[:8]:
            print(r)
        print("rows:", len(rows))
        sys.exit()

    # 같은 역명(환승역, 동명이역 '양평' 포함)은 하나로 묶는다. 역명 = API 역명
    lines_by_name = {}
    for subway_id, _statn_id, name, _line in (r[:4] for r in rows[1:] if len(r) >= 4 and r[0]):
        lines_by_name.setdefault(name, set()).add(subway_id)
    stations = [{"name": n, "lines": sorted(ids)} for n, ids in sorted(lines_by_name.items())]
    with open("lib/subway/stations.json", "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(len(stations), "stations")
