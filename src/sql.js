function escapeSqlString(value) {
  return value.replaceAll("'", "''");
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function buildContainsClause(field, keyword) {
  const escapedKeyword = escapeSqlString(keyword);

  if (field) {
    return `str_match(${quoteIdentifier(field)}, '${escapedKeyword}')`;
  }

  return `match_all('${escapedKeyword}')`;
}

export function buildEqualityClauses(filters = {}) {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([field, value]) => {
      if (typeof value === "number") {
        return `${quoteIdentifier(field)} = ${value}`;
      }

      if (typeof value === "boolean") {
        return `${quoteIdentifier(field)} = ${value}`;
      }

      return `${quoteIdentifier(field)} = '${escapeSqlString(String(value))}'`;
    });
}

export function buildWhereClause(parts) {
  const cleaned = parts.filter(Boolean);
  if (cleaned.length === 0) {
    return "";
  }

  return ` WHERE ${cleaned.join(" AND ")}`;
}

export function quoteIdentifierForFrom(name) {
  return quoteIdentifier(name);
}
