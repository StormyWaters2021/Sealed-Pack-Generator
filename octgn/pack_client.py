# Universal OCTGN sealed-product client.
# Uses only OCTGN webRead() plus basic string operations; no JSON/webPost required.

PACK_API_URL = "https://sealed.tcgbuilder.net"

def _web_read(url):
    result = webRead(url)
    # Current OCTGN wrappers return (body, status). Keep a fallback for builds
    # that expose only the response body.
    if isinstance(result, tuple):
        return result[0], result[1]
    return result, 200

def _parse_response(raw):
    if raw is None or raw == "":
        raise Exception("Sealed pool generator returned no data.")

    data = {"models": []}
    lines = str(raw).split("\n")
    if len(lines) == 0:
        raise Exception("Sealed pool generator returned no data.")

    first = lines[0].strip()
    if first == "ERROR":
        code = "UNKNOWN_ERROR"
        message = "Sealed pool generator error."
        for line in lines[1:]:
            parts = line.rstrip("\r").split("\t")
            if len(parts) >= 2 and parts[0] == "CODE":
                code = parts[1]
            elif len(parts) >= 2 and parts[0] == "MESSAGE":
                message = parts[1]
        raise Exception(code + ": " + message)

    if first != "OK":
        raise Exception("Unexpected sealed pool generator response.")

    for line in lines[1:]:
        parts = line.rstrip("\r").split("\t")
        if len(parts) < 2:
            continue
        if parts[0] == "MODEL" and len(parts) >= 3:
            data["models"].append((parts[1], int(parts[2])))
        else:
            data[parts[0].lower()] = parts[1:]
    return data

def _request(path):
    raw, status = _web_read(PACK_API_URL + path)
    if status < 200 or status >= 300:
        raise Exception("Sealed pool generator HTTP error: " + str(status))
    return _parse_response(raw)

def get_sets(game_id):
    return _request("/octgn/sets?gameid=" + str(game_id))

def generate_product(game_id, set_id, product, seed=None):
    url = ("/octgn/generate?gameid=" + str(game_id)
           + "&set=" + str(set_id)
           + "&product=" + str(product))
    if seed is not None and str(seed) != "":
        url += "&seed=" + str(seed)
    return _request(url)

def open_pool_code(code):
    return _request("/octgn/open?code=" + str(code))

def get_verification_code(result):
    values = result.get("code", [])
    if len(values) == 0:
        return ""
    return values[0]

def get_selected_model_ids(result):
    ids = []
    for model_id, qty in result.get("models", []):
        for i in range(qty):
            ids.append(model_id)
    return ids

def report_verification_code(result):
    notify("Sealed Pool Code: " + get_verification_code(result))
