# Future OCTGN helper for the HeroClix Sealed Pool Generator.
# This file is NOT wired into game actions yet.
#
# The important verification rule is simple:
# OCTGN should load/open a sealed-pool code from the service and report that
# exact code in chat so players can verify it on the public web page.

PACK_API_URL = "https://YOUR-WORKER.workers.dev"

def _get_json(url):
    import json
    raw = webRead(url)
    if raw is None or raw == "":
        raise Exception("Sealed pool generator returned no data.")
    data = json.loads(raw)
    if "error" in data:
        raise Exception("Sealed pool generator error: " + str(data["error"]))
    return data

def open_pool_code(code):
    from System import Uri
    import urllib
    safe_code = urllib.quote(str(code))
    return _get_json(PACK_API_URL + "/api/open?code=" + safe_code)

def get_verification_code(result):
    return result["code"]

def get_selected_model_ids(result):
    selected = result["selected"]
    kind = result["kind"]
    ids = []

    if kind == "pack":
        for card in selected["cards"]:
            ids.append(card["model_id"])
        for card in selected.get("extras", []):
            ids.append(card["model_id"])
        return ids

    if kind == "brick":
        boosters = selected["boosters"]
    else:
        boosters = []
        for brick in selected["bricks"]:
            boosters.extend(brick["boosters"])

    for booster in boosters:
        for card in booster["cards"]:
            ids.append(card["model_id"])
        for card in booster.get("extras", []):
            ids.append(card["model_id"])

    return ids

def report_verification_code(result):
    notify("Sealed Pool Code: " + result["code"])
