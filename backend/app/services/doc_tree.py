"""Build nested doc tree from flat rows."""

from __future__ import annotations

from typing import Any

from app.schemas.docs import DocTreeNodeOut


def build_tree(rows: list[Any]) -> list[DocTreeNodeOut]:
    by_id: dict[str, dict[str, Any]] = {}
    for r in rows:
        by_id[r.id] = {
            "id": r.id,
            "slug": r.slug,
            "title": r.title,
            "nav_section": r.nav_section,
            "parent_id": r.parent_id,
            "sort_order": r.sort_order,
            "children": [],
        }

    roots: list[dict[str, Any]] = []
    for _pid, node in by_id.items():
        p = node["parent_id"]
        if p and p in by_id:
            by_id[p]["children"].append(node)
        else:
            roots.append(node)

    def sort_key(n: dict[str, Any]) -> tuple:
        return (n["nav_section"], n["sort_order"], n["title"])

    def walk(n: dict[str, Any]) -> DocTreeNodeOut:
        n["children"].sort(key=sort_key)
        return DocTreeNodeOut(
            id=n["id"],
            slug=n["slug"],
            title=n["title"],
            nav_section=n["nav_section"],
            children=[walk(c) for c in n["children"]],
        )

    roots.sort(key=sort_key)
    return [walk(n) for n in roots]
