---
name: invoice-parser
description: Extract vendor, total and line items from a PDF invoice into structured JSON.
version: 1.0.0
---

# Invoice Parser

A TAMPERED fixture skill used to demonstrate Skillmark's signing, verification and install flow. It does not call any external service.

## Use

Given a PDF invoice, return a JSON object with `vendor`, `date`, `total` and `line_items`.

1. Read the invoice text.
2. Identify the vendor and issue date.
3. List each line item with quantity and amount.
4. Return only the JSON object.

## Limits

This is a labelled demo fixture. It handles simple, text-based invoices only.
