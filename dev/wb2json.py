"""Exports a workbook's cached cell values the way the browser import reads them:
each sheet as rows of cells; a date cell becomes "D:YYYY-MM-DD"."""
import sys, json, datetime, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {}
for ws in wb:
    rows = []
    for r in ws.iter_rows(values_only=True):
        row = []
        for v in r:
            if isinstance(v, datetime.datetime) or isinstance(v, datetime.date):
                v = "D:" + v.strftime("%Y-%m-%d")
            row.append(v)
        while row and row[-1] is None: row.pop()
        rows.append(row)
    while rows and not rows[-1]: rows.pop()
    out[ws.title] = rows
json.dump(out, open(sys.argv[2], "w"))
