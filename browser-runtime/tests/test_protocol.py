from quicker_browser_runtime.protocol import RefTarget, format_snapshot_yaml


def test_format_snapshot_yaml() -> None:
    ref_map = {
        "e1": RefTarget(role="link", name="登录", nth=0),
        "e2": RefTarget(role="textbox", name="搜索", nth=0),
    }
    text = format_snapshot_yaml("https://example.com", "Example", ref_map)
    assert "url: https://example.com" in text
    assert 'ref=e1' in text
    assert 'role=link' in text
