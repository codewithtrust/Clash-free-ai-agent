from __future__ import annotations

from datetime import date

from app.config import OUTBOX_DIR


def _minutes(value: str) -> int:
    hour, minute = value.split(":")[:2]
    return int(hour) * 60 + int(minute)


def test_study_plan_covers_every_subject_once(demo):
    client = demo["client"]
    plan = client.get("/api/study-plan").json()

    assert plan["summary"]["blocks"] == 7
    assert plan["summary"]["courses"] == 7
    assert plan["summary"]["minutes"] == 420
    assert plan["summary"]["hours"] == 7.0
    assert plan["summary"]["coverage"] == "7 of 7 courses covered"

    codes = [block["course_code"] for block in plan["blocks"]]
    assert codes == sorted(codes)
    assert set(codes) == {"CS 201", "CS 201L", "DES 110", "ECO 210", "ENG 105", "MTH 204", "PHY 101"}

    for block in plan["blocks"]:
        assert _minutes(block["end_time"]) - _minutes(block["start_time"]) == 60
        assert block["duration_minutes"] == 60
        assert block["day"] not in block["class_days"]
        assert block["focus"]
        assert block["anchor"].startswith("Prep for")
        assert block["date"]
        assert date.fromisoformat(block["date"])


def test_study_blocks_never_overlap_classes_or_each_other(demo):
    client = demo["client"]
    plan = client.get("/api/study-plan").json()
    events = client.get("/api/events").json()["events"]

    scheduled: list[tuple[str, int, int]] = []
    for block in plan["blocks"]:
        start, end = _minutes(block["start_time"]), _minutes(block["end_time"])
        scheduled.append((block["day"], start, end))
        for event in events:
            if event["event_date"] or block["day"] not in event["days"]:
                continue
            class_start = _minutes(event["start_time"])
            class_end = _minutes(event["end_time"])
            assert end <= class_start or start >= class_end, (
                f"{block['course_code']} study block overlaps {event['course_code']} on {block['day']}"
            )

    for index, (day, start, end) in enumerate(scheduled):
        for other_day, other_start, other_end in scheduled[index + 1 :]:
            if day != other_day:
                continue
            assert end <= other_start or start >= other_end


def test_study_plan_is_deterministic(demo):
    client = demo["client"]
    first = client.get("/api/study-plan").json()
    second = client.get("/api/study-plan").json()
    assert first["blocks"] == second["blocks"]
    assert first["summary"] == second["summary"]


def test_study_plan_ics_export(demo):
    client = demo["client"]
    response = client.get("/api/study-plan/ics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    assert response.headers["x-clashfree-study-blocks"] == "7"
    body = response.text
    assert body.count("BEGIN:VEVENT") == 7
    assert body.count("X-CLASHFREE-STUDY:") == 7
    assert "RRULE:FREQ=WEEKLY" in body
    assert "PRODID:-//ClashFree//Study Agent//EN" in body


def test_notifications_and_email_digest(demo):
    client = demo["client"]
    payload = client.get("/api/notifications").json()

    kinds = [item["kind"] for item in payload["notifications"]]
    assert kinds.count("clash") == 2
    assert "unparsed" in kinds
    assert "approval" in kinds
    assert "study" in kinds
    assert payload["unread"] == 4

    email = payload["email"]
    assert "Fall Semester 2026" in email["subject"]
    assert "7 subjects" in email["subject"]
    assert "Hii buddy" in email["text"]
    assert "PHY 101" in email["text"]
    assert "Study:" in email["text"]
    assert "YOUR CLASSES AND STUDY BLOCKS" in email["text"]
    assert email["courseCount"] == 7
    assert email["blockCount"] == 7
    assert payload["courses"][0]["course_code"] == "CS 201"


def test_email_digest_is_written_to_outbox_when_smtp_is_missing(demo):
    client = demo["client"]
    result = client.post("/api/notifications/email/send", json={}).json()
    assert result["status"] == "queued"
    assert result["delivery"] == "outbox"
    assert result["file"].endswith(".eml")

    path = OUTBOX_DIR / result["file"]
    assert path.exists()
    raw = path.read_bytes()
    assert b"Subject:" in raw
    assert b"Hii buddy" in raw

    download = client.get("/api/notifications/email/download")
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("message/rfc822")
    assert b"X-ClashFree-Digest" in download.content
