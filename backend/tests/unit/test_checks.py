"""Tests for app.analysis.checks — pipeline validation helpers."""
import pandas as pd
import pytest

from app.analysis.checks import (
    CheckError,
    assert_columns_exist,
    assert_dtypes,
    assert_in_range,
    assert_no_explode,
    assert_no_nulls,
    assert_no_shrink,
    assert_positive,
    assert_row_count,
    assert_same_shape,
    assert_unique,
)


@pytest.fixture
def sample_df():
    return pd.DataFrame({
        "country": ["US", "UK", "DE"],
        "year": [2020, 2021, 2022],
        "gdp": [21.0, 2.7, 3.8],
    })


# -- assert_no_explode -------------------------------------------------------

class TestAssertNoExplode:
    def test_passes_within_factor(self, sample_df):
        bigger = pd.concat([sample_df, sample_df.iloc[:1]])  # 4 rows from 3 = 1.33×
        assert_no_explode(bigger, sample_df)  # default factor=2.0

    def test_fails_when_exploded(self, sample_df):
        exploded = pd.concat([sample_df] * 5)  # 15 rows from 3 = 5×
        with pytest.raises(CheckError, match="Row explosion"):
            assert_no_explode(exploded, sample_df)

    def test_custom_factor(self, sample_df):
        doubled = pd.concat([sample_df, sample_df])
        with pytest.raises(CheckError):
            assert_no_explode(doubled, sample_df, factor=1.5)

    def test_empty_reference(self, sample_df):
        empty = pd.DataFrame(columns=sample_df.columns)
        assert_no_explode(sample_df, empty)  # should not raise


# -- assert_no_shrink ---------------------------------------------------------

class TestAssertNoShrink:
    def test_passes_within_factor(self, sample_df):
        smaller = sample_df.iloc[:2]  # 2/3 = 0.67
        assert_no_shrink(smaller, sample_df)  # default factor=0.5

    def test_fails_when_shrunk(self, sample_df):
        tiny = sample_df.iloc[:1]  # 1/3 = 0.33
        with pytest.raises(CheckError, match="Row shrink"):
            assert_no_shrink(tiny, sample_df)


# -- assert_row_count ---------------------------------------------------------

class TestAssertRowCount:
    def test_passes_in_range(self, sample_df):
        assert_row_count(sample_df, min=1, max=100)

    def test_fails_too_few(self, sample_df):
        with pytest.raises(CheckError, match="Too few rows"):
            assert_row_count(sample_df, min=10)

    def test_fails_too_many(self, sample_df):
        with pytest.raises(CheckError, match="Too many rows"):
            assert_row_count(sample_df, max=2)


# -- assert_no_nulls ----------------------------------------------------------

class TestAssertNoNulls:
    def test_passes_no_nulls(self, sample_df):
        assert_no_nulls(sample_df)

    def test_fails_with_nulls(self):
        df = pd.DataFrame({"a": [1, None, 3], "b": [4, 5, None]})
        with pytest.raises(CheckError, match="Null values found"):
            assert_no_nulls(df)

    def test_specific_columns(self):
        df = pd.DataFrame({"a": [1, None, 3], "b": [4, 5, 6]})
        assert_no_nulls(df, columns=["b"])  # b has no nulls
        with pytest.raises(CheckError):
            assert_no_nulls(df, columns=["a"])

    def test_missing_column(self, sample_df):
        with pytest.raises(CheckError, match="Columns not found"):
            assert_no_nulls(sample_df, columns=["nonexistent"])


# -- assert_unique ------------------------------------------------------------

class TestAssertUnique:
    def test_passes_unique(self, sample_df):
        assert_unique(sample_df, columns=["country"])

    def test_fails_with_duplicates(self):
        df = pd.DataFrame({"a": [1, 1, 2], "b": [3, 4, 5]})
        with pytest.raises(CheckError, match="Duplicate rows"):
            assert_unique(df, columns=["a"])

    def test_composite_key(self, sample_df):
        assert_unique(sample_df, columns=["country", "year"])


# -- assert_columns_exist ----------------------------------------------------

class TestAssertColumnsExist:
    def test_passes_all_present(self, sample_df):
        assert_columns_exist(sample_df, ["country", "year"])

    def test_fails_missing(self, sample_df):
        with pytest.raises(CheckError, match="Missing columns"):
            assert_columns_exist(sample_df, ["country", "population"])


# -- assert_dtypes ------------------------------------------------------------

class TestAssertDtypes:
    def test_passes_correct_types(self):
        df = pd.DataFrame({"val": [1.0, 2.0], "name": ["a", "b"]})
        assert_dtypes(df, {"val": "float", "name": "object"})

    def test_fails_wrong_type(self):
        df = pd.DataFrame({"val": [1, 2]})
        with pytest.raises(CheckError, match="expected float"):
            assert_dtypes(df, {"val": "float"})

    def test_missing_column(self):
        df = pd.DataFrame({"val": [1]})
        with pytest.raises(CheckError, match="not found"):
            assert_dtypes(df, {"missing": "int"})


# -- assert_in_range ----------------------------------------------------------

class TestAssertInRange:
    def test_passes_in_range(self, sample_df):
        assert_in_range(sample_df, "gdp", min=0, max=100)

    def test_fails_below_min(self, sample_df):
        with pytest.raises(CheckError, match="below minimum"):
            assert_in_range(sample_df, "gdp", min=5.0)

    def test_fails_above_max(self, sample_df):
        with pytest.raises(CheckError, match="above maximum"):
            assert_in_range(sample_df, "gdp", max=3.0)


# -- assert_positive ----------------------------------------------------------

class TestAssertPositive:
    def test_passes_positive(self, sample_df):
        assert_positive(sample_df, ["gdp"])

    def test_fails_negative(self):
        df = pd.DataFrame({"val": [1, -2, 3]})
        with pytest.raises(CheckError, match="below minimum"):
            assert_positive(df, ["val"])


# -- assert_same_shape --------------------------------------------------------

class TestAssertSameShape:
    def test_passes_same_shape(self, sample_df):
        assert_same_shape(sample_df, sample_df)

    def test_fails_different_rows(self, sample_df):
        with pytest.raises(CheckError, match="Row count mismatch"):
            assert_same_shape(sample_df.iloc[:2], sample_df)

    def test_fails_different_cols(self, sample_df):
        with pytest.raises(CheckError, match="Column count mismatch"):
            assert_same_shape(sample_df[["country"]], sample_df)

    def test_skip_row_check(self, sample_df):
        assert_same_shape(sample_df.iloc[:2], sample_df, check_rows=False)


# -- Integration: CheckError in runner subprocess ----------------------------

class TestCheckErrorInRunner:
    """Verify that CheckError flows through the subprocess runner cleanly."""

    def test_runner_surfaces_check_error(self):
        """Simulate what the runner does with a CheckError."""
        from app.analysis.executor import execute_node
        code = (
            "from sdw_checks import assert_row_count\n"
            "import pandas as pd\n"
            "df_out = pd.DataFrame({'a': [1, 2, 3]})\n"
            "assert_row_count(df_out, max=2)\n"
        )
        result = execute_node(code, {})
        assert not result.ok
        assert "Validation failed" in (result.error or "")
        assert "Too many rows" in (result.error or "")
