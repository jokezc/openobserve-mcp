function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function maskSensitiveData(value, maskFields) {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, maskFields));
  }

  if (!isObject(value)) {
    return value;
  }

  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (maskFields.includes(key.toLowerCase())) {
      result[key] = "***";
      continue;
    }

    result[key] = maskSensitiveData(nestedValue, maskFields);
  }

  return result;
}
