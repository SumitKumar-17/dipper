import { describe, expect, test } from "bun:test";
import { parseSelect } from "./parse-select";

describe("parseSelect", () => {
  test("an ordinary query with every clause parses", () => {
    const parsed = parseSelect(
      "select a, count(*) from t join u on u.id = t.u_id where a > 1 group by a having count(*) > 1 order by a limit 5 offset 2",
      "postgres",
    );
    expect(parsed.kind).toBe("select");
  });

  test("a trailing semicolon and FETCH FIRST are still understood", () => {
    expect(parseSelect("select * from t fetch first 3 rows only;", "postgres").kind).toBe("select");
  });

  test("a construct the walk does not model is refused, naming the word", () => {
    const parsed = parseSelect("select * from t tablesample bernoulli (10) where x = 1", "postgres");
    expect(parsed.kind).toBe("unsupported");
    if (parsed.kind === "unsupported") expect(parsed.reason).toContain("bernoulli");
  });

  test("QUALIFY is refused rather than dropped", () => {
    const parsed = parseSelect("select * from t qualify row_number() over () = 1", "postgres");
    expect(parsed.kind).toBe("unsupported");
  });

  test("MySQL LIMIT offset, count reads both numbers", () => {
    const parsed = parseSelect("select * from t limit 5, 10", "mysql");
    expect(parsed.kind === "select" && [parsed.limitValue, parsed.offsetValue]).toEqual([10, 5]);
  });

  test("LIMIT and OFFSET in the standard order are unchanged", () => {
    const parsed = parseSelect("select * from t limit 10 offset 5", "postgres");
    expect(parsed.kind === "select" && [parsed.limitValue, parsed.offsetValue]).toEqual([10, 5]);
  });
});
