from app.schemas.notebook import NotebookCell
from app.services.notebook_planner import plan_notebook_sections


def test_plan_notebook_sections_uses_headings_when_ai_unavailable():
    cells = [
        NotebookCell(index=0, cell_type="markdown", source="# Notebook"),
        NotebookCell(index=1, cell_type="markdown", source="## Load data"),
        NotebookCell(index=2, cell_type="code", source='df = pd.read_csv("sales.csv")'),
        NotebookCell(index=3, cell_type="markdown", source="## Analyze revenue"),
        NotebookCell(index=4, cell_type="code", source='df.groupby("region").sum()'),
    ]

    sections = plan_notebook_sections(cells, "Revenue notebook", ai_section_planner=None)

    assert [section.name for section in sections] == ["Load data", "Analyze revenue"]
    assert sections[0].cell_indices == [1, 2]
    assert sections[1].cell_indices == [3, 4]


def test_plan_notebook_sections_prefers_ai_plan_when_valid():
    cells = [
        NotebookCell(index=0, cell_type="code", source='df = pd.read_csv("sales.csv")'),
        NotebookCell(index=1, cell_type="code", source='df["revenue"] = df["units"] * df["price"]'),
        NotebookCell(index=2, cell_type="code", source='df.groupby("region").sum()'),
    ]

    def fake_ai_planner(*_args, **_kwargs):
        return [
            {
                "id": "sec_ingest",
                "name": "Ingest sales",
                "purpose": "Load the source sales data.",
                "cell_indices": [0],
            },
            {
                "id": "sec_model",
                "name": "Model revenue",
                "purpose": "Compute and summarize revenue.",
                "cell_indices": [1, 2],
            },
        ]

    sections = plan_notebook_sections(cells, "Revenue notebook", ai_section_planner=fake_ai_planner)

    assert [section.name for section in sections] == ["Ingest sales", "Model revenue"]
    assert sections[0].id == "sec_ingest"
    assert sections[1].cell_indices == [1, 2]
