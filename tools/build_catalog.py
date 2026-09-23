#!/usr/bin/env python3
import argparse
import json
import xml.etree.ElementTree as ET

def main():
    parser = argparse.ArgumentParser(description="Build a case-generator catalog from an OCTGN set.xml.")
    parser.add_argument("set_xml")
    parser.add_argument("output_json")
    parser.add_argument("--set-id", required=True)
    parser.add_argument("--set-name", required=True)
    args = parser.parse_args()

    root = ET.parse(args.set_xml).getroot()
    cards = []

    for card in root.findall(".//card"):
        props = {p.get("name"): p.get("value") for p in card.findall("property")}
        properties = props.get("Properties") or ""
        cards.append({
            "model_id": card.get("id"),
            "name": card.get("name"),
            "collector_number": props.get("Collector Number") or "",
            "unit_type": props.get("Unit Type") or "",
            "rarity": props.get("Rarity") or "",
            "prime": properties == "Prime" or "Prime" in [x.strip() for x in properties.split("|")],
            "properties": properties,
        })

    payload = {
        "schema_version": 1,
        "set_id": args.set_id,
        "set_name": args.set_name,
        "source": args.set_xml,
        "cards": cards,
    }

    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print("Wrote {} cards to {}".format(len(cards), args.output_json))

if __name__ == "__main__":
    main()
