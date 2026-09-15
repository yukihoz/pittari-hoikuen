import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "admission_index_consolidated.json"
OUTPUT = ROOT / "dist" / "admission-data.js"


records = json.loads(SOURCE.read_text(encoding="utf-8"))
payload = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
OUTPUT.write_text(f"window.ADMISSION_DATA={payload};\n", encoding="utf-8")
print(f"wrote {len(records)} admission records to {OUTPUT}")
