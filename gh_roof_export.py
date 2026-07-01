# ─────────────────────────────────────────────────────────────────
# GRASSHOPPER PYTHON COMPONENT — Roof Frame Exporter
# ─────────────────────────────────────────────────────────────────
# HOW TO USE:
#   1. Add a "Python 3 Script" component to your GH canvas
#   2. Add these inputs:
#        V    → right-click → Type: Point3d, Access: List
#              Connect to BouncySolver  "V"  output
#        p    → right-click → Type: float,   Access: Item
#              Connect to Pressure slider (0.1 → 1 range)
#        save → right-click → Type: bool,    Access: Item
#              Connect to a Boolean Toggle (flip to True to export)
#   3. Paste this entire script into the component
#   4. To capture a frame:
#        a) Set Pressure slider to desired value
#        b) Press Reset in Kangaroo and WAIT for convergence
#           (watch the BouncySolver iteration counter stop changing)
#        c) Flip the Boolean Toggle to True → frame is exported
#        d) Flip back to False (ready for next frame)
# ─────────────────────────────────────────────────────────────────

import json
import os
import math
import System
import Grasshopper as gh

OUTPUT_PATH = r"D:\BAUHAUS\SEM 2\VS CODE FILES\Rewire Wolfsburg Interface\deployables-test\public\roof_morph.json"

# Get base mesh topology from Relay each time (in case it changed)
doc = gh.Instances.ActiveCanvas.Document
relay_id = System.Guid("e2db253d-9e22-471a-bd44-e9b888effeb1")
relay_obj = doc.FindObject(relay_id, True)
base_mesh_items = list(relay_obj.VolatileData.AllData(True))
base_mesh = base_mesh_items[0].Value

faces = []
for i in range(base_mesh.Faces.Count):
    f = base_mesh.Faces[i]
    if f.IsQuad:
        faces.append([f.A, f.B, f.C, f.D])
    else:
        faces.append([f.A, f.B, f.C, f.C])

if save:
    verts = [[round(pt.X, 4), round(pt.Y, 4), round(pt.Z, 4)] for pt in V]
    valid_count = sum(1 for v in verts if not math.isnan(v[2]))

    if valid_count < len(verts):
        a = "⚠ Simulation not converged ({}/{} valid vertices). Wait longer.".format(valid_count, len(verts))
    else:
        pressure_key = round(float(p), 3)

        # Load or initialise the JSON file
        if os.path.exists(OUTPUT_PATH):
            with open(OUTPUT_PATH) as fp:
                data = json.load(fp)
        else:
            data = {"faces": faces, "frames": []}

        # Always keep face topology up-to-date
        data["faces"] = faces

        # Replace or append frame for this pressure
        existing = [i for i, fr in enumerate(data["frames"])
                    if abs(fr["pressure"] - pressure_key) < 0.002]
        frame = {"pressure": pressure_key, "vertices": verts}

        if existing:
            data["frames"][existing[0]] = frame
            action = "Updated"
        else:
            data["frames"].append(frame)
            data["frames"].sort(key=lambda x: x["pressure"])
            action = "Added"

        with open(OUTPUT_PATH, "w") as fp:
            json.dump(data, fp)

        total = len(data["frames"])
        pressures = [fr["pressure"] for fr in data["frames"]]
        a = "{} frame p={} | {} frames total: {}".format(
            action, pressure_key, total, pressures)
else:
    # Status read-out when not saving
    valid = sum(1 for pt in V if not math.isnan(pt.Z))
    if valid > 0:
        maxz = max(pt.Z for pt in V if not math.isnan(pt.Z))
        a = "Ready — {} valid verts, MaxZ={:.2f}m at p={:.3f}. Flip [save] to export.".format(
            valid, maxz, float(p))
    else:
        a = "Simulation not converged — all vertices NaN. Wait or press Reset."
