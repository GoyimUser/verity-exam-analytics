"""Spreadsheet text safety shared by examination and study reports."""


def safe_cell(value):
    # Preserve numeric negative scores; CSV quoting alone does not stop formulas.
    return "'"+value if isinstance(value,str) and value.lstrip().startswith(('=','+','-','@')) else value
