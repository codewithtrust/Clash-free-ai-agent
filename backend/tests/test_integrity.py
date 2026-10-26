from __future__ import annotations


def _clash_events(client):
    clashes = client.get("/api/clashes").json()["clashes"]
    assert len(clashes) == 2
    return clashes


def test_demo_seed_and_capabilities(demo):
    client = demo["client"]
    summary = demo["dashboard"]["summary"]
    assert summary == {
        "events": 8,
        "approved": 0,
        "synced": 0,
        "core": 5,
        "clashes": 2,
        "unparsed": 1,
        "sources": 1,
        "readiness": 0,
    }
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert health["capabilities"]["deterministicParser"] is True
    assert health["capabilities"]["icsExport"] is True


def test_unparsed_rows_are_never_dropped(demo):
    client = demo["client"]
    rows = client.get("/api/unparsed").json()["rows"]
    assert len(rows) == 1
    row = rows[0]
    assert "BIO 115" in row["raw_text"]
    assert "time" in row["reason"].lower()
    assert row["source_row"] == 11


def test_approval_gate_blocks_clash_linked_events(demo):
    client = demo["client"]
    result = client.post("/api/approvals", json={"approve_all": True}).json()
    assert result["blocked"] == 4
    assert result["updated"] == 4
    assert result["approved"] == 4
    assert result["sync"]["ready"] is False
    assert result["sync"]["openClashes"] == 2

    clash = _clash_events(client)[0]
    response = client.post(f"/api/events/{clash['event_a_id']}/approval")
    assert response.status_code == 422
    assert "clash" in response.json()["detail"].lower()


def test_keep_one_resolves_and_ignores_the_other(demo):
    client = demo["client"]
    clash = _clash_events(client)[0]
    chosen = clash["event_a_id"]
    response = client.patch(f"/api/clashes/{clash['id']}", json={"action": "keep_a"})
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"

    events = client.get("/api/events").json()["events"]
    assert len(events) == 7
    assert chosen in {event["id"] for event in events}
    assert clash["event_b_id"] not in {event["id"] for event in events}

    summary = client.get("/api/dashboard").json()["summary"]
    assert summary["events"] == 7
    assert summary["clashes"] == 1
    assert summary["approved"] == 0


def test_keep_both_allows_clean_approval_and_ics(demo):
    client = demo["client"]
    for clash in _clash_events(client):
        response = client.patch(f"/api/clashes/{clash['id']}", json={"action": "keep_both"})
        assert response.status_code == 200

    preview = client.get("/api/sync/preview").json()
    assert preview["openClashes"] == 0
    assert preview["ready"] is False  # nothing approved yet

    result = client.post("/api/approvals", json={"approve_all": True}).json()
    assert result["blocked"] == 0
    assert result["approved"] == 8
    assert result["sync"]["ready"] is True

    ics = client.get("/api/sync/ics")
    assert ics.status_code == 200
    assert ics.headers["content-type"].startswith("text/calendar")
    body = ics.text
    assert body.count("BEGIN:VEVENT") == 8
    assert body.count("X-CLASHFREE-TRACE-ID:") == 8
    assert body.count("X-CLASHFREE-SOURCE-ID:") == 8
    assert "EXDATE" in body


def test_reprocess_is_idempotent(demo):
    client = demo["client"]
    source_id = demo["source_id"]
    first = client.post(f"/api/sources/{source_id}/reprocess").json()["stats"]
    assert first["new"] == 0
    assert first["updated"] == 0
    assert first["unchanged"] == 8
    assert first["unparsed"] == 1

    second = client.post(f"/api/sources/{source_id}/reprocess").json()["stats"]
    assert second["new"] == 0
    assert second["updated"] == 0
    assert second["unchanged"] == 8

    assert len(client.get("/api/events").json()["events"]) == 8
    assert len(client.get("/api/unparsed").json()["rows"]) == 1


def test_resolved_clash_audit_survives_reprocess(demo):
    client = demo["client"]
    clash = _clash_events(client)[0]
    client.patch(f"/api/clashes/{clash['id']}", json={"action": "keep_both"})
    client.post(f"/api/sources/{demo['source_id']}/reprocess")

    resolved = client.get("/api/clashes?include_resolved=true").json()["clashes"]
    kept = next(item for item in resolved if item["id"] == clash["id"])
    assert kept["status"] == "resolved"
    assert "keep both" in kept["resolution"].lower()


def test_custom_source_and_settings_round_trip(demo):
    client = demo["client"]
    settings = client.get("/api/settings").json()
    settings["institution"] = "Test Institute"
    settings["termStart"] = "2026-09-01"
    settings["termEnd"] = "2026-12-20"
    response = client.put("/api/settings", json=settings)
    assert response.status_code == 200
    assert response.json()["institution"] == "Test Institute"

    upload = client.post(
        "/api/sources/upload",
        files={
            "file": (
                "mini.csv",
                "course,title,day,start,end,room\nCS 101,Intro Lecture,Mon,09:00,10:00,R1\n",
                "text/csv",
            )
        },
    )
    assert upload.status_code == 200
    payload = upload.json()
    assert payload["stats"]["parsed"] + payload["stats"]["unparsed"] == 1
    assert payload["source"]["name"] == "mini.csv"

    # The new source is checked against the seeded schedule and surfaces its own clash.
    clashes = client.get("/api/clashes").json()["clashes"]
    assert len(clashes) == 3
