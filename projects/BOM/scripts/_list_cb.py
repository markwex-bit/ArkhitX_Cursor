import pandas as pd
from datetime import datetime

def dk(v):
    s = str(v).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return s

s = pd.read_parquet("samples/stacked_costbooks.parquet")
keys = s.drop_duplicates(subset=["Vehicle Code", "Milestone", "Milestone Date"])
print("Total:", len(keys))
for _, row in keys.iterrows():
    v = str(row["Vehicle Code"])
    print(f"{row['Milestone']} {dk(row['Milestone Date'])} | {v[:72]}")
