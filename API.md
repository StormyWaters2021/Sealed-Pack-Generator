# Pack Generator API

Base URL: `https://sealed.tcgbuilder.net`

Both interfaces use the same deterministic generation core.

## Public JSON API

`GET /api/games` lists configured games and sets.

`POST /api/generate` requires `Content-Type: application/json`.

Example body:

```json
{
  "game": "heroclix",
  "set": "thunderbolts",
  "product": "box"
}
```

Generic product values are `case`, `box`, and `pack`. `brick` is accepted as an alias for `box`, and `booster` as an alias for `pack`. An optional `seed` may be supplied.

`GET /api/open?code=HC-TB-V3-G3-7M4Q2P8ABC-B1-P01` regenerates an existing product.

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_CODE",
    "message": "..."
  }
}
```

The public API uses normal HTTP status codes.

## OCTGN API

The OCTGN adapter avoids JSON entirely.

`GET /octgn/sets?gameid=<OCTGN-GAME-GUID>`

```text
OK
GAME	HeroClix
SET	thunderbolts	TB	Marvel HeroClix: Thunderbolts
```

`POST /octgn/generate` uses `application/x-www-form-urlencoded`.

Body:

```text
gameid=<OCTGN-GAME-GUID>&set=thunderbolts&product=box
```

Response:

```text
OK
CODE	HC-TB-V3-G3-...
PRODUCT	box
DISPLAY	Brick
MODEL	<MODEL-GUID>	1
MODEL	<MODEL-GUID>	2
```

`GET /octgn/open?code=HC-TB-V3-G3-...` regenerates an existing product.

Expected OCTGN application errors deliberately use HTTP 200 so OCTGN can retain the response body:

```text
ERROR
CODE	INVALID_CODE
MESSAGE	The sealed product code is invalid.
```

The OCTGN client only needs string operations such as `split()`.
