from __future__ import annotations

import re
from typing import Callable, Iterable

from app.schemas.notebook import NotebookAnalysis, NotebookCell, NotebookSection


def _heading(cell: NotebookCell) -> tuple[int, str] | None:
    if cell.cell_type != "markdown":
        return None
    match = re.match(r"^(#{1,6})\s+(.+)$", cell.source.strip(), flags=re.MULTILINE)
    if not match:
        return None
    return len(match.group(1)), match.group(2).strip()


def _default_sections(cells: list[NotebookCell]) -> list[NotebookSection]:
    headings = [(cell, _heading(cell)) for cell in cells]
    headings = [(cell, heading) for cell, heading in headings if heading]
    if headings:
      target_level = 2 if any(level == 2 for _, (level, _) in headings) else headings[0][1][0]
      filtered = [(cell, title) for cell, (level, title) in headings if level == target_level]
      sections: list[NotebookSection] = []
      for index, (cell, title) in enumerate(filtered):
          next_cell = filtered[index + 1][0] if index + 1 < len(filtered) else None
          section_cells = [c.index for c in cells if c.index >= cell.index and (next_cell is None or c.index < next_cell.index)]
          sections.append(NotebookSection(
              id=f"sec_{index + 1}",
              name=title,
              purpose=f"Notebook section: {title}",
              cell_indices=section_cells,
          ))
      if sections:
          return sections

    code_cells = [cell for cell in cells if cell.cell_type == "code"]
    if not code_cells:
        return []

    chunks: list[list[int]] = []
    current: list[int] = []
    boundary_tokens = ("read_csv", "read_excel", "to_csv", "to_excel", "plot", "plt.", "sns.", "gspread")
    for cell in cells:
        current.append(cell.index)
        if cell.cell_type == "code" and any(token in cell.source for token in boundary_tokens):
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)

    return [
        NotebookSection(
            id=f"sec_{index + 1}",
            name=f"Stage {index + 1}",
            purpose="Notebook processing stage",
            cell_indices=chunk,
        )
        for index, chunk in enumerate(chunks) if chunk
    ]


def analyze_notebook(cells: list[NotebookCell], sections: list[NotebookSection] | None = None) -> NotebookAnalysis:
    code_cells = [cell for cell in cells if cell.cell_type == "code"]
    markdown_cells = [cell for cell in cells if cell.cell_type == "markdown"]
    output_cell_count = sum(
        1
        for cell in code_cells
        if any(token in cell.source for token in ("plot", "plt.", "sns.", ".head(", "display(", "describe(", "value_counts("))
    )
    export_cell_count = sum(
        1
        for cell in code_cells
        if any(token in cell.source for token in ("to_csv", "to_excel", "to_parquet", "to_json", "gspread", "open_by_url"))
    )
    section_count = len(sections or [])
    complexity_score = len(code_cells) + output_cell_count + export_cell_count + max(section_count - 3, 0)
    if complexity_score > 20 or len(code_cells) > 18:
        tier = "large"
    elif complexity_score > 9 or len(code_cells) > 8:
        tier = "medium"
    else:
        tier = "small"

    return NotebookAnalysis(
        total_cells=len(cells),
        code_cell_count=len(code_cells),
        markdown_cell_count=len(markdown_cells),
        output_cell_count=output_cell_count,
        export_cell_count=export_cell_count,
        stage_count=section_count,
        complexity_tier=tier,
    )


def plan_notebook_sections(
    cells: list[NotebookCell],
    pipeline_name: str,
    ai_section_planner: Callable[[list[NotebookCell], str], Iterable[dict]] | None,
) -> list[NotebookSection]:
    fallback = _default_sections(cells)
    if ai_section_planner is None:
        return fallback

    try:
        raw_sections = list(ai_section_planner(cells, pipeline_name))
        planned = [NotebookSection.model_validate(section) for section in raw_sections]
        valid = [section for section in planned if section.cell_indices]
        return valid or fallback
    except Exception:
        return fallback
